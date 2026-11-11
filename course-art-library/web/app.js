'use strict';
const $=s=>document.querySelector(s),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
let token,courses=[],course=null,hole=null,chosen=null,segment='all',timer;
let libraryMode='inventory',gpsSnapshot=null,gpsRequest=0,courseRequest=0;
async function api(url,data){const r=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json','X-Library-Token':token},body:JSON.stringify(data)}:{});const j=await r.json();if(!r.ok)throw Error(j.error||'操作失败');return j}
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),6000)}
function safe(fn){return(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>toast(e.message))}
function renderCourses(){const q=$('#search').value.trim().toLowerCase(),filtered=courses.filter(c=>(!$('#withFiles').checked||c.art_count||c.reference_count||c.gps_available)&&(!q||(c.name+c.province).toLowerCase().includes(q)));$('#courses').replaceChildren();for(const c of filtered){const b=el('button',c.id===course?.id?'active':'',c.name);b.append(el('small','',`${c.art_count} 洞精修 · ${c.gps_count||0} 洞 GPS · ${c.hole_count} 洞档案`));b.onclick=safe(()=>openCourse(c.id,libraryMode==='inventory'?'resources':libraryMode));$('#courses').append(b)}$('#stats').textContent=`${courses.length} 个球场档案 · ${courses.reduce((a,c)=>a+c.art_count,0)} 洞精修 · ${courses.reduce((a,c)=>a+(c.gps_count||0),0)} 洞 GPS`}
async function openCourse(id,mode){const request=++courseRequest;const result=await api('/api/course?id='+encodeURIComponent(id));if(request!==courseRequest)return;course=result;if(mode)libraryMode=mode;segment='all';$('#courseTitle').textContent=course.name;$('#courseInfo').textContent=`${course.province} · ${course.holes.length} 洞 · ${course.holes.filter(h=>h.version_id).length} 洞已有高精图`;renderCourses();$('#segments').replaceChildren();const choices=[['all','全部'],...new Map(course.holes.map(h=>[h.segment_id,h.segment_name])).entries()];for(const[id,name]of choices){const readable=({'OCEAN COURSE':'A 海景场','LAKE COURSE':'B 湖景场','QUARRY COURSE':'C 采石场'})[name]||name;const b=el('button',id===segment?'active':'',readable);b.dataset.segment=id;b.onclick=()=>{segment=id;for(const t of $('#segments').children)t.classList.toggle('active',t.dataset.segment===id);renderGrid()};$('#segments').append(b)}renderGrid();await showLibraryMode()}
function renderGrid(){$('#grid').replaceChildren();for(const h of course.holes.filter(h=>segment==='all'||h.segment_id===segment)){const b=el('button','card');b.dataset.hole=h.id;const box=el('div','thumb');if(h.asset_sha){const img=el('img');img.loading='lazy';img.alt=h.label+' 球道图';img.src='/asset/'+h.asset_sha;box.append(img)}else{const e=el('div','empty');e.append(el('span','','＋'),document.createTextNode(h.reference_count?'已有参考，等待绘制':'等待添加球道图'));box.append(e)}const info=el('div','card-info');info.append(el('b','',h.label),el('small','',h.title||'尚未制作'),el('small','',`${h.version_count} 个版本 · ${h.reference_count} 份逐洞参考`));b.append(box,info);b.onclick=safe(()=>openHole(h.id));$('#grid').append(b)}}
async function openHole(id){hole=await api('/api/hole?id='+encodeURIComponent(id));$('#detailCourse').textContent=hole.course_name;$('#holeTitle').textContent=hole.label+' 球道图';$('#versions').replaceChildren();for(const v of hole.versions){const o=el('option','',`存档 ${v.number} · ${v.title}${v.id===hole.current?' · 当前':''}`);o.value=v.id;$('#versions').append(o)}chosen=hole.current||hole.versions[0]?.id||null;$('#versions').value=chosen||'';$('#versions').disabled=!chosen;renderVersion();renderReferences();$('#history').replaceChildren(...hole.history.map(h=>el('li','',`${new Date(h.created_at).toLocaleString('zh-CN')} · ${h.action==='created'?'添加版本':'切换当前版本'} · ${h.note}`)));if(!$('#detail').open)$('#detail').showModal()}
function renderVersion(){const v=hole.versions.find(v=>v.id===chosen);$('#art').classList.toggle('hidden',!v);$('#emptyPreview').classList.toggle('hidden',!!v);$('#download').classList.toggle('hidden',!v);$('#selectCurrent').disabled=!v||v.id===hole.current;$('#selectCurrent').textContent=v?.id===hole.current?'已是当前版本':'设为当前版本';if(v){$('#art').src='/asset/'+v.asset_sha;$('#download').href='/asset/'+v.asset_sha+'?download=1';$('#download').download=v.filename;$('#versionMeta').textContent=`${v.width||'—'} × ${v.height||'—'} 像素 · ${v.metadata.reviewStatus||v.metadata.status||'已归档'}`;$('#note').textContent=v.note;$('#prompt').textContent=v.prompt||'未记录绘制提示';$('#metadata').textContent=JSON.stringify(v.metadata,null,2)}else{$('#art').removeAttribute('src');$('#versionMeta').textContent='';$('#note').textContent='添加第一版高精图后，可在这里继续管理修改。';$('#prompt').textContent='';$('#metadata').textContent=''} }
function renderReferences(){$('#references').replaceChildren();const roleNames={diagram:'球道布局参考',gps:'GPS / 定位资料',style:'画风样板',overview:'球场总览',satellite:'区域卫星图',source:'来源记录',layout:'布局记录',package:'项目地图配置'};for(const r of hole.references){const a=el('a','reference');a.href='/asset/'+r.asset_sha+(r.mime.startsWith('image/')?'':'?download=1');a.target='_blank';a.rel='noopener';if(r.mime.startsWith('image/')){const img=el('img');img.src='/asset/'+r.asset_sha;img.alt=r.filename;img.loading='lazy';a.append(img)}a.append(el('div','',roleNames[r.role]||r.role),el('small','',r.filename));$('#references').append(a)}}
$('#search').oninput=renderCourses;$('#withFiles').onchange=renderCourses;$('#close').onclick=()=>$('#detail').close();$('#versions').onchange=()=>{chosen=$('#versions').value;renderVersion()};
$('#selectCurrent').onclick=safe(async()=>{await api('/api/select',{holeId:hole.id,versionId:chosen});await openHole(hole.id);await openCourse(course.id);toast('已设为当前版本，其他版本仍保留')});
$('#backup').onclick=safe(async()=>{const b=await api('/api/backup',{});toast('备份已保存：'+b.path)});
const uploadVersion=safe(async()=>{const file=$('#file').files[0];if(!file)throw Error('请选择 PNG 图片');if(file.size>32*1024*1024)throw Error('请选择 32 MB 以内的图片');const button=$('#upload button');button.disabled=true;try{const base64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(file)});const res=await api('/api/upload',{holeId:hole.id,filename:file.name,title:$('#newTitle').value,note:$('#newNote').value,prompt:$('#newPrompt').value,base64,basedOn:chosen});await openHole(hole.id);await openCourse(course.id);courses=await api('/api/courses');renderCourses();$('#upload').reset();toast(res.created?'新版本已保存并设为当前':'这张图片已在此洞图库中，未重复保存')}finally{button.disabled=false}});
$('#upload').onsubmit=e=>{e.preventDefault();uploadVersion()};

async function showLibraryMode(){
  for(const button of $('#libraryModes').children)button.classList.toggle('active',button.dataset.mode===libraryMode);
  $('#grid').classList.toggle('hidden',libraryMode!=='art');
  $('#segments').classList.toggle('hidden',libraryMode!=='art');
  $('#gpsPanel').classList.toggle('hidden',libraryMode!=='gps');
  $('#inventoryPanel').classList.toggle('hidden',libraryMode!=='inventory');
  $('#resourcePanel').classList.toggle('hidden',libraryMode!=='resources');
  const request=++gpsRequest;
  if(libraryMode==='inventory')return showInventory();
  if(libraryMode==='resources')return showResources(course);
  if(course)$('#courseTitle').textContent=course.name;
  if(libraryMode!=='gps'||!course){if(course)$('#courseInfo').textContent=`${course.province} · ${course.holes.length} 洞档案 · ${course.holes.filter(h=>h.version_id).length} 洞精修`;return;}
  const cid=course.id;
  $('#gpsBody').classList.add('hidden');$('#gpsEmpty').textContent='正在读取 GPS 档案…';
  const data=await api('/api/gps?id='+encodeURIComponent(cid));
  if(request!==gpsRequest||course.id!==cid)return;
  renderGps(data);
}
function renderGps(data){
  gpsSnapshot=data;
  const document=data.document;
  $('#gpsEmpty').textContent=document?'':'此球场尚未保存 GPS 图，可继续添加。';
  $('#gpsBody').classList.toggle('hidden',!document);
  if(!document)return;
  $('#gpsVersions').replaceChildren();
  for(const version of data.versions){
    const option=el('option','',`版本 ${version.number} · ${version.title}${version.id===data.current?' · 当前':''}`);
    option.value=version.id;$('#gpsVersions').append(option);
  }
  $('#gpsVersions').value=data.selected;
  $('#gpsSelect').disabled=data.selected===data.current;
  $('#gpsExport').href='/api/export-gps?id='+encodeURIComponent(data.id)+'&version='+encodeURIComponent(data.selected);
  const holes=document.holes||[];
  $('#courseInfo').textContent=`${course.province} · ${course.holes.length} 洞档案 · ${holes.length} 洞 GPS`;
  $('#gpsInfo').textContent=`${holes.length} 洞 GPS · ${data.files.length} 个存档文件 · ${document.reviewStatus||'待复核'} · ${document.revision||''}`;
  const files=new Map(data.files.map(file=>[file.path,file]));
  const overview=files.get(document.preview);
  $('#gpsOverview').classList.toggle('hidden',!overview);
  if(overview)$('#gpsOverview').src='/asset/'+overview.asset_sha;
  else $('#gpsOverview').removeAttribute('src');
  $('#gpsHoles').replaceChildren();
  for(const hole of holes){
    const card=el('article','gps-card');
    card.append(el('h3','',hole.displayName||hole.label||hole._id||hole.id));
    const preview=files.get(hole.preview);
    if(preview){const image=el('img');image.src='/asset/'+preview.asset_sha;image.alt='逐洞 GPS 测距图';image.loading='lazy';card.append(image);}
    const coords=el('p','muted',`参考起点 ${hole.tee.map(v=>v.toFixed(6)).join(', ')}\n果岭中心 ${hole.green.map(v=>v.toFixed(6)).join(', ')}`);
    card.append(coords);$('#gpsHoles').append(card);
  }
}
for(const button of $('#libraryModes').children)button.onclick=safe(async()=>{libraryMode=button.dataset.mode;await showLibraryMode()});
$('#gpsVersions').onchange=safe(async()=>{
  const cid=course.id,request=++gpsRequest;
  const data=await api('/api/gps?id='+encodeURIComponent(cid)+'&version='+encodeURIComponent($('#gpsVersions').value));
  if(request===gpsRequest&&course.id===cid&&libraryMode==='gps')renderGps(data);
});
$('#gpsSelect').onclick=safe(async()=>{
  await api('/api/select-gps',{courseId:course.id,versionId:gpsSnapshot.selected,expectedCurrent:gpsSnapshot.current});
  courses=await api('/api/courses');renderCourses();await showLibraryMode();toast('已更新当前 GPS 版本');
});
