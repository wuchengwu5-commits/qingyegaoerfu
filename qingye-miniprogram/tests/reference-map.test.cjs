const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('fs'),path=require('path');
const base=path.resolve(__dirname,'../miniprogram');
function page(slug='hole-map',options={}){let def;global.Page=p=>def=p;const f=base+'/packages/'+slug+'/index';delete require.cache[require.resolve(f)];if(slug==='hole-map'||slug==='meilan-masters-map')require('./helpers/legacy-map.cjs').load(f+'.js');else require(f);const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad(options);return p;}
function atlasPage(options={}){let def;global.Page=p=>def=p;const file=base+'/packages/jiulongshan-map/atlas';delete require.cache[require.resolve(file)];require(file);const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad(options);return p;}
const flush=()=>new Promise(r=>setImmediate(r));
const dbRows = require('../data/maps/jiulongshan-gps/database.json');
const catalog = {ok:true,courseId:'cn_bg_611',holes:dbRows};
function gpsCloud(){return {cloud:{init(){},callFunction:async()=>({result:catalog})}};}

test('45 current library revisions bind to distinct original hole IDs and stay outside the code package',()=>{
 const S=require(base+'/services/store'),routes=require(base+'/services/course-map-route'),manifest=require('../cloud-assets/hole-reference-v1/manifest.json');
 for(const [id,slug,n] of [['cn_bg_585','hole-map',18],['cn_bg_611','jiulongshan-map',27]]){const c=S.courses.find(c=>c.id===id),cfg=require(base+'/packages/'+slug+'/course-config'),ids=c.segments.flatMap(s=>s.holes.map(h=>h.id));A.equal(Object.keys(cfg.references).length,n);A.equal(routes.referenceCount(id),n);for(const hid of ids){const d=cfg.references[hid],asset=manifest.assets.find(a=>a.id===hid);A.equal(d.libraryVersion,asset.version_id);A.equal(d.image,asset.fileID);A.equal(d.extent,undefined);A.equal(d.greenCenter,undefined);A.equal(d.diagram,true);A.ok(fs.existsSync(path.resolve(__dirname,'../..',asset.localFile)));}A.equal(new Set(Object.values(cfg.references).map(x=>x.image)).size,n);}
 A.equal(routes.gpsCount('cn_bg_611'),27);
});
test('explicit reference mode never requests location or displays measured distances',()=>{
 let locates=0,settings=0;global.wx={getSetting(){settings++},getLocation(){locates++}};
 for(const [slug,course] of [['hole-map','cn_bg_585'],['jiulongshan-map','cn_bg_611']]){const p=page(slug,{course,mode:'reference'});A.equal(p.data.mapMode,'reference');A.equal(p.data.referenceAvailable,true);A.equal(p.data.diagramMode,true);A.equal(p.canMeasure(),false);A.equal(p.canLocate(),false);p.locate();p.autoLocate();p.next();A.equal(p.data.mapMode,'reference');A.equal(p.data.center,'—');p.onUnload();}A.equal(locates,0);A.equal(settings,0);
});
test('GPS switch retains the selected hole, uses original geography and remembers user mode while browsing',()=>{
 global.wx={};const p=page('hole-map',{hole:10,mode:'reference'}),cfg=require(base+'/packages/hole-map/course-config');p.switchMapMode();A.equal(p.data.selected,10);A.equal(p.data.mapMode,'gps');A.equal(p.mapData,cfg.holes.cn_bg_585_s2_h01);A.equal(p.canMeasure(),true);p.next();A.equal(p.data.mapMode,'gps');A.equal(p.data.selected,11);p.switchMapMode();A.equal(p.data.selected,11);A.equal(p.data.center,'—');A.equal(p.mapData,cfg.references.cn_bg_585_s2_h02);p.previous();A.equal(p.data.mapMode,'reference');p.onUnload();A.equal(page('hole-map',{mode:'reference'}).data.mapMode,'reference');
});
test('manual GPS origins survive switching to art and delayed fixes cannot write into art coordinates',()=>{
 let request;global.wx={getLocation:o=>request=o,showToast(){}};const p=page('hole-map',{mode:'reference'});p.switchMapMode();const d=p.mapData,M=require(base+'/packages/hole-map/map-core');p.locate();const old=request;p.manualOrigin=true;p.state.origin=d.defaultTarget.slice();const expected=p.state.origin.slice();p.switchMapMode();const artOrigin=p.state.origin.slice(),geo=M.toGeo(d.greenCenter,d);old.success({longitude:geo[0],latitude:geo[1],accuracy:4});A.deepEqual(p.state.origin,artOrigin);p.switchMapMode();A.deepEqual(p.state.origin,expected);A.equal(p.manualOrigin,true);p.onUnload();
});
test('Jiulongshan reference switch opens the same physical hole on the continuous GPS atlas',async()=>{
 let url,request;global.wx={...gpsCloud(),navigateTo:o=>url=o.url,getLocation:o=>request=o,showToast(){}};
 const reference=page('jiulongshan-map',{course:'cn_bg_611',hole:25,mode:'reference'}),id='cn_bg_611_s3_h07';
 reference.switchMapMode();A.match(url,/jiulongshan-map\/atlas/);A.ok(url.includes(id));
 const p=atlasPage({source:id,view:'focus'});await flush();A.equal(p.catalogSource,'database');A.equal(p.hole.id,id);A.equal(p.data.selected,25);A.ok(+p.data.front<+p.data.center&&+p.data.center<+p.data.back);
 p.showOverview();A.equal(p.data.mode,'overview');p.locate();request.success({longitude:121.124,latitude:30.6095,accuracy:5});A.ok(p.fix);p.focusCurrent();p.perform('reference');A.match(url,/hole=25/);A.match(url,/mode=reference/);p.onUnload();reference.onUnload();
});
test('the 27 GPS photos use their own registered crop, measured polygon and stable physical hole IDs',()=>{
 const cfg=require(base+'/packages/jiulongshan-map/course-config'),M=require(base+'/packages/jiulongshan-map/map-core'),manifest=require('../cloud-assets/hole-gps-v1/manifest.json'),reg=require('../data/maps/jiulongshan-gps/registration.json'),crypto=require('node:crypto');A.equal(manifest.assets.length,27);A.equal(new Set(manifest.assets.map(x=>x.fileID)).size,27);
 const actual=require(base+'/packages/jiulongshan-map/gps-maps').decode('cn_bg_611',manifest.assets.map(a=>a.id),catalog);
 A.deepEqual(cfg.holes,{});for(const [i,a] of manifest.assets.entries()){const h=actual[a.id],original=reg.holes[i],photo=fs.readFileSync(path.resolve(__dirname,'../..',a.localFile));A.equal(crypto.createHash('sha256').update(photo).digest('hex'),a.sha256);A.equal(h.id,original.id);A.equal(h.number,i+1);A.equal(h.satelliteImage,a.fileID);A.equal(h.verified,false);A.ok(M.inside(h.greenCenter,h.features[0].points));A.equal(h.sourceWindow,undefined);
 for(const [local,geo] of [[h.defaultOrigin,original.route[0]],[h.greenCenter,original.route.at(-1)]])A.ok(M.meters(M.toGeo(local,h),geo)<.01);
 const [x,y]=a.sourceWindow,nw=M.toGeo([x/3,y/3],cfg.overview);A.ok(M.meters(nw,M.toGeo([0,0],h))<.01);const m=M.measure({origin:h.defaultOrigin,target:h.defaultTarget},h);A.ok(80<m.center&&m.center<600&&m.front<m.center&&m.back>m.center);if(h.par===3)A.deepEqual(h.defaultTarget,h.greenCenter);
 }
});
test('a continuous satellite load preserves the latest selected hole and camera mode',async()=>{
 global.wx={...gpsCloud(),__preview:true,nextTick:fn=>fn(),createSelectorQuery(){return {in(){return this},select(){return this},fields(){return this},exec(fn){fn([])}}}};const p=atlasPage({hole:1,view:'focus'});await flush();
 const images=[];p.canvas={createImage(){const image={width:1200,height:1200};images.push(image);return image;}};p.ctx={};p.paint=()=>{};p.requestPaint=()=>{};
 try{
  // The progressive stream now owns its loader: defer the actual canvas decodes.
  const loading=p.fetchImage();await flush();A.equal(images.length,2);
  p.activate(2);A.equal(p.hole.number,2);p.showOverview();
  images[0].onload();images[1].onload();await loading;
  A.equal(p.hole.number,2);A.equal(p.data.mode,'overview');A.equal(p.data.error,'');
 }finally{p.onUnload();}
});
test('geographic area grid matches source corners without shifting existing Mercator data',()=>{
 const M=require(base+'/packages/hole-map/map-core'),overview=require(base+'/packages/jiulongshan-map/overview-data'),old=require(base+'/packages/hole-map/data');A.deepEqual(M.toGeo([0,0],overview),[121.105,30.6285]);A.deepEqual(M.toGeo([2048,2048],overview),[121.143,30.5905]);for(const d of [overview,old])for(const p of [[0,0],[100,200],[d.width,d.height]]){const back=M.toPixel(M.toGeo(p,d),d);A.ok(Math.hypot(back[0]-p[0],back[1]-p[1])<1e-6);}
});
test('stale reference image success and failure cannot replace another hole or GPS view; retry clears a bad cache',async()=>{
 global.wx={__preview:true};const p=page('hole-map',{mode:'reference'}),images=[],Media=require(base+'/services/media'),forget=Media.forget,forgot=[];Media.forget=s=>forgot.push(s);p.draw=()=>{};p.canvas={createImage(){const i={width:1024};images.push(i);return i}};p.rasterLoader={load:()=>Promise.resolve({width:2048}),close(){}};
 try{p.loadDiagram();await flush();const first=images[0];p.next();await flush();first.onload();A.equal(p.diagramId,null);A.equal(p.data.loading,true);images[1].onerror();A.match(p.data.error,/精修图加载失败/);A.equal(forgot[0],p.mapData.image);p.retry();await flush();images[2].onload();A.equal(p.data.loading,false);A.equal(p.diagramId,p.mapData.id);p.switchMapMode();await flush();first.onerror();A.equal(p.data.error,'');A.equal(p.data.mapMode,'gps');A.equal(p.diagramPhoto,null);}finally{Media.forget=forget;p.onUnload();}
});
test('round source IDs map reversed Jiulongshan sections and browsing never changes score progress',()=>{
 const memory={};global.wx={navigateTo(){},getStorageSync:k=>memory[k],setStorageSync:(k,v)=>memory[k]=structuredClone(v)};const S=require(base+'/services/store'),R=require(base+'/services/rules');S.init();const c=S.courses.find(c=>c.id==='cn_bg_611'),r=S.create({courseId:c.id,segmentIds:[c.segments[2].id,c.segments[0].id],players:[{id:'me',name:'Test',tee:c.tees[0]}],ruleSnapshot:R.defaultRules()});const before=JSON.stringify(S.getRound(r.id));const p=page('jiulongshan-map',{course:c.id,round:r.id,hole:1,mode:'reference'});A.equal(p.data.selected,19);A.equal(p.data.h.sourceId,'cn_bg_611_s3_h01');p.next();p.switchMapMode();p.switchMapMode();p.currentHole();A.equal(p.data.selected,19);A.equal(JSON.stringify(S.getRound(r.id)),before);p.onUnload();
});
test('unillustrated courses keep their existing satellite or pending view',()=>{
 global.wx={};const p=page('meilan-masters-map',{course:'cn_bg_569'});A.equal(p.data.referenceAvailable,false);A.equal(p.data.mapMode,'gps');A.equal(p.canMeasure(),false);p.switchMapMode();A.equal(p.data.mapMode,'gps');p.onUnload();
});

test('a late atlas catalog cannot update an unloaded page and cached geometry opens offline',async()=>{
 let deliver;const cache={};
 global.wx={cloud:{init(){},callFunction:()=>new Promise(resolve=>deliver=resolve)},getStorageSync:k=>cache[k],setStorageSync:(k,v)=>cache[k]=v};
 const p=atlasPage({hole:2,view:'focus'});p.onUnload();deliver({result:catalog});await flush();A.equal(p.holes.length,0);
 wx.cloud.callFunction=async()=>{throw Error('offline')};const cached=atlasPage({hole:2,view:'focus'});await flush();A.equal(cached.catalogSource,'cache');A.equal(cached.hole.id,dbRows[1]._id);cached.onUnload();
});
test('an incomplete first atlas catalog shows retry without displaying another hole',async()=>{
 let result={...catalog,holes:dbRows.slice(1)};global.wx={cloud:{init(){},callFunction:async()=>({result})}};
 const p=atlasPage({hole:18,view:'focus'});await flush();A.equal(p.hole,undefined);A.match(p.data.error,/重试/);A.equal(p.data.center,'—');
 result=catalog;p.initCanvas=()=>{};p.retry();await flush();A.equal(p.hole.id,dbRows[17]._id);A.ok(+p.data.center>0);p.onUnload();
});
