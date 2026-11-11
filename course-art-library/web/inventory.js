'use strict';

let inventoryRows = [], inventoryPage = 0, inventoryRequest = 0;
let resourceData = null, resourceLimit = 30, resourceRequest = 0;
const inventoryPageSize = 35;
const groupLabels = {
  guide: '球道导览与参考原图', satellite: '卫星影像', style: '画风样板',
  review: '定位与制作核对图', preview: '成品与预览', document: '数据与制作文件', media: '小程序底图与瓦片'
};

async function showInventory() {
  $('#courseTitle').textContent = '球场总表';
  $('#courseInfo').textContent = '查看各球场的地图进度、参考图与制作档案。';
  const request = ++inventoryRequest;
  if (!inventoryRows.length) $('#inventoryCount').textContent = '正在读取图库…';
  const rows = await api('/api/inventory');
  if (request !== inventoryRequest || libraryMode !== 'inventory') return;
  inventoryRows = rows;
  const province = $('#inventoryProvince').value;
  const provinces = [...new Set(rows.map(row => row.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  $('#inventoryProvince').replaceChildren(new Option('全部省份', ''), ...provinces.map(name => new Option(name, name)));
  $('#inventoryProvince').value = province;
  renderInventory();
}

function courseButton(label, row, mode, tone = '') {
  const button = el('button', 'table-link ' + tone, label);
  button.onclick = safe(async () => {
    await openCourse(row.id, mode);
    window.scrollTo(0, 0);
  });
  return button;
}

function renderInventory() {
  const province = $('#inventoryProvince').value;
  const query = $('#inventorySearch').value.trim().toLowerCase();
  const status = $('#inventoryStatus').value;
  const scoped = inventoryRows.filter(row => !province || row.province === province);
  const hasFullGps = row => row.hole_count > 0 && row.gps_count === row.hole_count;
  const filters = {
    hasData: row => row.gps_available || row.art_count || row.reference_count || row.reference_images,
    missingGps: row => !hasFullGps(row),
    overviewOnly: row => row.has_overview && !row.gps_count,
    missingOverview: row => !row.has_overview,
    missingArt: row => !row.hole_count || row.art_count < row.hole_count,
    missingGuide: row => !row.guide_images,
    pendingTee: row => row.pending_tee_count > 0
  };
  const rows = scoped.filter(row => (!status || filters[status](row)) &&
    [row.name, row.name_en, row.id, row.province, row.city, ...row.aliases].join(' ').toLowerCase().includes(query));
  const tiles = [
    ['球场及分场', scoped.length],
    ['完整逐洞 GPS', scoped.filter(hasFullGps).length],
    ['缺逐洞 GPS', scoped.filter(row => !hasFullGps(row)).length],
    ['有参考图的球场', scoped.filter(row => row.reference_images).length]
  ];
  $('#inventorySummary').replaceChildren(...tiles.map(([label, count]) => {
    const tile = el('div', 'inventory-stat');
    tile.append(el('b', '', count), el('span', '', label));
    return tile;
  }));
  const pages = Math.max(1, Math.ceil(rows.length / inventoryPageSize));
  inventoryPage = Math.min(inventoryPage, pages - 1);
  const start = inventoryPage * inventoryPageSize;
  $('#inventoryCount').textContent = `符合条件 ${rows.length} 个 · 参考图按文件内容去重，包含导览、卫星与样板`;
  $('#inventoryRows').replaceChildren(...rows.slice(start, start + inventoryPageSize).map(row => {
    const tr = el('tr');
    const name = el('th', 'inventory-name');
    name.scope = 'row';
    name.append(courseButton(row.name, row, 'resources'), el('small', '', row.id));
    tr.append(name);
    const cell = (value, cls) => {
      const td = el('td', cls);
      if (typeof value === 'string') td.textContent = value;
      else td.append(value);
      tr.append(td);
      return td;
    };
    cell(row.province || row.city || '—');
    cell(String(row.hole_count || '—'));
    cell(row.has_overview ? courseButton('已有', row, 'gps', 'good') : '缺', row.has_overview ? '' : 'missing');
    const gps = cell(row.gps_count ? courseButton(`${row.gps_count}/${row.hole_count} 洞`, row, 'gps', hasFullGps(row) ? 'good' : 'partial') : '缺', row.gps_count ? '' : 'missing');
    if (row.gps_versions) gps.append(el('small', '', `当前 v${row.gps_version} · 共 ${row.gps_versions} 版`));
    cell(row.art_count ? courseButton(`${row.art_count}/${row.hole_count} 洞`, row, 'art', 'good') : '缺', row.art_count ? '' : 'missing');
    const refs = cell(courseButton(`${row.reference_images} 张`, row, 'resources', row.reference_images ? 'good' : ''));
    if (row.guide_images) refs.append(el('small', '', `其中导览 ${row.guide_images} 张`));
    const gaps = [];
    if (!row.has_overview) gaps.push('GPS 总览');
    if (!hasFullGps(row)) gaps.push('逐洞 GPS');
    if (!row.hole_count || row.art_count < row.hole_count) gaps.push('精修图');
    if (!row.guide_images) gaps.push('球道导览');
    if (row.pending_tee_count) gaps.push(`${row.pending_tee_count} 洞发球点待核对`);
    cell(gaps.join(' · ') || '齐全', 'inventory-gaps');
    return tr;
  }));
  $('#inventoryPage').textContent = `${inventoryPage + 1} / ${pages} 页`;
  $('#inventoryPrev').disabled = inventoryPage === 0;
  $('#inventoryNext').disabled = inventoryPage + 1 >= pages;
}

async function showResources(selected) {
  const request = ++resourceRequest;
  $('#resourceBody').classList.add('hidden');
  $('#resourceStatus').textContent = selected ? '正在读取球场资料…' : '请从球场总表选择球场。';
  if (!selected) return;
  $('#courseTitle').textContent = selected.name;
  $('#courseInfo').textContent = `${selected.province || ''} · ${selected.holes.length} 洞档案`;
  const data = await api('/api/resources?id=' + encodeURIComponent(selected.id));
  if (request !== resourceRequest || libraryMode !== 'resources' || course?.id !== selected.id) return;
  resourceData = data;
  resourceLimit = 30;
  $('#resourceStatus').textContent = data.files.length
    ? '点击图片查看原件。资料来自球洞档案与 GPS 当前及历史版本。'
    : '此球场只有目录资料，尚未归档参考文件。';
  $('#resourceSearch').value = '';
  const groupCounts = new Map();
  for (const item of data.files) groupCounts.set(item.group, (groupCounts.get(item.group) || 0) + 1);
  $('#resourceGroup').replaceChildren(new Option(`全部文件（${data.files.length}）`, ''),
    ...Object.entries(groupLabels).filter(([key]) => groupCounts.has(key)).map(([key, label]) => new Option(`${label}（${groupCounts.get(key)}）`, key)));
  $('#resourceGroup').value = groupCounts.has('guide') ? 'guide' : groupCounts.has('satellite') ? 'satellite' : '';
  $('#sourceSummary').textContent = `网页来源（${data.links.length}）`;
  $('#resourceSources').open = !data.files.length && !!data.links.length;
  $('#sourceLinks').replaceChildren(...data.links.map(source => {
    const li = el('li');
    li.append(webLink(source.url, source.label || new URL(source.url).hostname), el('small', '', source.url));
    return li;
  }));
  if (!data.links.length) $('#sourceLinks').append(el('li', 'muted', '未记录网页链接'));
  const {address, phone, par, nameEn} = data.catalog;
  $('#catalogSummary').textContent = [nameEn, address, phone, par ? `标准杆 ${par}` : ''].filter(Boolean).join(' · ');
  $('#catalogData').textContent = JSON.stringify(data.catalog, null, 2);
  const gpsHoles = new Set(data.gpsHoles);
  $('#holeCoverage').replaceChildren(...selected.holes.map(hole => {
    const row = el('tr');
    const name = el('td');
    const button = el('button', 'table-link', `${hole.segment_name || ''} ${hole.label}`.trim());
    button.onclick = safe(() => openHole(hole.id));
    name.append(button);
    row.append(name, ...[hole.par || '—', gpsHoles.has(hole.id) ? '已有' : '缺',
      hole.version_id ? '已有' : '缺', hole.reference_count].map(value => el('td', '', value)));
    return row;
  }));
  $('#resourceBody').classList.remove('hidden');
  renderResources();
}

function webLink(url, label) {
  const link = el('a', '', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderResources() {
  if (!resourceData) return;
  const group = $('#resourceGroup').value;
  const query = $('#resourceSearch').value.trim().toLowerCase();
  const files = resourceData.files.filter(file => (!group || file.group === group) &&
    [file.filename, ...file.paths, ...file.holes, ...file.source_urls, file.note].join(' ').toLowerCase().includes(query));
  $('#resourceCount').textContent = files.length ? `显示 ${Math.min(resourceLimit, files.length)} / ${files.length} 份资料` : '没有符合条件的存档文件';
  $('#resourceMore').classList.toggle('hidden', resourceLimit >= files.length);
  $('#resourceGrid').replaceChildren(...files.slice(0, resourceLimit).map(file => {
    const card = el('article', 'resource-card');
    const local = '/asset/' + file.asset_sha;
    const image = file.mime.startsWith('image/');
    if (image) {
      const link = webLink(local, '');
      const thumb = el('img');
      thumb.src = local;
      thumb.alt = file.filename;
      thumb.loading = 'lazy';
      link.append(thumb);
      card.append(link);
    }
    card.append(el('b', '', file.filename), el('small', '', [groupLabels[file.group], ...file.holes].join(' · ')));
    if (file.versions.length) card.append(el('small', '', `GPS 存档 v${file.versions.join('、v')}${file.current ? ' · 含当前版' : ''}`));
    if (file.note) card.append(el('small', '', String(file.note)));
    const actions = el('div', 'resource-actions');
    actions.append(webLink(local + (image ? '' : '?download=1'), image ? '查看原图' : '下载文件'));
    for (const url of file.source_urls) actions.append(webLink(url, '来源网页'));
    card.append(actions);
    return card;
  }));
}

for (const id of ['inventorySearch', 'inventoryProvince', 'inventoryStatus']) {
  $('#' + id).addEventListener(id === 'inventorySearch' ? 'input' : 'change', () => {
    inventoryPage = 0;
    renderInventory();
  });
}
$('#inventoryPrev').onclick = () => { inventoryPage--; renderInventory(); };
$('#inventoryNext').onclick = () => { inventoryPage++; renderInventory(); };
$('#resourceMore').onclick = () => { resourceLimit += 30; renderResources(); };
$('#resourceGroup').onchange = $('#resourceSearch').oninput = () => { resourceLimit = 30; renderResources(); };

safe(async () => {
  token = (await api('/api/config')).token;
  courses = await api('/api/courses');
  const query = new URLSearchParams(location.search);
  const selected = courses.find(row => row.id === query.get('course'));
  const preferred = selected || courses.find(row => row.id === 'cn_bg_611') || courses[0];
  renderCourses();
  if (preferred) await openCourse(preferred.id, selected ? 'resources' : 'inventory');
  else await showLibraryMode();
})();
