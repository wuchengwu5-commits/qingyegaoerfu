const P=require('./privacy'),City=require('./location-city');
const CACHE_MS=60*60*1000,MAX_AGE_MS=7*86400000,KEY='qingye.location.v1';
let fix=null,status='idle',error='',inflight=null,listeners=[],privacyDenied=false,hydrated=false,lastAttempt=0;
function usable(point){return point&&valid(point.latitude,point.longitude)&&point.system==='gcj02'&&Number.isFinite(point.time)&&point.time<=Date.now()+60000&&Date.now()-point.time<MAX_AGE_MS;}
function hydrate(){
 if(hydrated)return;hydrated=true;
 try{const saved=wx.getStorageSync(KEY);if(saved?.version===1&&usable(saved.fix)){fix=saved.fix;status='ready';}else if(saved)persist();}catch(ignore){}
}
function persist(){
 try{wx.setStorageSync(KEY,fix?{version:1,fix:{...fix,latitude:Number(fix.latitude.toFixed(3)),longitude:Number(fix.longitude.toFixed(3)),accuracy:Math.max(100,fix.accuracy||0)}}:null);}catch(ignore){}
}
function clearDenied(){fix=null;status='denied';error='未开启定位，点击授权或手动选择地区';persist();emit();}
function state(){hydrate();return {fix:fix?{...fix}:null,status,error,refreshing:!!inflight};}
function emit(){listeners.forEach(fn=>fn(state()));}
function subscribe(fn){listeners.push(fn);return()=>listeners=listeners.filter(x=>x!==fn);}
function updateCity(point){
 City.load().then(loaded=>{
  if(!loaded||fix!==point)return;
  const city=City.resolve(point);
  if(city){fix={...point,...city};persist();emit();}
 });
}
function request(force=false){
 hydrate();
 if(inflight)return inflight;
 if(fix&&!usable(fix)){fix=null;status='idle';persist();}
 if(!force&&fix&&Date.now()-fix.time<CACHE_MS){
  if(!fix.city)updateCity(fix);
  // Checking permission is cheap and never starts GPS or opens an authorization panel.
  if(typeof wx.getSetting==='function')return new Promise(resolve=>wx.getSetting({success:r=>{if(r.authSetting?.['scope.userLocation']===false)clearDenied();resolve(fix);},fail:()=>resolve(fix)}));
  return Promise.resolve(fix);
 }
 if(!force&&['denied','unavailable'].includes(status))return Promise.resolve(null);
 if(!force&&fix&&Date.now()-lastAttempt<60000)return Promise.resolve(fix);
 lastAttempt=Date.now();status=fix?'ready':'locating';error='';privacyDenied=false;
 inflight=P.ensure().catch(e=>{privacyDenied=true;throw e;}).then(()=>new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
  const timer=setTimeout(()=>finish(reject,Error('GPS timeout')),15000);
  try{wx.getLocation({type:'gcj02',isHighAccuracy:true,highAccuracyExpireTime:4000,
   success:r=>{
    if(!valid(r.latitude,r.longitude))return finish(reject,Error('定位返回无效'));
    const point={latitude:r.latitude,longitude:r.longitude,accuracy:r.accuracy,time:Date.now(),system:'gcj02'};
    finish(resolve,point);
   },fail:e=>finish(reject,e)});
  }catch(e){finish(reject,e);}
 })).then(point=>{
  const city=City.resolve(point);
  fix=city?{...point,...city}:point;status='ready';persist();
  if(!city)updateCity(point);
  return fix;
 }).catch(e=>{
  const denied=privacyDenied||/auth|deny|denied|privacy/i.test(e.errMsg||e.message||'');
  if(denied){clearDenied();return null;}
  if(fix&&!usable(fix))fix=null;
  status=fix?'ready':'unavailable';error=fix?'定位暂未更新，沿用上次位置':'暂时无法定位，点击重试或检查手机定位服务';
  return fix;
 }).finally(()=>{inflight=null;emit();});
 emit();return inflight;
}
function settings(){
 if(privacyDenied)return request(true);
 return new Promise(resolve=>{
  wx.openSetting({success:r=>{
   if(r.authSetting?.['scope.userLocation'])request(true).then(resolve);
   else {clearDenied();resolve(null);}
  },fail:()=>resolve(null)});
 });
}
function radians(n){return n*Math.PI/180;}
function valid(lat,lon){return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(lat===0&&lon===0);}
function distance(a,b){if(!a||!b||!valid(a.latitude,a.longitude)||!valid(b.latitude,b.longitude))return null;const x=radians(b.latitude-a.latitude),y=radians(b.longitude-a.longitude),q=Math.sin(x/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));}
function locateCourse(c,origin){const km=distance(origin,c),approx=!!(km!==null&&(c.coordinateSystem!=='gcj02'||c.coordinateStatus!=='verified'));return {...c,distanceKm:km,approximate:approx,distanceText:km===null?'距离待补充':(approx?'约 ':'')+(km<1?Math.round(km*1000/10)*10+' 米':km.toFixed(km<10?1:0)+' 公里')};}
function sort(courses,origin,cityFirst=false){return courses.map(c=>locateCourse(c,origin)).sort((a,b)=>(cityFirst?Number(City.sameCity(b,origin))-Number(City.sameCity(a,origin)):0)||(a.distanceKm===null?Infinity:a.distanceKm)-(b.distanceKm===null?Infinity:b.distanceKm)||a.name.localeCompare(b.name,'zh-CN'));}
function nearest(courses,origin){return origin?sort(courses.filter(c=>c.operationStatus!=='closed_reported'),origin).find(c=>c.distanceKm!==null)||null:null;}
module.exports={state,request,settings,subscribe,distance,valid,locateCourse,sort,nearest,CACHE_MS,MAX_AGE_MS};
