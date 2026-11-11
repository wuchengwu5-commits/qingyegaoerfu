const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('fs'),path=require('path');
const base=path.resolve(__dirname,'../miniprogram'),B=base+'/packages/sheshan-map',Config=require(B+'/atlas-config'),rows=require(B+'/atlas-catalog'),Geo=require(B+'/map-core');
function nativePage(name,o={}){let definition;global.Page=p=>definition=p;const f=B+'/'+name;delete require.cache[require.resolve(f)];require(f);const p={...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}};p.onLoad(o);return p;}
test('normal Sheshan entry opens reviewed continuous GPS overview and keeps score route parameters',()=>{
 let url;const memory={};global.wx={redirectTo:o=>url=o.url,getStorageSync:k=>memory[k],setStorageSync:(k,v)=>memory[k]=structuredClone(v)};nativePage('index',{course:Config.courseId});A.equal(url,'/packages/sheshan-map/atlas?course=cn_bg_2525');
 nativePage('index',{course:Config.courseId,round:'round & 1',hole:10});A.equal(url,'/packages/sheshan-map/atlas?course=cn_bg_2525&round=round%20%26%201&hole=10');
 nativePage('index',{course:'cn_bg_585',hole:18});A.equal(url,'/packages/hole-map/atlas?course=cn_bg_585&hole=18');
});
test('reviewed Sheshan atlas has 18 fixed IDs, the exact archived geometry and complete cloud-only imagery',async()=>{
 const data=require(B+'/atlas-data'),result=await data.read();A.equal(result.holes.length,18);A.equal(result.source,'registered-package');
 const previous=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../outputs/five-clubs-gps-20261106/sheshan/catalog.json')));
 const patch=require('../data/maps/sheshan-endpoint-corrections.json');
 const legacy=require(B+'/course-config').holes;
 const geometry=['tee','teeOutline','target','green','greenOutline','route'];
 for(const [index,row] of rows.entries()){
  A.equal(row.revision,patch.revision);A.equal(row._id,previous[index]._id);
  const correction=patch.corrections[row._id];
  for(const key of geometry)A.deepEqual(row[key],correction?.[key]??previous[index][key]);
  if(correction){
   A.deepEqual(row.route[0],row.tee);A.deepEqual(row.route.at(-1),row.green);
   A.ok(Geo.inside(row.tee,row.teeOutline));
   const crop=legacy[row._id];
   for(const [local,geo] of [[crop.defaultOrigin,row.tee],[crop.greenCenter,row.green]])
    A.ok(Geo.meters(Geo.toGeo(local,crop),geo)<.03);
  }
 }
 const tiles=require(B+'/atlas-tiles')[Config.photo];A.equal(tiles.width,Config.atlas.width);A.equal(tiles.height,Config.atlas.height);
 for(const source of [Config.photo,Config.surround.src,...tiles.tiles.map(t=>t.src)]){A.ok(fs.existsSync(path.resolve(base,'../cloud-assets/media-v1')+source));A.equal(fs.existsSync(base+source),false);A.match(require(base+'/services/media').fileID(source),/^cloud:\/\//);}
 for(const h of result.holes){A.ok(Geo.inside(h.green,h.outline));const edge=Geo.greenEdges(h.tee,h.green,h.outline),front=Geo.distance(h.tee,edge.front,Config.atlas),center=Geo.distance(h.tee,h.green,Config.atlas),back=Geo.distance(h.tee,edge.back,Config.atlas);A.ok(front<=center&&center<=back);}
});
test('reviewed atlas opens all holes, retains original rear-nine IDs, units and manual positions',async()=>{
 global.wx={};const p=nativePage('atlas',{hole:10});await new Promise(r=>setImmediate(r));A.equal(p.data.mode,'focus');A.equal(p.hole.id,'cn_bg_2525_s2_h01');
 for(let n=1;n<=18;n++){p.activate(n);A.equal(p.hole.number,n);A.ok(Number(p.data.center)>0);}
 p.showOverview();A.equal(p.data.mode,'overview');p.focusCurrent();A.equal(p.data.mode,'focus');A.equal(p.hole.number,18);p.onUnload();
});
