const {test}=require('node:test'),A=require('node:assert/strict'),crypto=require('node:crypto');
const W=require('../miniprogram/services/weather'),Geo=require('../miniprogram/services/weather-location'),P=require('../cloudfunctions/qingyeWeather/provider');
const time=Date.parse('2026-11-04T12:00:00Z'),loc={status:'ready',fix:{latitude:31.23,longitude:121.47,system:'gcj02',city:'上海市'}};
const data=(extra={})=>({temperature:20,condition:'晴',conditionCode:'100',windDirection:'东南风',windScale:3,fetchedAt:time,updatedAt:null,source:'和风天气',sourceUrl:'https://www.qweather.com',attributions:[],...extra});
const response=()=>({body:{metadata:{attributions:['https://developer.qweather.com/attribution.html']},condition:{text:'晴',code:'100'},temperature:{value:20,unit:'°C'},wind:{direction:{compass:'se'},scale:3,speed:{value:4,unit:'m/s'}}},headers:{}});
const flush=()=>new Promise(r=>setImmediate(r));
test('weather query converts GCJ02 then sends only coarse coordinates; invalid input is rejected',()=>{
 A.deepEqual(Geo.point(loc.fix),{latitude:31.23,longitude:121.47,key:'31.23,121.47'});
 const original={latitude:39.908823,longitude:116.39747,system:'gcj02'},p=Geo.point(original);
 A.equal(p.longitude,116.39);A.equal(p.latitude,39.91);A.equal(original.longitude,116.39747);
 for(const bad of [null,{}, {latitude:NaN,longitude:2},{latitude:0,longitude:0},{latitude:'31',longitude:121},{latitude:91,longitude:121}])A.equal(Geo.point(bad),null);
 A.equal(Geo.point({latitude:51.5074,longitude:-.1278,system:'gcj02'}).longitude,-.13);
});
test('weather only loads after location; duplicate requests coalesce and refresh after one hour',async()=>{
 let clock=time,calls=0;const service=W.createService({now:()=>clock,load:async p=>{calls++;A.deepEqual(Object.keys(p).sort(),['key','latitude','longitude']);return data({fetchedAt:clock});}});
 await service.update({status:'denied'});A.equal(calls,0);await Promise.all([service.update(loc),service.update(loc)]);A.equal(calls,1);
 clock=time+5*60000;await service.update(loc);A.equal(calls,1);clock=time+60*60000-1;await service.update(loc);A.equal(calls,1);clock++;await service.update(loc);A.equal(calls,2);A.equal(service.state().status,'ready');
});
test('switching locations discards old weather and a delayed response cannot overwrite the new area',async()=>{
 const jobs=[],service=W.createService({now:()=>time,load:p=>new Promise(resolve=>jobs.push({p,resolve}))});
 const first=service.update(loc);await flush();const second=service.update({status:'ready',fix:{latitude:40,longitude:116,city:'北京市'}});await flush();
 A.equal(service.state().data,null);jobs[1].resolve(data({temperature:8}));await second;jobs[0].resolve(data());await first;
 A.equal(service.state().data.temperature,8);A.equal(service.state().city,'北京市');
});
test('failed updates label recent cached data and remove values after seventy-five minutes',async()=>{
 let clock=time,failed=false,calls=0;const service=W.createService({now:()=>clock,load:async()=>{calls++;if(failed)throw Error('offline');return data();}});
 await service.update(loc);failed=true;clock+=W.REFRESH_MS;await service.update(loc);
 A.equal(service.state().status,'stale');A.match(W.view(service.state()).notice,/上次天气/);A.equal(service.state().data.temperature,20);
 await service.update(loc,true);A.equal(calls,2);clock=time+W.MAX_AGE_MS;await service.update(loc);A.equal(service.state().data,null);A.equal(service.state().status,'error');
});
test('revoked location clears cached weather and ignores an outstanding response',async()=>{
 let done;const service=W.createService({now:()=>time,load:()=>new Promise(r=>done=r)}),pending=service.update(loc);await flush();await service.update({status:'denied'});done(data());await pending;
 A.equal(service.state().data,null);A.equal(service.state().status,'idle');
});
test('missing credentials, timeouts, malformed and expired responses do not fabricate weather',async()=>{
 const cases=[async()=>{throw Object.assign(Error(),{code:'CONFIG_REQUIRED'});},async()=>data({temperature:null}),async()=>data({fetchedAt:time-W.MAX_AGE_MS}),()=>new Promise(()=>{})];
 for(const load of cases){const service=W.createService({now:()=>time,load,timeoutMs:5});await service.update(loc);A.equal(service.state().data,null);A.equal(service.state().status,'error');}
});
test('zero temperature and zero wind are valid; missing wind is distinct from calm; weather icons change',async()=>{
 const service=W.createService({now:()=>time,load:async()=>data({temperature:0,windScale:0,windDirection:'无风'})});await service.update(loc);
 A.equal(W.view(service.state()).temperature,'0°C');A.equal(W.view(service.state()).windScale,'0级');A.equal(W.view({data:data({windScale:null})}).windScale,'—');
 for(const [code,name] of [[100,'sun'],[150,'moon'],[101,'cloud-sun'],[104,'cloud'],[151,'cloud'],[152,'cloud'],[153,'cloud'],[302,'cloud-lightning'],[305,'cloud-rain'],[400,'cloud-snow'],[501,'cloud-fog'],[999,'question']])A.equal(W.iconFor(code),name);
});
test('provider uses current v1 coordinates and private authentication header, no credential in URL',async()=>{
 let seen;const provider=P.createProvider({env:{QWEATHER_HOST:'example.qweatherapi.com',QWEATHER_API_KEY:'test-key'},now:()=>time,request:async(url,headers)=>{seen={url,headers};return response();}});
 const r=await provider({latitude:31.23,longitude:121.47});A.equal(seen.url,'https://example.qweatherapi.com/weather/v1/current/31.23/121.47?lang=zh');A.equal(seen.headers['X-QW-Api-Key'],'test-key');A.equal(r.windScale,3);A.equal(r.windDirection,'东南风');A.equal(r.fetchedAt,time);A.equal(r.updatedAt,null);
});
test('provider coalesces and caches shared-area queries for one hour, then fetches again',async()=>{
 let clock=time,calls=0;const provider=P.createProvider({env:{QWEATHER_HOST:'example.qweatherapi.com',QWEATHER_API_KEY:'test'},now:()=>clock,request:async()=>{calls++;return response();}}),p={latitude:31.23,longitude:121.47};
 await Promise.all([provider(p),provider(p)]);await provider(p);A.equal(calls,1);clock=time+5*60000;await provider(p);A.equal(calls,1);clock=time+60*60000-1;await provider(p);A.equal(calls,1);clock++;await provider(p);A.equal(calls,2);
});
test('an older cloud cache schedules the next refresh at its one-hour expiry',()=>{
 A.equal(W.refreshDelay({status:'ready',data:data()},time+59*60000),60000);
 A.equal(W.refreshDelay({status:'ready',data:data()},time),3600000);
 A.equal(W.refreshDelay({status:'ready',data:data()},time+3600000),1000);
 A.equal(W.refreshDelay({status:'loading',data:null},time),3600000);
 A.equal(W.refreshDelay({status:'stale',data:data()},time+3600000),15*60000);
});
test('intermediate compass directions remain distinct with readable Chinese labels',()=>{
 const expected={nne:'东北偏北风',ene:'东北偏东风',ese:'东南偏东风',sse:'东南偏南风',ssw:'西南偏南风',wsw:'西南偏西风',wnw:'西北偏西风',nnw:'西北偏北风',nw:'西北风'};
 for(const [compass,direction] of Object.entries(expected)){const r=response();r.body.wind.direction.compass=compass;A.equal(P.normalize(r,time).windDirection,direction);}
});
test('home uses short wind labels while preserving the provider detail',()=>{
 for(const [full,short] of [['西北偏北风','西北风'],['西北偏西风','西北风'],['西西北风','西北风'],['北西北风','西北风'],['东北偏北风','东北风'],['东北偏东风','东北风'],['东南偏东风','东南风'],['东南偏南风','东南风'],['西南偏南风','西南风'],['西南偏西风','西南风'],['北风','北风'],['无风','无风'],['风向不定','风向不定']]){
  const original=data({windDirection:full}),v=W.view({data:original});A.equal(v.windDirection,short);A.equal(original.windDirection,full);
 }
 A.equal(W.view({data:null}).windDirection,'风向待更新');
});
test('account hosts support region subdomains while rejecting unrelated or malformed destinations',()=>{
 const p={latitude:31.23,longitude:121.47};
 for(const host of ['account.qweatherapi.com','h2a9cf3mhs.xy.qweatherapi.com',' https://ACCOUNT.XY.qweatherapi.com/ ']){
  const url=new URL(P.endpoint({QWEATHER_HOST:host},p));A.equal(url.protocol,'https:');A.ok(url.hostname.endsWith('.qweatherapi.com'));A.equal(url.pathname,'/weather/v1/current/31.23/121.47');
 }
 for(const host of ['qweatherapi.com','account.qweatherapi.com.evil.example','account.qweatherapi.com@evil.example','evil.example@account.qweatherapi.com','account..qweatherapi.com','-account.qweatherapi.com','account-.qweatherapi.com','account.qweatherapi.com:443','account.qweatherapi.com/path','account.qweatherapi.com?x=1','127.0.0.1','http://account.qweatherapi.com'])A.throws(()=>P.endpoint({QWEATHER_HOST:host},p),e=>e.code==='CONFIG_REQUIRED');
});
test('provider rejects unsupported units, stale source time and missing temperature; never guesses missing wind',()=>{
 let r=response();r.body.wind={};A.equal(P.normalize(r,time).windScale,null);A.equal(P.normalize(r,time).windDirection,'风向待更新');
 r=response();r.body.temperature.unit='°F';A.throws(()=>P.normalize(r,time));r=response();r.body.temperature.value=null;A.throws(()=>P.normalize(r,time));
 r=response();r.headers['last-modified']=new Date(time-16*60000).toUTCString();A.throws(()=>P.normalize(r,time),e=>e.code==='STALE');
});
test('upstream host is constrained and missing secrets fail before network access',async()=>{
 for(const env of [{},{QWEATHER_HOST:'https://evil.example'},{QWEATHER_HOST:'example.qweatherapi.com'}]){
  let called=false;const provider=P.createProvider({env,request:async()=>{called=true;return response();}});
  await A.rejects(provider({latitude:31,longitude:121}),e=>e.code==='CONFIG_REQUIRED');A.equal(called,false);
 }
});
test('JWT signs the current documented identity claims using Ed25519',()=>{
 const pair=crypto.generateKeyPairSync('ed25519'),env={QWEATHER_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),QWEATHER_KEY_ID:'key',QWEATHER_PROJECT_ID:'project',QWEATHER_DEVELOPER_ID:'developer'};
 const token=P.authorization(env,time).Authorization.slice(7),[header,payload,signature]=token.split('.');
 A.deepEqual(JSON.parse(Buffer.from(header,'base64url')), {alg:'EdDSA',kid:'key'});const claims=JSON.parse(Buffer.from(payload,'base64url'));A.equal(claims.iss,'developer');A.equal(claims.sub,'project');A.equal(claims.exp-claims.iat,900);A.ok(crypto.verify(null,Buffer.from(header+'.'+payload),pair.publicKey,Buffer.from(signature,'base64url')));
});

function disk(){let value;return {read:()=>structuredClone(value),write:v=>value=structuredClone(v)};}
test('course weather survives a restart and never waits for device location within one hour',async()=>{
 const storage=disk(),course={id:'golf',latitude:31.1067,longitude:121.2173,coordinateSystem:'gcj02',city:'上海市'};let calls=0;
 const opts={storage,now:()=>time,load:async p=>{calls++;A.deepEqual(p,Geo.point(Geo.forCourse(course).fix));return data();}};
 await W.createService(opts).updateCourse(course);const restarted=W.createService({...opts,now:()=>time+59*60000});
 const pending=restarted.updateCourse(course);A.equal(restarted.state().data.temperature,20);await pending;A.equal(calls,1);
});
test('persistent weather switches between course grids without mixing values or fetching again',async()=>{
 const storage=disk(),a={latitude:31,longitude:121},b={latitude:40,longitude:116};let calls=0;
 const opts={storage,now:()=>time,load:async p=>{calls++;return data({temperature:p.latitude});}};
 const first=W.createService(opts);await first.updateCourse(a);await first.updateCourse(b);
 const restarted=W.createService(opts);await restarted.updateCourse(a);A.equal(restarted.state().data.temperature,31);await restarted.updateCourse(b);A.equal(restarted.state().data.temperature,40);A.equal(calls,2);
});
test('a restarted weather cache refreshes after one hour and never exposes expired or malformed values',async()=>{
 const storage=disk();await W.createService({storage,now:()=>time,load:async()=>data()}).update(loc);
 let calls=0;const restored=W.createService({storage,now:()=>time+W.REFRESH_MS,load:async()=>{calls++;throw Error('offline');}});
 await restored.update(loc);A.equal(calls,1);A.equal(restored.state().status,'stale');A.equal(restored.state().data.temperature,20);
 const expired=W.createService({storage,now:()=>time+W.MAX_AGE_MS,load:async()=>{throw Error('offline');}});const pending=expired.update(loc);A.equal(expired.state().data,null);await pending;
 storage.write({version:1,entries:[{key:Geo.point(loc.fix).key,data:data({temperature:'bad'})}]});
 const corrupt=W.createService({storage,now:()=>time,load:async()=>{throw Error('offline');}});await corrupt.update(loc);A.equal(corrupt.state().data,null);
});
