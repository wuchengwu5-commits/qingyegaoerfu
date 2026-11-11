const {test}=require('node:test'),A=require('node:assert/strict');
const {createPhoneVerifier}=require('../cloudfunctions/qingye/phone'),{createService}=require('../cloudfunctions/qingye/domain');
const time=1793680000000,appid='wx-test',openid='openid-from-wx-context';
function response(overrides={}){return {errcode:0,phone_info:{purePhoneNumber:'13800000000',countryCode:'86',watermark:{appid,timestamp:time/1000},...overrides}};}
function memory(seed={}){let db=structuredClone(seed);const access={get:async(c,id)=>structuredClone(db[c+':'+id]||null),set:async(c,id,v)=>{db[c+':'+id]=structuredClone(v);}};return {...access,transaction:fn=>fn(access),dump:()=>structuredClone(db)};}
function service(repo,extra={}){return createService(repo,{now:()=>time,random:()=> 'a'.repeat(24),avatarRoot:'cloud://test.bucket/profiles/',...extra}).dispatch;}
test('phone exchange binds the component code to the current server OpenID',async()=>{
 let args;const verify=createPhoneVerifier({exchange:async q=>(args=q,response()),appid,openid,now:()=>time});
 const phone=await verify('one-use-component-code');A.deepEqual(args,{code:'one-use-component-code',openid});A.deepEqual(phone,{number:'13800000000',countryCode:'86',verifiedAt:time});
});
test('missing, invalid, cross-app and stale phone grants are never accepted',async()=>{
 let called=0;const verify=createPhoneVerifier({exchange:async()=>{called++;return response();},appid,openid,now:()=>time});
 await A.rejects(verify(''),e=>e.code==='PHONE_REQUIRED');A.equal(called,0);
 for(const result of [{errcode:40029},response({watermark:{appid:'another-app',timestamp:time/1000}}),response({watermark:{appid,timestamp:time/1000-301}}),response({purePhoneNumber:'not-a-number'})]){
  await A.rejects(createPhoneVerifier({exchange:async()=>result,appid,openid,now:()=>time})('code'));
 }
 await A.rejects(createPhoneVerifier({exchange:async()=>{throw {errCode:40029};},appid,openid,now:()=>time})('used-code'),e=>e.code==='PHONE_CODE_EXPIRED');
});
test('legacy login and a forged phone field cannot create or upgrade an account',async()=>{
 const repo=memory(),api=service(repo);
 for(const action of ['login','profile','create','friends'])await A.rejects(api('new',action,{name:'X',phoneVerified:true,phone:{number:'13800000000',verifiedAt:time}}),e=>e.code==='AUTH_REQUIRED');
 await A.rejects(api('new','phoneLogin',{phoneVerified:true}),e=>e.code==='PHONE_REQUIRED');A.deepEqual(repo.dump(),{});
});
test('phone upgrade preserves legacy records and excludes the number from responses',async()=>{
 const old={uid:'old',name:'原球友',friendUids:['friend'],activityIds:['old-round'],createdAt:1,wechatAuthorizedAt:time,handicapSetting:{mode:'manual',value:12}};
 const repo=memory({'qy_users:old':old}),verifyPhone=createPhoneVerifier({exchange:async()=>response(),appid,openid,now:()=>time}),api=service(repo,{verifyPhone});
 await A.rejects(api('old','login'),e=>e.code==='AUTH_REQUIRED');
 const p=await api('old','phoneLogin',{code:'real-component-code',uid:'forged',phone:{number:'fake'}});
 A.equal(p.uid,'old');A.equal(p.phoneVerified,true);A.equal(p.phoneMasked,'138****0000');A.equal(p.phone,undefined);A.doesNotMatch(JSON.stringify(p),/13800000000/);
 const stored=repo.dump()['qy_users:old'];A.deepEqual(stored.activityIds,old.activityIds);A.deepEqual(stored.handicapSetting,old.handicapSetting);A.equal(stored.createdAt,1);A.equal(stored.phone.number,'13800000000');
});
test('friends never receive phone information and avatars must belong to their owner',async()=>{
 const phone={number:'13800000000',countryCode:'86',verifiedAt:time};
 const repo=memory({'qy_users:a':{uid:'a',name:'甲',phone,friendUids:['b'],activityIds:[]},'qy_users:b':{uid:'b',name:'乙',phone,friendUids:[],activityIds:[]}}),api=service(repo);
 A.deepEqual(await api('a','friends'),[{uid:'b',name:'乙',avatarUrl:''}]);
 await A.rejects(api('a','profile',{name:'甲',avatarUrl:'cloud://test.bucket/profiles/b/avatar-1.jpg'}),e=>e.code==='INVALID');
 const p=await api('a','profile',{name:'甲',avatarUrl:'cloud://test.bucket/profiles/a/avatar-1.jpg'});A.equal(p.profileCompleted,true);A.equal(p.avatarUrl,'cloud://test.bucket/profiles/a/avatar-1.jpg');
});

test('native component code reaches cloud phone exchange and a fresh app restores without exchanging again',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const context={APPID:'wx771368adc305a848',OPENID:'server-openid'},records=new Map(),grants=[],requests=[],disk={},local={profile:{name:'原球友'},rounds:[{id:'saved-round'}],pendingHandicapInputs:{}};
 const db={collection:c=>({doc:id=>({get:async()=>{if(!records.has(c+id))throw Error('not exist');return {data:structuredClone(records.get(c+id))};},set:async({data})=>records.set(c+id,structuredClone(data))})}),runTransaction:fn=>fn(db)};
 const cloud={DYNAMIC_CURRENT_ENV:'env',init(){},database:()=>db,getWXContext:()=>context,openapi:{phonenumber:{getPhoneNumber:async q=>{grants.push(q);return {errCode:0,phoneInfo:{purePhoneNumber:'13800000000',countryCode:'86',watermark:{appid:context.APPID,timestamp:Date.now()/1000}}};}}}};
 const entry=path.resolve(__dirname,'../cloudfunctions/qingye/index.js'),realRequire=require('node:module').createRequire(entry),out={};
 vm.runInNewContext(fs.readFileSync(entry,'utf8'),{exports:out,process,require:id=>id==='wx-server-sdk'?cloud:realRequire(id)});
 const source=fs.readFileSync(path.resolve(__dirname,'../miniprogram/services/account.js'),'utf8');
 function restart(){
  const module={exports:{}},wx={getStorageSync:k=>structuredClone(disk[k]),setStorageSync:(k,v)=>disk[k]=structuredClone(v),cloud:{callFunction:async q=>{requests.push(q.data.action);return {result:await out.main(q.data)};}}};
  vm.runInNewContext(source,{module,Date,wx,require:id=>id==='../config'?{cloudEnv:'env'}:id==='./store'?{read:()=>structuredClone(local),mutate:fn=>fn(local)}:id==='./cloud-client'?{init(){}}:id==='./cloud-sync'?{flush:async()=>{}}:null});
  return module.exports;
 }
 const first=restart();A.equal(first.user(),null);await first.loginWithPhone('real-component-code');A.equal(first.user().phoneVerified,true);A.equal(grants.length,1);A.equal(grants[0].openid,context.OPENID);A.equal(grants[0].code,'real-component-code');
 const next=restart();A.equal(next.user().phoneVerified,true);await next.restore();await next.call('friends');A.deepEqual(requests,['phoneLogin','login','friends']);A.equal(grants.length,1);A.equal(local.rounds[0].id,'saved-round');A.doesNotMatch(JSON.stringify(disk),/13800000000|real-component-code|server-openid/);
});
