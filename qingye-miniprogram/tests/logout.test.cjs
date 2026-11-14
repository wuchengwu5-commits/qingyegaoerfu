const Dialog = require('../miniprogram/services/dialog');
const {test}=require('node:test'),A=require('node:assert/strict');
const accountPath=require.resolve('../miniprogram/services/account');
function setup(t){
 const paths=['../miniprogram/services/store','../miniprogram/services/cloud-sync','../miniprogram/services/cloud-client'].map(require.resolve);
 const old=paths.map(p=>require.cache[p]),oldAccount=require.cache[accountPath],oldWx=global.wx;
 const data={profile:{name:'旧昵称',accountUid:'u1'},rounds:[{id:'r1',scores:{1:4}}],pendingHandicapInputs:{},pendingRounds:{r1:{strokes:4}}};
 const calls=[];let exchange=async(action)=>({uid:'u1',name:'微信昵称',wechatVerified:true,phoneVerified:true});
 const stubs=[{read:()=>structuredClone(data),mutate:fn=>fn(data)},{flush:async()=>{}},{init(){}}];
 paths.forEach((p,i)=>require.cache[p]={id:p,filename:p,loaded:true,exports:stubs[i]});
 global.wx={cloud:{callFunction:async q=>{calls.push(q.data.action);return {result:{ok:true,data:await exchange(q.data.action,q.data)}};}}};
 delete require.cache[accountPath];const account=require(accountPath);
 t.after(()=>{paths.forEach((p,i)=>old[i]?require.cache[p]=old[i]:delete require.cache[p]);if(oldAccount)require.cache[accountPath]=oldAccount;else delete require.cache[accountPath];global.wx=oldWx;});
 return {account,data,calls,exchange:fn=>exchange=fn};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const user={uid:'u1',name:'微信昵称',wechatVerified:true,phoneVerified:true};
test('logout preserves local scores and pending data, blocks cloud access, and permits fresh authorization',async t=>{
 const x=setup(t);await x.account.loginWithPhone('first');const before=structuredClone(x.data);
 x.account.logout();A.equal(x.account.user(),null);A.deepEqual(x.data,before);
 const count=x.calls.length;await A.rejects(x.account.login(),e=>e.code==='AUTH_REQUIRED');
 await A.rejects(x.account.call('list'),e=>e.code==='AUTH_REQUIRED');A.equal(x.calls.length,count);
 await x.account.loginWithPhone('second');A.equal(x.account.user().uid,'u1');A.deepEqual(x.data.rounds,before.rounds);
});
test('a late phone authorization cannot log back in or clear a newer in-flight authorization',async t=>{
 const x=setup(t),first=deferred(),second=deferred();let n=0;
 x.exchange(()=>++n===1?first.promise:second.promise);
 const a=x.account.loginWithPhone('old'),check=A.rejects(a,e=>e.code==='SESSION_ENDED');
 x.account.logout();const b=x.account.loginWithPhone('new');first.resolve(user);await check;
 A.equal(x.account.user(),null);const c=x.account.loginWithPhone('duplicate');A.equal(n,2);
 second.resolve(user);await Promise.all([b,c]);A.equal(x.account.user().uid,'u1');
});
test('a profile response received after logout cannot restore login or overwrite local profile',async t=>{
 const x=setup(t);await x.account.loginWithPhone('first');const before=structuredClone(x.data),wait=deferred();
 x.exchange(()=>wait.promise);const pending=x.account.updateProfile('迟到的昵称');
 await Promise.resolve();const check=A.rejects(pending,e=>e.code==='SESSION_ENDED');
 x.account.logout();wait.resolve({...user,name:'迟到的昵称'});await check;
 A.equal(x.account.user(),null);A.deepEqual(x.data,before);
});
test('logout stops the remaining handicap sync queue without deleting pending values',async t=>{
 const x=setup(t);await x.account.loginWithPhone('first');await Promise.resolve();
 x.data.pendingHandicapInputs={r1:{slope:113},r2:{slope:120}};const before=structuredClone(x.data.pendingHandicapInputs),wait=deferred();
 x.exchange(()=>wait.promise);const running=x.account.syncRatings();x.account.logout();wait.resolve({});
 A.equal(await running,false);A.deepEqual(x.data.pendingHandicapInputs,before);A.equal(x.calls.filter(a=>a==='rating').length,1);
});
test('logout confirmation can be cancelled and confirmed logout returns to the signed-out profile',async t=>{
 const x=setup(t);await x.account.loginWithPhone('first');const uiPath=require.resolve('../miniprogram/services/ui'),saved=require.cache[uiPath];
 delete require.cache[uiPath];const ui=require(uiPath);t.after(()=>saved?require.cache[uiPath]=saved:delete require.cache[uiPath]);
 let modal,refresh=0,route='',toast='';Dialog.modal=q=>modal=q;Object.assign(wx,{switchTab:q=>route=q.url,showToast:q=>toast=q.title});
 ui.logout(()=>refresh++);modal.success({confirm:false});A.ok(x.account.user());A.equal(refresh,0);
 modal.success({confirm:true});A.equal(x.account.user(),null);A.equal(refresh,1);A.equal(route,'/pages/profile/index');A.equal(toast,'已退出登录');
});

