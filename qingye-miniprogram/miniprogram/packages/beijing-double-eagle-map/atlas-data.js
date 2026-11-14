const Config=require('./atlas-config');
const Catalog=require('./atlas-catalog');
const Geo=require('./map-core');
const Gps=require('./gps-maps');
function parse(rows){
 if(!Array.isArray(rows)||rows.length!==Catalog.length)throw Error('球洞清单不完整');
 const seen=new Set();
 return rows.slice().sort((a,b)=>a.number-b.number).map((r,i)=>{
  const expected=Catalog[i],section=Config.groups.findIndex(g=>g.id===r.sectionId),group=Config.groups[section];
  if(!group||r._id!==expected._id||r.courseId!==Config.courseId||r.schema!==2||r.crs!=='EPSG:4326'||r.atlas!==Config.photo||r.number!==expected.number||r.par!==expected.par||seen.has(r._id))throw Error('洞序或底图不匹配');
  seen.add(r._id);
  function point(p){
   if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('坐标无效');
   const q=Geo.toPixel(p,Config.atlas);if(!Geo.inBounds(q,Config.atlas))throw Error('坐标超出底图');return q;
  }
  if(!Array.isArray(r.greenOutline)||r.greenOutline.length<3||!Array.isArray(r.route)||r.route.length<2)throw Error('球道几何无效');
  const green=point(r.green),outline=r.greenOutline.map(point);
  if(!Geo.inside(green,outline))throw Error('果岭中心超出轮廓');
  return {status:r.status||'',warning:r.status==='draft_tee_uncertain'?'参考发球台待核对，可拖动起点':'',teeOutline:(r.teeOutline||[]).map(point),id:r._id,section,sectionName:group.name,local:r.holeNumber,number:r.number,tag:group.short?group.short+r.holeNumber:String(r.number),color:r.status==='draft_tee_uncertain'?'#946c2d':group.color,par:r.par,tee:point(r.tee),target:point(r.par===3?r.green:r.target),green,outline,route:r.route.map(point)};
 });
}
async function read(){
 if(!Config.databaseGps)return {holes:parse(Catalog),source:'registered-package'};
 const result=await Gps.read(Config.courseId,Catalog.map(h=>h._id));
 const rows=Catalog.map(r=>{
  const h=result.maps[r._id];
  return {...r,tee:Geo.toGeo(h.defaultOrigin,h),target:Geo.toGeo(h.defaultTarget,h),green:Geo.toGeo(h.greenCenter,h),greenOutline:h.features[0].points.map(p=>Geo.toGeo(p,h)),route:h.focusRoute.map(p=>Geo.toGeo(p,h))};
 });
 return {holes:parse(rows),source:result.source};
}
module.exports={parse,read};
