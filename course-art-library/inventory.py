"""Read the course inventory from the same SQLite archive used by the library."""
import json
import re
from pathlib import PurePosixPath
from urllib.parse import urlsplit


REFERENCE_GROUPS = {'guide', 'satellite', 'style'}


def asset_group(path, mime, role=''):
    if not mime.startswith('image/'):
        return 'document'
    path = path.lower()
    name = PurePosixPath(path).name
    if role == 'style':
        return 'style'
    if role == 'gps-atlas-preview' or path.startswith(('previews/', 'renders/', 'art/')):
        return 'preview'
    if path.startswith('media/'):
        return 'media'
    if re.search(r'endpoint|proof|review|trace|contact|registration|identity-|validation/|matching|candidates', path):
        return 'review'
    if role in {'diagram', 'official', 'online-guide'} or re.search(r'guide|coursemap|layout|greenon|official|public-photo|corrected-huakai-10', path):
        return 'guide'
    if role in {'satellite', 'gps-atlas', 'gps'} or re.search(r'satellite|surround|tee-hq|imagery|original-', path):
        return 'satellite'
    if role == 'overview' or name.startswith('overview'):
        return 'guide'
    return 'review'


def urls(value, label=''):
    """Extract recorded web links. Do not infer an image's URL from its filename."""
    if isinstance(value, dict):
        label = next((value[k] for k in ('role', 'title', 'name', 'description', 'source')
                      if isinstance(value.get(k), str) and value[k]), label)
        for key, item in value.items():
            if key.lower() not in {'apikey', 'token', 'secret', 'password'}:
                yield from urls(item, label)
    elif isinstance(value, list):
        for item in value:
            yield from urls(item, label)
    elif isinstance(value, str) and value.startswith(('https://', 'http://')):
        try:
            parsed = urlsplit(value)
            if parsed.hostname and not parsed.username and not re.search(
                r'(?:[?&])(?:api[_-]?key|token|secret|signature|sig|key|access_token|x-amz-[^=]*)=', value, re.I
            ) and not any(ch.isspace() for ch in value):
                yield value, label
        except ValueError:
            pass


def archived_files(lib, cid=None):
    sql = '''SELECT v.course_id, f.path, f.asset_sha, a.mime, v.number AS version,
                    v.id AS version_id, v.id = coalesce(g.version_id,'') AS current
             FROM gps_files f JOIN gps_versions v ON v.id=f.version_id
             JOIN assets a ON a.sha256=f.asset_sha
             LEFT JOIN current_gps g ON g.course_id=v.course_id'''
    return lib.rows(sql + (' WHERE v.course_id=?' if cid else '') +
                    ' ORDER BY current DESC, v.number DESC, f.path', (cid,) if cid else ())


def course_references(lib, cid=None):
    sql = '''SELECT r.course_id,r.hole_id,r.asset_sha,r.role,r.source_url,r.metadata,
                    a.filename,a.mime,h.label AS hole_label,h.ordinal,h.segment_name
             FROM reference_files r JOIN assets a ON a.sha256=r.asset_sha
             LEFT JOIN holes h ON h.id=r.hole_id'''
    return lib.rows(sql + (' WHERE r.course_id=?' if cid else '') +
                    ' ORDER BY h.ordinal, a.filename', (cid,) if cid else ())


def course_inventory(lib):
    rows = lib.courses()
    by_id = {row['id']: row for row in rows}
    images = {cid: set() for cid in by_id}
    guides = {cid: set() for cid in by_id}
    for ref in course_references(lib):
        group = asset_group(ref['filename'], ref['mime'], ref['role'])
        if group in REFERENCE_GROUPS:
            images[ref['course_id']].add(ref['asset_sha'])
        if group == 'guide':
            guides[ref['course_id']].add(ref['asset_sha'])
    for ref in archived_files(lib):
        group = asset_group(ref['path'], ref['mime'])
        if group in REFERENCE_GROUPS:
            images[ref['course_id']].add(ref['asset_sha'])
        if group == 'guide':
            guides[ref['course_id']].add(ref['asset_sha'])
    current = lib.rows('''SELECT c.id,c.payload,g.version_id,v.number,v.created_at,v.document,
        (SELECT count(*) FROM gps_versions gv WHERE gv.course_id=c.id) gps_versions
        FROM courses c LEFT JOIN current_gps g ON g.course_id=c.id
        LEFT JOIN gps_versions v ON v.id=g.version_id''')
    for entry in current:
        row = by_id[entry['id']]
        payload = json.loads(entry['payload'])
        doc = json.loads(entry['document']) if entry['document'] else {}
        pending = set(doc.get('pendingTeeHoles') or [])
        pending.update(h.get('_id') or h.get('id') for h in doc.get('holes', [])
                       if h.get('status') == 'draft_tee_uncertain')
        row.update(city=payload.get('city'), aliases=payload.get('aliases') or [],
                   name_en=payload.get('nameEn'), gps_version=entry['number'],
                   gps_versions=entry['gps_versions'], gps_saved_at=entry['created_at'],
                   has_overview=bool(doc.get('atlas') or doc.get('kind') == 'overview'),
                   pending_tee_count=len(pending - {None}),
                   reference_images=len(images[row['id']]), guide_images=len(guides[row['id']]))
    return rows


def resources(lib, cid):
    course = lib.db.execute('SELECT payload FROM courses WHERE id=?', (cid,)).fetchone()
    if not course:
        raise ValueError('未找到球场')
    refs, links, attached, by_version = {}, {}, [], {}

    def add_links(value, label=''):
        for url, title in urls(value, label):
            if url not in links or (title and not links[url]):
                links[url] = title

    payload = json.loads(course[0])
    add_links(payload.get('sources'))
    for row in course_references(lib, cid):
        metadata = json.loads(row.pop('metadata'))
        row['group'] = asset_group(row['filename'], row['mime'], row['role'])
        row['source_url'] = next((url for url, _ in urls(row['source_url'])), None)
        row['note'] = metadata.get('note') or metadata.get('description')
        row['retrieved_on'] = metadata.get('retrievedOn')
        key = (row['asset_sha'], row['group'])
        if key not in refs:
            refs[key] = dict(row, holes=[], source_urls=[], paths=[], versions=[], current=False)
        item = refs[key]
        if row['hole_id']:
            hole = f"{row['segment_name'] or ''} {row['hole_label']}".strip()
            if hole not in item['holes']:
                item['holes'].append(hole)
        if row['source_url'] and row['source_url'] not in item['source_urls']:
            item['source_urls'].append(row['source_url'])
        add_links(row['source_url'])
        add_links(metadata)

    for row in archived_files(lib, cid):
        group = asset_group(row['path'], row['mime'])
        key = (row['asset_sha'], group)
        if key not in refs:
            refs[key] = dict(row, group=group, filename=PurePosixPath(row['path']).name,
                             holes=[], source_urls=[], paths=[], versions=[])
        item = refs[key]
        if row['path'] not in item['paths']:
            item['paths'].append(row['path'])
        if row['version'] not in item['versions']:
            item['versions'].append(row['version'])
        item['current'] = bool(item['current'] or row['current'])
        name = PurePosixPath(row['path']).name
        by_version.setdefault((row['version_id'], name), set()).add(key)
        if name in {'sources.json', 'guide-source.json', 'club-guide-source.json', 'source.json',
                    'provenance.json', 'sources-log.json', 'imagery.json', 'source-provenance.json'}:
            attached.append(row['asset_sha'])

    def link_attachments(source, version):
        if not isinstance(source, dict):
            return
        for entry in source.get('identityReferences', []):
            if not isinstance(entry, dict):
                continue
            url = next((url for url, _ in urls(entry.get('url'))), None)
            names = {PurePosixPath(path).name for path in (entry.get('attachments') or []) if isinstance(path, str)}
            if not url:
                continue
            for name in names:
                matches = by_version.get((version, name), set())
                if len(matches) == 1:
                    item = refs[next(iter(matches))]
                    if url not in item['source_urls']:
                        item['source_urls'].append(url)

    gps_holes = []
    for row in lib.rows('''SELECT v.id,v.document, v.id=g.version_id AS current FROM gps_versions v
            LEFT JOIN current_gps g ON g.course_id=v.course_id
            WHERE v.course_id=? ORDER BY v.number DESC''', (cid,)):
        document = json.loads(row['document'])
        if row['current']:
            gps_holes = [h.get('_id') or h.get('id') for h in document.get('holes', [])]
        for key in ('sources', 'surround'):
            add_links(document.get(key))
        link_attachments(document.get('sources'), row['id'])
    for sha in dict.fromkeys(attached):
        row = lib.db.execute('SELECT body FROM assets WHERE sha256=? AND length(body)<=1048576', (sha,)).fetchone()
        if row:
            try:
                add_links(json.loads(row[0]))
            except (ValueError, UnicodeError):
                pass
    return {'catalog': payload, 'files': list(refs.values()), 'gpsHoles': gps_holes,
            'links': [{'url': url, 'label': label} for url, label in links.items()]}
