const {test}=require('node:test'),A=require('node:assert/strict'),path=require('path'),fs=require('fs'),B=path.resolve(__dirname,'../miniprogram/packages/tianma-map'),C=require(B+'/course-config'),M=require(B+'/map-core'),Location=require(B+'/location-policy'),S=require(B+'/../../services/store');
test('Tianma Old 1 uses its independent satellite photo, real image grid, official catalog identity and georeferenced crop',()=>{
 const d=C.defaultMap;A.equal(d.id,'cn_bg_577_s1_h01');A.equal(d.par,4);A.equal(d.verified,false);A.equal(d.imageryDate,'2025-07-01');A.ok(require(B+'/image-tiles')[C.photo].tiles.every(t=>fs.existsSync(path.resolve(B,'../../../cloud-assets/media-v1')+t.src)));A.ok(M.inside(d.greenCenter,d.features[0].points));for(const p of [d.defaultOrigin,d.defaultTarget,d.greenCenter,...d.features[0].points]){A.ok(M.inBounds(p,d));const g=M.toGeo(p,d);A.ok(g[0]>121.12&&g[0]<121.15&&g[1]>31.05&&g[1]<31.07);const q=M.toPixel(g,d);A.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-5);}const geoOrigin=M.toGeo(d.defaultOrigin,d),geoGreen=M.toGeo(d.greenCenter,d);A.ok(geoOrigin[1]>geoGreen[1]);const v=M.measure({origin:d.defaultOrigin,target:d.defaultTarget},d);A.ok(v.front<v.center&&v.center<v.back);A.ok(v.center>330&&v.center<370);
 const c=M.focusFit(390,758,d,[d]),o=M.screen(d.defaultOrigin,c,d),g=M.screen(d.greenCenter,c,d);A.ok(g[1]<o[1]);A.ok(Math.abs(g[0]-o[0])<1e-6);
});
test('Tianma normal route opens the live atlas, and legacy hole links redirect with round and hole intact',()=>{
 const routes=require(B+'/../../services/course-map-route');A.equal(routes.gpsCount('cn_bg_577'),27);A.equal(routes.route('cn_bg_577'),'/packages/tianma-map/trial');
 let def,url;global.Page=x=>def=x;global.wx={redirectTo:o=>{url=o.url}};require(B+'/index');
 const p={...def};p.onLoad({course:'cn_bg_577',hole:13});A.equal(url,'/packages/tianma-map/trial?course=cn_bg_577&hole=13');
});
test('all three nines retain geographic distances and tee-down orientation on the full atlas',()=>{
 const atlas=C.overview,Data=require(B+'/atlas-data'),Camera=require(B+'/atlas-camera');
 const all=Data.parse(require('../preview/gps-database/cn_bg_577.json'));A.equal(all.length,27);A.equal(new Set(all.map(h=>h.tag)).size,27);
 for(const h of all){for(const [w,height] of [[320,555],[390,758]]){
  const c=Camera.fit(w,height,all,h,h.tee,h.target,false,24);
  const tee=M.screen(h.tee,c,atlas),green=M.screen(h.green,c,atlas);A.ok(Math.abs(tee[0]-green[0])<.01&&tee[1]>height/2&&green[1]<height/2);
  for(const point of [h.tee,h.green,...h.outline,h.target]){const screen=M.screen(point,c,atlas),q=M.world(screen,c,atlas);A.ok(screen[0]>=0&&screen[0]<=w&&screen[1]>0&&screen[1]<height);A.ok(Math.hypot(q[0]-point[0],q[1]-point[1])<1e-7);}
  A.equal(Camera.fit(w,height,all,h,h.tee,h.target,true,24).angle,0);
 }}
});
test('all 27 GPS holes resolve to their own art asset with the tee and green inside its frame',()=>{
 const catalog=require(B+'/atlas-art-data');
 const holes=require(B+'/atlas-data').parse(require('../preview/gps-database/cn_bg_577.json'));
 A.deepEqual(Object.keys(catalog).sort(),holes.map(h=>h.id).sort());
 for(const {id} of holes){
  const {src,frame}=catalog[id];
  const location='/hole-reference-v1/cn_bg_577/'+id+'-';
  A.ok(src.includes(location),id);
  const file=path.resolve(B,'../../../cloud-assets/hole-reference-v1/cn_bg_577',path.basename(src));
  const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  A.ok(src.endsWith('-'+digest.slice(0,16)+'.png'),id);
  const [left,top,width,height]=frame;
  A.ok(left<0&&left+width>0&&top< -640&&top+height>0,id);
 }
});
