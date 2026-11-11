// Offline point-in-polygon lookup. Boundary data and wx.getLocation use GCJ-02.
let areas, loading;
const cityDataPath='../packages/location-data/location-cities-data';
function load(){
 if(areas||typeof require.async!=='function')return Promise.resolve(!!areas);
 if(!loading)loading=require.async('../packages/location-data/location-cities-data.js')
  .then(data=>{areas=data;return true;})
  .catch(()=>false)
  .finally(()=>{loading=null;});
 return loading;
}
const courseCities=new WeakMap();
function inRing(x,y,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ax,ay]=ring[i],[bx,by]=ring[j];
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}
function resolve(fix){
 if(!fix||!Number.isFinite(fix.longitude)||!Number.isFinite(fix.latitude))return null;
 if(!areas&&typeof module.require==='function')areas=module.require(cityDataPath);
 if(!areas&&typeof wx!=='undefined'&&wx.__preview)areas=require(cityDataPath);
 if(!areas)return null;
 const x=fix.longitude*10000,y=fix.latitude*10000;
 for(const [adcode,province,city,b,polygons] of areas){
  if(x<b[0]||y<b[1]||x>b[2]||y>b[3])continue;
  if(polygons.some(rings=>inRing(x,y,rings[0])&&!rings.slice(1).some(r=>inRing(x,y,r))))return {adcode,province,city};
 }
 return null;
}
function normalize(name){return String(name||'').trim().replace(/市$/,'');}
function sameCity(course,fix){
 if(!fix?.city)return false;
 // Catalog city labels sometimes contain a county or an old city name. Classify
 // the actual course coordinate with the same boundaries as the user's fix.
 let cached=courseCities.get(course);
 if(!cached||cached.latitude!==course.latitude||cached.longitude!==course.longitude){
  cached={latitude:course.latitude,longitude:course.longitude,area:resolve(course)};courseCities.set(course,cached);
 }
 const area=cached.area?.city?cached.area:course;
 if(area.province&&fix.province&&normalize(area.province)!==normalize(fix.province))return false;
 if(['北京市','天津市','上海市','重庆市','香港特别行政区','澳门特别行政区'].includes(fix.city))return normalize(area.province)===normalize(fix.city)||normalize(area.city)===normalize(fix.city);
 return normalize(area.city)===normalize(fix.city);
}
module.exports={load,resolve,sameCity};
