const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../miniprogram/services/account.js'),'utf8');
const p={uid:'u1',name:'原球友',wechatVerified:true,phoneVerified:true,profileCompleted:true,avatarUrl:''};
function setup(){
 const disk={},data={profile:{name:'高球爱好者'},rounds:[{id:'r1'}],pendingHandicapInputs:{}},calls=[];
 let handler=async action=>['login','phoneLogin'].includes(action)?{...p,phoneMasked:'138****0000'}:[];
 function fresh(){
  const module={exports:{}};
  const wx={getStorageSync:k=>structuredClone(disk[k]),setStorageSync:(k,v)=>disk[k]=structuredClone(v),cloud:{callFunction:async q=>{calls.push(q.data.action);return {result:await handler(q.data.action,q.data).then(data=>({ok:true,data}))};}}};
  vm.runInNewContext(source,{module,wx,Date,require:id=>id==='../config'?{cloudEnv:'env'}:id==='./store'?{read:()=>structuredClone(data),mutate:fn=>fn(data)}:id==='./cloud-client'?{init(){}}:id==='./cloud-sync'?{flush:async()=>{}}:null});
  return module.exports;
 }
 return {disk,data,calls,fresh,handler:fn=>handler=fn};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('cold start immediately restores public profile, then silently verifies an existing account',async()=>{
 const x=setup(),first=x.fresh();await first.loginWithPhone('one-use-code');const restarted=x.fresh();
 A.equal(restarted.user().name,p.name);A.equal(x.calls.length,1);await restarted.restore();await restarted.call('friends');
 A.deepEqual(x.calls,['phoneLogin','login','friends']);A.equal(x.data.rounds[0].id,'r1');
 A.doesNotMatch(JSON.stringify(x.disk),/session_key|access_token|openid|one-use/);
});
test('cloud writes wait for the current WeChat identity, not cached identity flags',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');const pending=deferred();x.handler(action=>action==='login'?pending.promise:Promise.resolve([]));
 const restarted=x.fresh(),write=restarted.call('saveRound',{});A.deepEqual(x.calls,['phoneLogin','login']);
 pending.resolve(p);await write;A.deepEqual(x.calls,['phoneLogin','login','saveRound']);
});
test('a switched WeChat identity cannot upload old-account scores or replace their profile',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');const before=structuredClone(x.data);x.handler(async()=>({...p,uid:'other'}));const restarted=x.fresh();
 await A.rejects(restarted.call('saveRound'),e=>e.code==='ACCOUNT_CHANGED');A.equal(restarted.user(),null);A.deepEqual(x.data,before);A.ok(!x.calls.includes('saveRound'));A.equal(x.fresh().user(),null);
});
test('temporary network failure preserves remembered login and retries silently',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');x.handler(async()=>{throw Error('offline');});const restarted=x.fresh();
 await A.rejects(restarted.restore(),/offline/);A.equal(restarted.user().uid,'u1');A.equal(x.fresh().user().uid,'u1');
 x.handler(async()=>p);await restarted.restore();A.equal(x.calls.filter(a=>a==='phoneLogin').length,1);
});
test('logout is remembered across starts and a delayed restore cannot reverse it',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');const wait=deferred();x.handler(()=>wait.promise);const restarted=x.fresh(),pending=restarted.restore();
 restarted.logout();wait.resolve(p);await A.rejects(pending,e=>e.code==='SESSION_ENDED');
 const next=x.fresh();A.equal(next.user(),null);A.equal(await next.restore(),null);A.equal(x.disk['qingye.account.v1'].loggedOut,true);A.equal(x.data.rounds.length,1);
});
test('old installed accounts silently migrate while first-time visitors do not auto-authorize',async()=>{
 const x=setup();A.equal(await x.fresh().restore(),null);A.deepEqual(x.calls,[]);x.data.profile.accountUid='u1';
 const migrated=x.fresh();await migrated.restore();A.equal(migrated.user().uid,'u1');A.deepEqual(x.calls,['login']);
});
test('phone login only remembers masked public profile, never the grant or full number',async()=>{
 const x=setup(),account=x.fresh();await account.loginWithPhone('one-use-code');
 const restarted=x.fresh();A.equal(restarted.user().phoneVerified,true);A.equal(restarted.user().phoneMasked,'138****0000');A.doesNotMatch(JSON.stringify(x.disk),/one-use-code|13800000000/);
});
test('an expired display cache still silently restores without asking for authorization again',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');x.disk['qingye.account.v1'].savedAt=Date.now()-31*86400000;
 const restarted=x.fresh();A.equal(restarted.user(),null);await restarted.restore();A.equal(restarted.user().uid,'u1');A.deepEqual(x.calls,['phoneLogin','login']);
});
test('logout during phone exchange prevents its delayed result from restoring login',async()=>{
 const x=setup(),account=x.fresh(),wait=deferred();x.handler(()=>wait.promise);
 const pending=account.loginWithPhone('one-use-code');account.logout();wait.resolve(p);
 await A.rejects(pending,e=>e.code==='SESSION_ENDED');A.equal(x.fresh().user(),null);
});
test('legacy WeChat-only cache cannot appear logged in or bypass phone verification',async()=>{
 const x=setup();x.data.profile.accountUid='u1';x.disk['qingye.account.v1']={version:1,profile:{...p,phoneVerified:false},savedAt:Date.now()};
 x.handler(async()=>({...p,phoneVerified:false}));const account=x.fresh();A.equal(account.user(),null);
 await A.rejects(account.restore(),e=>e.code==='AUTH_REQUIRED');A.equal(account.user(),null);A.equal(x.data.rounds.length,1);
 x.handler(async()=>p);await account.loginWithPhone('new-grant');A.equal(account.user().phoneVerified,true);A.equal(x.data.rounds.length,1);
});
test('an obsolete restore cannot undo a successful phone login',async()=>{
 const x=setup();x.data.profile.accountUid='u1';const wait=deferred();x.handler(action=>action==='login'?wait.promise:Promise.resolve(p));
 const account=x.fresh(),restored=account.restore(),check=A.rejects(restored,e=>e.code==='SESSION_ENDED');
 await account.loginWithPhone('new-grant');wait.resolve({...p,phoneVerified:false});await check;
 A.equal(account.user().phoneVerified,true);A.equal(x.fresh().user().phoneVerified,true);
});
test('startup and foreground restores share one request without another phone grant',async()=>{
 const x=setup();await x.fresh().loginWithPhone('one-use-code');const wait=deferred();x.handler(()=>wait.promise);const account=x.fresh();
 const first=account.restore(),second=account.restore();A.equal(first,second);wait.resolve(p);await first;await account.restore();
 A.deepEqual(x.calls,['phoneLogin','login']);
});
test('no phone grant or server phone verification means no new session',async()=>{
 const x=setup(),account=x.fresh();await A.rejects(account.loginWithPhone(''));await A.rejects(account.loginWithWechat(),e=>e.code==='AUTH_REQUIRED');A.deepEqual(x.calls,[]);
 x.handler(async()=>({...p,phoneVerified:false}));await A.rejects(account.loginWithPhone('one-use-code'),e=>e.code==='AUTH_REQUIRED');A.equal(account.user(),null);A.equal(x.disk['qingye.account.v1'],undefined);
});
