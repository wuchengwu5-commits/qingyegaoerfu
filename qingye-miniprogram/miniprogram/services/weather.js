const Geo=require('./weather-location');
const REFRESH_MS=60*60*1000,MAX_AGE_MS=75*60*1000,RETRY_MS=60*1000;
const CACHE_KEY='qingye.weather.v1';
const localCache={read(){try{return wx.getStorageSync(CACHE_KEY);}catch(ignore){return null;}},write(value){try{wx.setStorageSync(CACHE_KEY,value);}catch(ignore){}}};
function iconFor(code){
 const n=Number(code);if(n===100)return 'sun';if(n===150)return 'moon';
 if([101,102,103].includes(n))return 'cloud-sun';
 if([104,151,152,153].includes(n))return 'cloud';if([302,303,304].includes(n))return 'cloud-lightning';
 if(n>=300&&n<400)return 'cloud-rain';if(n>=400&&n<500)return 'cloud-snow';
 if(n>=500&&n<600)return 'cloud-fog';return 'question';
}
async function cloudLoad(point){
 const client=require('./cloud-client').init();
 if(!client?.callFunction){const e=Error('天气暂不可用');e.code='UNAVAILABLE';throw e;}
 const r=await client.callFunction({name:'qingyeWeather',data:{latitude:point.latitude,longitude:point.longitude}});
 if(!r.result?.ok){const e=Error('天气暂不可用');e.code=r.result?.code||'UNAVAILABLE';throw e;}return r.result.data;
}
function valid(data,now){return data&&typeof data.temperature==='number'&&Number.isFinite(data.temperature)&&data.temperature>=-100&&data.temperature<=70&&typeof data.condition==='string'&&data.condition.length>0&&data.condition.length<=30&&typeof data.fetchedAt==='number'&&data.fetchedAt<=now+60000&&now-data.fetchedAt<MAX_AGE_MS&&(data.windScale===null||(Number.isInteger(data.windScale)&&data.windScale>=0&&data.windScale<=17))&&typeof data.windDirection==='string';}
function createService({load=cloudLoad,now=Date.now,timeoutMs=12000,storage=localCache}={}){
 let current={status:'idle',data:null,key:'',city:'',message:'定位后显示天气'},epoch=0,inflight=null,lastAttempt=-Infinity;
 let cache=null;
 function cached(key){
  if(!cache){try{const saved=storage.read();cache=saved?.version===1&&Array.isArray(saved.entries)?saved.entries:[];}catch(ignore){cache=[];}}
  cache=cache.filter(e=>e&&typeof e.key==='string'&&valid(e.data,now())).slice(0,8);
  return cache.find(e=>e.key===key)?.data||null;
 }
 function remember(){cached(current.key);cache=[{key:current.key,data:{...current.data}},...cache.filter(e=>e.key!==current.key)].slice(0,8);try{storage.write({version:1,entries:cache});}catch(ignore){}}
 const listeners=new Set();
 function state(){return {...current,data:current.data?{...current.data}:null};}
 function emit(){for(const fn of listeners)fn(state());}
 function subscribe(fn){listeners.add(fn);fn(state());return()=>listeners.delete(fn);}
 function update(location,force=false){
  const p=Geo.point(location?.fix);
  if(!p){
   // A scheduled position refresh may temporarily clear the fix; keep the last area until it resolves.
   if(location?.status==='locating'&&current.key)return Promise.resolve(state());
   epoch++;inflight=null;current={status:'idle',data:null,key:'',city:'',message:location?.status==='locating'?'定位中…':'定位后显示天气'};emit();return Promise.resolve(state());
  }
  if(current.key!==p.key){epoch++;inflight=null;lastAttempt=-Infinity;const data=cached(p.key);current={status:data?'ready':'idle',data,key:p.key,city:location.fix.city||'',message:''};emit();}
  current.city=location.fix.city||'';
  if(current.data&&now()-current.data.fetchedAt>=MAX_AGE_MS){current.data=null;current.status='error';current.message='天气暂不可用';emit();}
  if(inflight)return inflight;
  if(!force&&current.data&&current.status==='ready'&&now()-current.data.fetchedAt<REFRESH_MS)return Promise.resolve(state());
  if(now()-lastAttempt<RETRY_MS)return Promise.resolve(state());
  const version=++epoch;lastAttempt=now();current.status=current.data?'refreshing':'loading';current.message='';emit();
  let timer;
  const request=Promise.race([Promise.resolve().then(()=>load(p)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
  const job=request.then(data=>{
   if(version!==epoch)return state();if(!valid(data,now()))throw Error('invalid weather');
   current={...current,data:{...data},status:'ready',message:''};remember();emit();return state();
  }).catch(e=>{
   if(version!==epoch)return state();
   if(current.data&&now()-current.data.fetchedAt>=MAX_AGE_MS)current.data=null;
   current.status=current.data?'stale':'error';current.message=current.data?'更新失败 · 上次天气':e.code==='CONFIG_REQUIRED'?'天气服务待开通':'天气暂不可用';emit();return state();
  }).finally(()=>{clearTimeout(timer);if(inflight===job)inflight=null;});
  inflight=job;return job;
 }
 return {state,subscribe,update,updateCourse:(course,force=false)=>update(Geo.forCourse(course),force)};
}
function shortWindDirection(direction){
 const aliases={'北东北风':'东北风','东东北风':'东北风','东东南风':'东南风','南东南风':'东南风','南西南风':'西南风','西西南风':'西南风','西西北风':'西北风','北西北风':'西北风'};
 return aliases[direction]||(direction||'风向待更新').replace(/^(东北|东南|西南|西北)偏[东西南北]风$/,'$1风');
}
function view(s){
 const d=s.data;return {...s,hasData:!!d,condition:d?.condition||'',temperature:d?Math.round(d.temperature)+'°C':'—',windDirection:shortWindDirection(d?.windDirection),windScale:d?.windScale==null?'—':d.windScale+'级',icon:'/assets/weather/'+iconFor(d?.conditionCode)+'.png',notice:s.status==='stale'?s.message:''};
}
function refreshDelay(s,now=Date.now()){
 if(s.data&&s.status==='ready')return Math.max(1000,s.data.fetchedAt+REFRESH_MS-now);
 if(s.data&&s.status==='stale')return Math.max(1000,s.data.fetchedAt+MAX_AGE_MS-now);
 return REFRESH_MS;
}
const service=createService();module.exports={...service,createService,view,iconFor,valid,refreshDelay,REFRESH_MS,MAX_AGE_MS};
