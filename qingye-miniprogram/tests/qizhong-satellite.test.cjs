const {test}=require('node:test'),A=require('node:assert/strict'),path=require('path'),fs=require('fs'),B=path.resolve(__dirname,'../miniprogram/packages/qizhong-map'),cfg=require(B+'/course-config'),M=require(B+'/map-core'),Location=require(B+'/location-policy'),S=require(B+'/../../services/store');
const course=S.courses.find(c=>c.id===cfg.courseId),holes=Object.values(cfg.holes);
test('18 physical holes use Qizhong catalog IDs, satellite crops and independent geographic green outlines',()=>{
 A.equal(holes.length,18);A.equal(cfg.pendingSatellite,false);A.equal(new Set(holes.map(d=>JSON.stringify(d.greenCenter)+JSON.stringify(d.extent))).size,18);for(const d of holes){A.equal(d.courseId,course.id);A.equal(d.par,course.pars[d.number-1]);A.equal(d.satelliteOnly,true);A.equal(d.verified,false);A.ok(M.inside(d.greenCenter,d.features[0].points));const w=d.sourceWindow;A.ok(w.x>=0&&w.y>=0&&w.x+w.width<=cfg.overview.width&&w.y+w.height<=cfg.overview.height);for(const p of [d.defaultOrigin,d.defaultTarget,d.greenCenter,...d.features[0].points]){A.ok(M.inBounds(p,d));const g=M.toGeo(p,d),a=M.toPixel(g,cfg.overview);A.ok(g[0]>121.33&&g[0]<121.36&&g[1]>31.04&&g[1]<31.07);A.ok(Math.hypot(a[0]-w.x-p[0],a[1]-w.y-p[1])<1e-5);}const v=M.measure({origin:d.defaultOrigin,target:d.defaultTarget},d);A.ok(v.front<v.center&&v.center<v.back);A.ok(v.center>70&&v.center<650);A.ok(v.first>0&&v.second>0);const camera=M.focusFit(390,758,d,holes);for(const p of d.focusRoute){const s=M.screen(p,camera,d);A.ok(s[0]>140&&s[0]<370&&s[1]>20&&s[1]<720);}}
});
test('Qizhong normal entry opens the continuous atlas and GPS updates the selected physical hole',async()=>{
 let def,request,redirect;global.Page=p=>def=p;global.wx={getLocation:o=>request=o,showToast:()=>{},redirectTo:o=>redirect=o.url};
 require(B+'/index');const legacy={...def};legacy.onLoad({course:course.id,hole:1});A.match(redirect,/qizhong-map\/atlas/);A.match(redirect,/hole=1/);
 require(B+'/atlas');const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};
 p.onLoad({course:course.id,hole:1});await new Promise(resolve=>setImmediate(resolve));
 A.equal(p.data.mode,'focus');A.equal(p.holes.length,18);A.equal(p.hole.number,1);
 p.locate();const atlas=require(B+'/atlas-config').atlas,geo=M.toGeo(p.hole.target,atlas);
 request.success({longitude:geo[0],latitude:geo[1],accuracy:4});A.equal(p.data.originLabel,'我的位置 · ±4米');
 p.activate(18);A.equal(p.hole.number,18);A.equal(p.data.mode,'focus');p.onUnload();
});
test('every reference tee stays inside its reviewed platform in both continuous and legacy maps',()=>{
 const atlas=require(B+'/atlas-config').atlas,rows=require('../data/maps/qizhong-atlas/database.json'),review=require('../data/maps/qizhong-atlas/tee-review.json');
 A.equal(review.holes.length,18);
 for(const r of review.holes){
  const h=rows.find(h=>h._id===r.id),old=cfg.holes[r.id];
  const point=M.toPixel(h.tee,atlas),platform=r.teeOutline.map(p=>M.toPixel(p,atlas));
  A.ok(M.inside(point,platform),r.id+' start must be on its reviewed tee platform');
  A.ok(M.meters(h.tee,h.route[0])<.01,r.id+' route must start at the revised tee');
  A.ok(M.meters(h.tee,r.tee)<.01,r.id+' atlas preserves reviewed coordinates');
  A.ok(M.meters(M.toGeo(old.defaultOrigin,old),r.tee)<.1,r.id+' legacy crop preserves reviewed coordinates');
 }
});
