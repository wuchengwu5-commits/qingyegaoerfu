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
 for(const action of ['login','profile','create','friends'])await A.rejects(api('new',action,{name:'X',phoneVerified:true,phone:{number:'13800000000',verifiedAt:time}}),e=>e.code==='PHONE_REQUIRED');
 await A.rejects(api('new','phoneLogin',{phoneVerified:true}),e=>e.code==='PHONE_REQUIRED');A.deepEqual(repo.dump(),{});
});
test('phone upgrade preserves legacy records and excludes the number from responses',async()=>{
 const old={uid:'old',name:'原球友',friendUids:['friend'],activityIds:['old-round'],createdAt:1,handicapSetting:{mode:'manual',value:12}};
 const repo=memory({'qy_users:old':old}),verifyPhone=createPhoneVerifier({exchange:async()=>response(),appid,openid,now:()=>time}),api=service(repo,{verifyPhone});
 await A.rejects(api('old','login'),e=>e.code==='PHONE_REQUIRED');
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
function page(t){
 const modulePath=require.resolve('../miniprogram/pages/account/index'),account=require('../miniprogram/services/account'),saved={...account},oldPage=global.Page,oldWx=global.wx;let def,toasts=[],routes=[];
 account.user=()=>null;global.Page=x=>def=x;global.wx={showToast:x=>toasts.push(x),switchTab:x=>{routes.push(x.url);x.success?.();}};delete require.cache[modulePath];require(modulePath);
 const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};
 t.after(()=>{Object.assign(account,saved);global.Page=oldPage;global.wx=oldWx;delete require.cache[modulePath];});return {p,account,toasts,routes};
}
test('cancelled or quota-blocked authorization never calls login or shows success',async t=>{
 const {p,account,toasts,routes}=page(t);let calls=0;account.loginWithPhone=async()=>calls++;
 await p.phoneLogin({detail:{errMsg:'getPhoneNumber:fail user deny'}});A.equal(calls,0);A.equal(p.data.loggedIn,false);A.match(p.data.error,/取消/);
 await p.phoneLogin({detail:{errno:1400001}});A.equal(calls,0);A.equal(toasts.length,0);A.deepEqual(routes,[]);
});
test('duplicate grants are suppressed and a failed server verification cannot establish login',async t=>{
 const {p,account,toasts,routes}=page(t);let calls=0,reject;account.loginWithPhone=()=>{calls++;return new Promise((_,r)=>reject=r);};
 const first=p.phoneLogin({detail:{code:'one-use'}});A.equal(p.data.busy,true);await p.phoneLogin({detail:{code:'one-use'}});A.equal(calls,1);
 reject(Error('verification failed'));await first;A.equal(p.data.loggedIn,false);A.equal(p.data.busy,false);A.equal(toasts.length,0);A.deepEqual(routes,[]);
});
test('verified login shows masked phone; profile submit uses validated form contents',async t=>{
 const {p,account,toasts,routes}=page(t);account.loginWithPhone=async()=>({uid:'a',phoneVerified:true,phoneMasked:'138****0000',profileCompleted:false});
 await p.phoneLogin({detail:{code:'code'}});A.equal(p.data.loggedIn,true);A.equal(p.data.phoneMasked,'138****0000');A.equal(p.data.name,'');A.equal(toasts[0].title,'登录成功');A.deepEqual(routes,['/pages/home/index']);
 let saves=0;account.updateProfile=async name=>{saves++;return {name};};p.name({detail:{value:'stale nickname'}});
 await p.save({detail:{value:{nickname:''}}});A.equal(saves,0);await p.save({detail:{value:{nickname:'新球友'}}});A.equal(saves,1);A.equal(p.data.name,'新球友');
});
test('returning users go home only after phone verification completes',async t=>{
 const {p,account,routes}=page(t);let resolve;account.loginWithPhone=()=>new Promise(r=>resolve=r);
 const pending=p.phoneLogin({detail:{code:'new-code'}});A.deepEqual(routes,[]);
 resolve({uid:'a',phoneVerified:true,profileCompleted:true,name:'球友'});await pending;
 A.deepEqual(routes,['/pages/home/index']);A.equal(p.data.busy,false);
 await p.phoneLogin({detail:{code:'duplicate'}});A.equal(routes.length,1);
});
