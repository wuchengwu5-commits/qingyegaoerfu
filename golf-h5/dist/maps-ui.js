'use strict';
let mapContext=null,mapItems=GolfMapSeed.items.slice(),mapIndex=GolfMapSeed.items.slice(),managementRevision=-1;
const basePublicCourses=GolfCourseData.courses.slice();
async function refreshManagedCatalog(){
 try{const res=await fetch('/api/catalog',{cache:'no-store'});if(!res.ok)return;const value=await res.json();if(value.revision===managementRevision)return;
  const merged=new Map(basePublicCourses.map(c=>[c.id,c]));for(const c of value.courses)merged.set(c.id,c);
  GolfCourseData.courses=Array.from(merged.values());Golf.courses=GolfCourseData.courses;
  db.courses=[...GolfCourseData.courses,...db.courses.filter(c=>!c.publicData&&!merged.has(c.id))];managementRevision=value.revision;
  try{const res=await fetch('/api/maps',{cache:'no-store'});if(res.ok)mapIndex=(await res.json()).items;}catch(error){}
  render();
 }catch(error){/* Static exports retain their bundled catalog and map references. */}
}
function mapHoles(c,r){return r?r.holes.map(h=>({...h,mapId:h.sourceHoleId||h.id})):C.sections(c).flatMap(s=>s.holes.map(h=>({...h,sectionName:s.name}))).map((h,i)=>({...h,number:i+1,mapId:h.id}));}
async function openCourseMaps(cid,hid=null,rid=null){
 const r=rid?db.rounds.find(r=>r.id===rid):null,c=db.courses.find(c=>c.id===cid)||(r?{id:cid,name:r.courseName,segments:[]}:null);if(!c)return toast('球场资料暂不可用');
 const holes=mapHoles(c,r);mapContext={cid,rid,course:c,holes,hid:hid||holes[0]?.mapId||null,view:hid?'hole':'overview',zoom:1,immersive:true};
 const requestContext=mapContext;mapItems=mapIndex.filter(i=>i.courseId===cid);
 try{const res=await fetch('/api/maps?courseId='+encodeURIComponent(cid),{cache:'no-store'});if(res.ok){const items=(await res.json()).items;if(mapContext!==requestContext)return;mapItems=items;}}catch(error){}
 if(mapContext===requestContext)drawCourseMaps();
}
function drawCourseMaps(){
 const ctx=mapContext;if(!ctx)return;const c=ctx.course,h=ctx.holes.find(h=>h.mapId===ctx.hid),items=mapItems.filter(i=>i.active&&i.courseId===ctx.cid&&(ctx.view==='overview'?i.kind==='overview':i.kind==='hole'&&i.holeId===ctx.hid)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 const item=items[ctx.imageIndex||0]||items[0],index=ctx.holes.findIndex(h=>h.mapId===ctx.hid),caption=ctx.view==='overview'?'球场总览':h?'第 '+h.number+' 洞 · '+(h.sectionName||'')+' '+h.label+' · PAR '+h.par:'球道图';
 const guideMode=ctx.guideMode||'map',guideRound=ctx.rid?db.rounds.find(r=>r.id===ctx.rid):null,guidePlayer=guideRound?.players.find(p=>p.id===guideRound.currentPlayer),guideTee=c.teeData?.find(t=>t.id===detailTee)||c.teeData?.[0];
 const rawDistance=h?(guidePlayer?guidePlayer.holeDistances?.[h.number]:guideTee?.distances?.[h.mapId]):null,guideUnit=ctx.unit||db.settings.unit;
 const distance=Number.isFinite(rawDistance)?Math.round(guideUnit==='m'?rawDistance*.9144:rawDistance):null;
 const sampleLink=ctx.cid==='cn_bg_585'&&ctx.view==='hole'&&h?.mapId==='cn_bg_585_s1_h01'?'<a href="/yintao-hole1/" style="display:block;padding:12px 16px;background:#e5edd5;color:#315c3b;border-radius:10px;font-size:13px;margin:8px 0;text-decoration:none">体验1号洞实景精修与测距样板 ↗</a>':'';
 const guideTabs=`<div class="map-guide-tabs">${action('map-guide-mode','球道图',guideMode==='map'?'active':'','data-value="map"')}${action('map-guide-mode','记分卡距离',guideMode==='distance'?'active':'','data-value="distance"')}</div>`;
 const distanceView=`<div class="guide-distance-view"><div class="guide-distance-card"><small>${esc(guidePlayer?.tee||guideTee?.name||'发球台待补充')} · 本洞记分卡长度</small><div class="guide-distance-number">${distance??'—'}<small>${guideUnit==='m'?'米':'码'}</small></div><p>${h?'第 '+h.number+' 洞 · Par '+h.par:'选择球洞后查看'}</p>${action('map-guide-unit',guideUnit==='m'?'切换为码':'切换为米','guide-distance-unit')}</div><p class="guide-distance-help">${distance===null?'该发球台的本洞距离暂未补全，保持空白，不根据图片推算。':'这是所选发球台到本洞果岭的记分卡全洞长度，不是当前位置到果岭的实时距离。'}球道图上的来源码数也可能属于不同版本。</p><p class="guide-distance-help">当前未接入球会核验的GPS点位。可以切回球道图查看布局，不使用演示读数代替实际测距。</p></div>`;
 const previous=ctx.view==='hole'?action('map-step','← 上一洞','btn outline map-previous',`data-value="-1" ${index<=0?'disabled':''}`):'<span></span>';
 const next=ctx.view==='hole'?action('map-step','下一洞 →','btn secondary map-next',`data-value="1" ${index<0||index>=ctx.holes.length-1?'disabled':''}`):'<span></span>';
 modal(c.name,`<div class="course-map-view">${guideTabs}${sampleLink}<div class="map-view-tabs">${action('map-view','球场总览',ctx.view==='overview'?'active':'','data-value="overview"')}${action('map-view','逐洞球道图',ctx.view==='hole'?'active':'','data-value="hole"')}</div><div class="map-view-heading"><b>${esc(caption)}</b>${action('map-focus',ctx.immersive?(guideMode==='distance'?'选择球洞':'选洞 / 总览'):'收起选项','text-link')}</div>${ctx.view==='hole'?`<div class="map-hole-picker">${ctx.holes.map(h=>action('map-hole',h.number,ctx.hid===h.mapId?'active':'',`data-id="${esc(h.mapId)}" aria-label="查看第${h.number}洞球道图"`)).join('')}</div>`:''}${guideMode==='distance'?distanceView:item?`<div class="map-image-stage"><img src="${esc(item.url)}" alt="${esc(c.name+' · '+caption+' · '+item.label)}" class="${ctx.zoom===1?'fit-map':''}" style="width:${ctx.zoom*100}%" draggable="false"></div>`:`<div class="map-empty">${icon('flag')}<b>尚未上传${ctx.view==='overview'?'球场总览':'本洞球道图'}</b><p>位置已预留，记分可以照常使用。</p></div>`}<div class="map-view-footer">${previous}<div class="map-view-controls">${item&&guideMode==='map'?`${action('map-zoom','−','btn outline small',`data-value="-1" aria-label="缩小球道图" ${ctx.zoom===1?'disabled':''}`)}${action('map-zoom','+','btn outline small',`data-value="1" aria-label="放大球道图" ${ctx.zoom===3?'disabled':''}`)}${action('map-reset','适合屏幕','text-link')}`:''}</div>${next}</div>${item&&guideMode==='map'?`<details class="map-information"><summary>图源与版本 · ${ctx.zoom}×</summary><div>${items.length>1?`<div class="map-versions">${items.map((i,n)=>action('map-version',esc(i.label||'版本 '+(n+1)),item.id===i.id?'active':'',`data-value="${n}"`)).join('')}</div>`:''}<p class="map-source-note">${item.verified?'上传者已核对版本':'来源示意图 · 现行布局待核实'}${item.effectiveOn?' · '+esc(item.effectiveOn):item.sourcePublishedOn?' · 来源文章 '+esc(item.sourcePublishedOn):''}。图上码数不替换本轮记分卡。</p>${item.sourceUrl?`<a class="map-source-link" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">查看资料来源 ↗</a>`:''}</div></details>`:''}</div>`);
 const panel=document.querySelector('#modal-root .modal');if(panel){panel.classList.add('course-map-modal');panel.classList.toggle('map-immersive',!!ctx.immersive);panel.classList.toggle('guide-mode-distance',guideMode==='distance');panel.parentElement?.classList.add('course-map-backdrop');panel.querySelector('.map-hole-picker .active')?.scrollIntoView({block:'nearest',inline:'center'});const stage=panel.querySelector('.map-image-stage'),image=stage?.querySelector('img');if(image&&ctx.zoom>1){const size=()=>{const scale=Math.min(stage.clientWidth/image.naturalWidth,stage.clientHeight/image.naturalHeight)*ctx.zoom;image.style.width=image.naturalWidth*scale+'px';image.style.height=image.naturalHeight*scale+'px';image.style.marginLeft=Math.max(0,(stage.clientWidth-image.naturalWidth*scale)/2)+'px';};image.addEventListener('load',size,{once:true});if(image.complete&&image.naturalWidth)size();}}

}
const beforeMapsCourse=courseDetail;courseDetail=function(){let html=beforeMapsCourse();const c=db.courses.find(c=>c.id===route.id);if(!c)return html;const count=new Set(mapIndex.filter(i=>i.active&&i.courseId===c.id&&i.kind==='hole').map(i=>i.holeId)).size;const block=`<section class="card course-map-entry"><div class="row"><div><small>COURSE GUIDE</small><h3>球场地图与球道图</h3></div>${icon('flag')}</div><p>${count?'已收录总览及 '+count+' 洞来源球道图':'查看球场总览与逐洞图，未上传位置已预留'}</p><div class="round-actions">${action('course-maps','球场总览','btn secondary',`data-course="${esc(c.id)}"`)}${action('course-maps','逐洞球道图 '+icon('arrow'),'btn primary',`data-course="${esc(c.id)}" data-hole="${esc(C.sections(c)[0]?.holes[0]?.id||'')}"`)}</div></section>`;return html.replace(section('洞段与记分卡'),block+section('洞段与记分卡'));};
const beforeMapsScore=scorePage;scorePage=function(){let html=beforeMapsScore();const r=round(),h=r?.holes.find(h=>h.number===r.currentHole);if(!h)return html;return html.replace(/(<span class="save-state[^>]*>[\s\S]*?<\/span>)/,`<div class="score-top-actions">$1${action('course-maps',icon('flag')+' 球道图','score-map-button',`data-course="${esc(r.courseId)}" data-hole="${esc(h.sourceHoleId||h.id)}" data-round="${esc(r.id)}"`)}</div>`);};
const beforeMapSettings=settingsPage;settingsPage=function(){return beforeMapSettings()+section('内容管理')+`<a class="card menu-row" href="/manage/" target="_blank" rel="noopener">${icon('settings')}<span class="grow">球场与球道图管理后台</span>${icon('chevron')}</a>`;};
const beforeMapActions=handleAction;handleAction=async function(el,event){const a=el.dataset.action,v=el.dataset.value;
 if(a==='course-maps')return openCourseMaps(el.dataset.course,el.dataset.hole||null,el.dataset.round||null);
 if(a==='map-guide-mode'){mapContext.guideMode=v;if(v==='distance')mapContext.view='hole';mapContext.immersive=true;return drawCourseMaps();}
 if(a==='map-guide-unit'){mapContext.unit=(mapContext.unit||db.settings.unit)==='m'?'yd':'m';return drawCourseMaps();}
 if(a==='map-focus'){mapContext.immersive=!mapContext.immersive;return drawCourseMaps();}
 if(a==='map-view'){mapContext.immersive=true;mapContext.view=v;mapContext.zoom=1;mapContext.imageIndex=0;return drawCourseMaps();}
 if(a==='map-hole'){mapContext.immersive=true;mapContext.hid=el.dataset.id;mapContext.view='hole';mapContext.zoom=1;mapContext.imageIndex=0;return drawCourseMaps();}
 if(a==='map-step'){const index=mapContext.holes.findIndex(h=>h.mapId===mapContext.hid),h=mapContext.holes[index+Number(v)];if(h){mapContext.hid=h.mapId;mapContext.zoom=1;mapContext.imageIndex=0;drawCourseMaps();}return;}
 if(a==='map-zoom'){mapContext.zoom=Math.max(1,Math.min(3,mapContext.zoom+Number(v)*.5));return drawCourseMaps();}
 if(a==='map-reset'){mapContext.zoom=1;return drawCourseMaps();}
 if(a==='map-version'){mapContext.imageIndex=Number(v);mapContext.zoom=1;return drawCourseMaps();}
 return beforeMapActions(el,event);
};
window.addEventListener('focus',refreshManagedCatalog);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshManagedCatalog();});
setInterval(()=>{if(!document.hidden)refreshManagedCatalog();},60000);
refreshManagedCatalog();render();
