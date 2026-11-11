const Geo = require('./map-core');
const atlas = require('./overview-data');
const client = require('../../services/cloud-client');
const cid = 'cn_bg_577';
const sections = ['老球场','天马场','新球场'];
const shorts = ['老','天','新'];
const colors = ['#204c37','#265570','#85562f'];

function parse(catalog) {
  if(!catalog?.ok||catalog.courseId!==cid||catalog.holes?.length!==27)throw Error('27 洞资料未完整');
  const rows=catalog.holes.slice().sort((a,b)=>a.number-b.number);
  return rows.map((r,i)=>{
    const section=Math.floor(i/9),local=i%9+1,id=cid+'_s'+(section+1)+'_h'+String(local).padStart(2,'0');
    if(r._id!==id||r.courseId!==cid||r.schema!==2||r.number!==i+1||r.holeNumber!==local||r.sectionId!==cid+'_s'+(section+1)||r.atlas!=='/packages/tianma-map/course-overview.jpg'||r.crs!=='EPSG:4326'||![3,4,5,6].includes(r.par))throw Error('球洞标识或底图不匹配');
    function pixel(p) {
      if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('GPS 数据无效');
      const q=Geo.toPixel(p,atlas);if(!Geo.inBounds(q,atlas))throw Error('洞位超出底图');return q;
    }
    if(!Array.isArray(r.greenOutline)||r.greenOutline.length<3||r.greenOutline.length>512||!Array.isArray(r.route)||r.route.length<2||r.route.length>512)throw Error('球道几何资料无效');
    const green=pixel(r.green),outline=r.greenOutline.map(pixel);
    if(!Geo.inside(green,outline))throw Error('果岭中心不在轮廓内');
    return {id,section,local,sectionName:sections[section],tag:shorts[section]+local,color:colors[section],number:i+1,par:r.par,tee:pixel(r.tee),target:pixel(r.target),green,outline,route:r.route.map(pixel)};
  });
}
async function read(){
  const key='qingye-atlas-v2/'+cid;
  try{
    const result=wx.__preview?await wx.readPreviewGpsCatalog(cid):(await client.init().callFunction({name:'qingyeGpsMaps',data:{courseId:cid}})).result;
    const holes=parse(result);
    try{wx.setStorageSync(key,result);}catch(_){}
    return {holes,source:wx.__preview?'preview':'database'};
  }catch(err){
    try{return {holes:parse(wx.getStorageSync(key)),source:'cache'};}catch(_){throw err;}
  }
}
module.exports={read,parse,sections};
