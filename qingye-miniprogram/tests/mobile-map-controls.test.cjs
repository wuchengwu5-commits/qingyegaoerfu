const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('fs'),path=require('path'),Hud=require('../../templates/map-ui/atlas-hud');
function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
test('portrait map controls have bounded, non-overlapping mobile touch areas and a prominent next-hole action',()=>{
 for(const [w,h,safe] of [[320,460,34],[375,620,34],[390,758,34],[430,834,34],[440,920,0]])for(const mode of ['focus','overview']){
  const items=Hud.items(w,h,mode,safe,true),get=k=>items.find(x=>x.key===k);
  for(const item of items)A.ok(item.x>=0&&item.y>=0&&item.x+item.w<=w&&item.y+item.h<=h-safe,item.key+' '+w+'×'+h);
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)A.equal(overlaps(items[i],items[j]),false,items[i].key+' overlaps '+items[j].key+' '+w+'×'+h);
  A.ok(get('location').h>=44);A.ok(get('zoomIn').h>=44);
  if(mode==='focus'){A.ok(get('gps').y>h*.55);A.ok(get('gps').y+get('gps').h<get('next').y);A.ok(get('next').w>get('prev').w);A.ok(get('next').h>=44);A.ok(get('next').x+get('next').w-get('prev').x<=152);A.ok(get('gps').w+get('art').w<=152);}
 }
});
test('map drawing keeps large distances and exposes the icon-only location action',()=>{
 const texts=[],ctx=new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}}),fillText(text,x,y){texts.push({text,x,y,font:this.font});}},{get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
 Hud.draw(ctx,{width:390,height:758,safe:34,hole:{sectionName:'老球场',local:1,section:1,par:4},mode:'focus',measures:{center:316,front:296,back:337},unit:'yd',holes:[{section:1}],hasArt:true,art:true,camera:{angle:0},scaleWidth:50,scaleText:'20 米'});
 A.ok(texts.some(x=>x.text==='下一洞 ›'));A.ok(!texts.some(x=>x.text==='定位'));A.equal(texts.find(x=>x.text==='316').font,'bold 40px sans-serif');
 A.equal(Hud.items(390,758,'focus',34,true).find(a=>a.key==='location').name,'定位我的位置');
 const actions=Hud.items(390,758,'focus',34,true),gps=actions.find(x=>x.key==='gps'),next=actions.find(x=>x.key==='next');
 const gpsText=texts.find(x=>x.text==='GPS 卫星图'),nextText=texts.find(x=>x.text==='下一洞 ›');
 A.ok(gpsText.x>gps.x&&gpsText.x<gps.x+gps.w&&gpsText.y>gps.y&&gpsText.y<gps.y+gps.h);A.ok(nextText.x>next.x&&nextText.x<next.x+next.w);
});
test('current continuous GPS maps and their template use the canonical Tianma controls',()=>{
 const root=path.resolve(__dirname,'../..'),canonical=fs.readFileSync(root+'/templates/map-ui/atlas-hud.js');
 for(const target of ['templates/gps-atlas/atlas-hud.js','qingye-miniprogram/miniprogram/packages/tianma-map/atlas-hud.js','qingye-miniprogram/miniprogram/packages/qizhong-map/atlas-hud.js','qingye-miniprogram/miniprogram/packages/jiulongshan-map/atlas-hud.js'])A.deepEqual(fs.readFileSync(root+'/'+target),canonical);
});

test('every legacy course entry uses the exact same HUD, source template and native hit handlers',()=>{
 const root=path.resolve(__dirname,'../..'),base=root+'/qingye-miniprogram/miniprogram/packages',canonical=fs.readFileSync(root+'/templates/map-ui/atlas-hud.js');
 for(const slug of ['hole-map','sheshan-map','tianma-map','huakai-map','links-map','meilan-masters-map','meilan-nicklaus-map','qizhong-map','jiulongshan-map']){
  A.deepEqual(fs.readFileSync(base+'/'+slug+'/atlas-hud.js'),canonical,slug);
  for(const ext of ['js','wxml','wxss'])A.deepEqual(fs.readFileSync(base+'/'+slug+'/index.'+ext),fs.readFileSync(root+'/templates/course-map/index.'+ext),slug+' '+ext);
  const w=fs.readFileSync(base+'/'+slug+'/index.wxml','utf8');A.match(w,/data-action="\{\{item.key\}\}"/);A.match(w,/disabled="\{\{item.disabled\}\}"/);A.match(w,/hidden="\{\{pickerOpen\}\}"/);A.doesNotMatch(w,/layer-toggle|quick-controls|distance-stack/);
 }
});
function legacy(slug='hole-map',o={}){let def;global.wx={};global.Page=p=>def=p;const f=path.resolve(__dirname,'../miniprogram/packages/'+slug+'/index');delete require.cache[require.resolve(f)];require('./helpers/legacy-map.cjs').load(f+'.js');const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad(o);p.width=390;p.height=758;p.safe=34;return p;}
test('reference view shares the mobile layout without inventing GPS controls or measured distances',()=>{
 const p=legacy('hole-map',{mode:'reference'});p.updateHud();A.equal(p.data.diagramMode,true);A.ok(p.data.actions.some(x=>x.key==='gps'));A.ok(p.data.actions.some(x=>x.key==='art'));A.ok(p.data.actions.some(x=>x.key==='zoomIn'));A.equal(p.data.actions.find(x=>x.key==='prev').disabled,true);
 for(const key of ['unit','location'])A.equal(p.data.actions.some(x=>x.key===key),false);
 const texts=[],ctx=new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}}),fillText(t){texts.push(String(t));}},{get:(o,k)=>k in o?o[k]:()=>{},set(o,k,v){o[k]=v;return true;}});p.ctx=ctx;p.drawHud();
 A.ok(texts.some(t=>t.includes('不用于 GPS 测距')));A.equal(texts.includes('果岭中心'),false);A.equal(texts.includes('定位'),false);A.equal(texts.includes('N'),false);
 p.ctx=null;p.perform('gps');p.updateHud();A.equal(p.canMeasure(),true);A.ok(p.data.actions.some(x=>x.key==='unit'));A.ok(p.data.actions.some(x=>x.key==='location'));
 p.perform('next');A.equal(p.data.selected,2);p.perform('art');p.updateHud();A.equal(p.data.diagramMode,true);A.equal(p.data.actions.some(x=>x.key==='location'),false);p.onUnload();
});
test('pending maps retain navigation and overview, while unavailable interactions stay hidden',()=>{
 const p=legacy('meilan-masters-map',{course:'cn_bg_569'});p.updateHud();A.equal(p.data.mapAvailable,false);A.ok(p.data.actions.some(x=>x.key==='mode'));A.ok(p.data.actions.some(x=>x.key==='next'));
 for(const key of ['location','unit','zoomIn','zoomOut'])A.equal(p.data.actions.some(x=>x.key===key),false,key);
 p.perform('next');A.equal(p.data.selected,2);p.perform('mode');A.equal(p.data.view,'overview');p.updateHud();A.ok(p.data.actions.some(x=>x.key==='zoomIn'));p.perform('mode');A.equal(p.data.view,'hole');A.equal(p.data.selected,2);p.onUnload();
});
test('reference and pending touch layouts stay in bounds and disjoint on small phones',()=>{
 for(const [w,h,safe] of [[320,460,34],[375,620,34],[390,758,34],[430,834,0]])for(const options of [{showMeasures:false,canLocate:false,canInteract:true,hasOverview:true},{showMeasures:false,canLocate:false,canInteract:false,hasOverview:false}]){
  const actions=Hud.items(w,h,'focus',safe,true,false,options);
  for(const a of actions)A.ok(a.x>=0&&a.y>=0&&a.x+a.w<=w&&a.y+a.h<=h-safe,a.key);
  for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++)A.equal(overlaps(actions[i],actions[j]),false,actions[i].key+' / '+actions[j].key);
 }
});
