"""Recover saved research originals that do not yet appear in the course archive."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from PIL import Image
from library import Library, ROOT

PROJECT = ROOT.parent
OUTPUT = PROJECT / 'outputs'


def load(path):
    return json.loads(path.read_text()) if path.is_file() else {}


def from_baigolf(directory, cid):
    manifest = load(directory / 'guide-source.json')
    for image in directory.glob('guide-[0-9][0-9].jpg'):
        yield cid, image, manifest.get('sourceUrl', ''), 'online-guide'


def candidates():
    five = OUTPUT / 'shanghai-five-gps'
    courses = {'huakai': '565', 'links': '567', 'meilan-masters': '569',
               'meilan-nicklaus': '9127', 'qizhong': '571', 'tianma': '577'}
    for slug, number in courses.items():
        yield from from_baigolf(five / slug, 'cn_bg_' + number)
    six = OUTPUT / 'shanghai-six-gps-20261106'
    for number in ('2529', '575', '587', '579', '3981', '2533'):
        cid = 'cn_bg_' + number
        yield from from_baigolf(six / cid, cid)
    four = OUTPUT / 'four-clubs-gps-20261106'
    for slug, number in {'xubao': '583', 'tianhong': '581', 'meilan-nicklaus': '9127', 'meilan-masters': '569'}.items():
        folder = four / slug
        source = load(folder / 'sources.json')
        official = next((r['url'] for r in source.get('identityReferences', [])
                         if 'silport.com.cn' in r.get('url', '')), '')
        for image in (folder / 'guides').iterdir():
            if not re.fullmatch(r'(?:greenon-.+|public-photo-.+|coursemap(?:-large)?|(?:North|West|center|east)\d+)\.(?:jpg|gif|png)', image.name, re.I):
                continue
            if 'contact' in image.name or 'retry' in image.name:
                continue
            from_club = slug == 'xubao' and not image.name.startswith(('greenon-', 'public-photo-'))
            yield 'cn_bg_' + number, image, official if from_club else '', 'online-guide'
    for image in (four / 'research').glob('tianhong-layout-[0-9][0-9].jpg'):
        yield 'cn_bg_581', image, 'https://sports.sina.com.cn/golf/course/sh/tianhongmingrenclub/temp/', 'online-guide'
    early = OUTPUT / 'five-clubs-gps-20261106/research'
    extras = [
        ('565', early / 'huakai-layout.jpg', ''),
        ('565', early / 'core-huakai.png', 'https://www.golfcore.org/courses/sino-bay-country-sports-club/'),
        ('567', early / 'public-links-app.png', ''),
        ('567', early / 'public-links-guest.png', ''),
        ('579', six / 'xiehe-guide01-large.jpg', ''),
        ('2525', OUTPUT / 'sheshan-gps/research/satellite-original.jpg', ''),
        ('585', OUTPUT / 'yintao-hole1/research/esri-area.jpg', ''),
        ('585', OUTPUT / 'yintao-hole1/research/esri-hole1.jpg', ''),
    ]
    for number, image, url in extras:
        role = 'satellite' if 'satellite-original' in image.name or image.name.startswith('esri-') else 'online-guide'
        yield 'cn_bg_' + number, image, url, role


def archive(apply):
    lib = Library()
    known = {(r[0], r[1]) for r in lib.db.execute('''SELECT course_id,asset_sha FROM reference_files
        UNION SELECT v.course_id,f.asset_sha FROM gps_files f JOIN gps_versions v ON v.id=f.version_id''')}
    repairs = []
    # GIFs saved by earlier versions were served as text. Inspect signatures before repair.
    for sha, head, tail in lib.db.execute('''SELECT sha256,substr(body,1,10),substr(body,-1) FROM assets
            WHERE mime NOT LIKE 'image/%' AND substr(body,1,6) IN (x'474946383761',x'474946383961')'''):
        if len(head) == 10 and tail == b';':
            repairs.append((*struct.unpack('<HH', head[6:10]), sha))
    if apply:
        with lib.db:
            lib.db.executemany("UPDATE assets SET mime='image/gif',width=?,height=? WHERE sha256=?", repairs)
    added, skipped = [], []
    for cid, image, url, role in candidates():
        if not image.is_file():
            continue
        sha = hashlib.sha256(image.read_bytes()).hexdigest()
        if (cid, sha) in known:
            continue
        try:
            with Image.open(image) as bitmap:
                if bitmap.format not in {'JPEG', 'PNG', 'GIF', 'WEBP'}:
                    continue
                bitmap.load()
                if bitmap.format == 'GIF' and not image.read_bytes().endswith(b';'):
                    raise ValueError('incomplete GIF')
        except (OSError, ValueError):
            skipped.append(str(image.relative_to(PROJECT)))
            continue
        if apply:
            lib.reference(cid, None, image, role, url, {
                'note': '制作过程中保存的参考资料，按原来源归档。',
                'projectPath': str(image.relative_to(PROJECT))
            })
        known.add((cid, sha))
        added.append({'courseId': cid, 'file': str(image.relative_to(PROJECT)), 'sha256': sha, 'sourceUrl': url})
    lib.close()
    return {'applied': apply, 'gifRepairs': len(repairs), 'newImages': added, 'unreadableCandidates': skipped}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    options = parser.parse_args()
    print(json.dumps(archive(options.apply), ensure_ascii=False, indent=2))
