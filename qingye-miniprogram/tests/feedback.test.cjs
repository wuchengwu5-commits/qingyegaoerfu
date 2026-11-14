const {test}=require('node:test'),A=require('node:assert/strict');
const {createService,ownerFor}=require('../cloudfunctions/qingyeFeedback/domain');
const alice=ownerFor('alice','app'),bob=ownerFor('bob','app'),admin=ownerFor('admin','app');
const token=n=>n.toString(16).padStart(64,'0');
function fixture(){
 let docs=new Map([['qy_feedback_admins:intake',{enabled:true}]]),tail=Promise.resolve(),clock=1000000;
 const key=(c,id)=>c+':'+id;
 const methods=map=>({async get(c,id){return structuredClone(map.get(key(c,id))||null);},async set(c,id,row){map.set(key(c,id),structuredClone(row));}});
 const repo={...methods(docs),async list(filter,cursor,limit){return [...docs.entries()].filter(([k,v])=>k.startsWith('qy_feedback:')&&(!filter.owner||v.owner===filter.owner)&&(!cursor||v.id>cursor)).map(([,v])=>structuredClone(v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);},transaction(fn){const job=tail.then(async()=>{const draft=new Map(docs);const result=await fn(methods(draft));docs.clear();for(const [k,v] of draft)docs.set(k,v);return result;});tail=job.catch(()=>{});return job;}};
 const service=createService(repo,()=>++clock);
 const submit=(owner=alice,n=1)=>service.dispatch(owner,{action:'submit',category:'功能异常',content:'第九洞记分页面打不开',contact:'测试联系方式',requestId:token(n)});
 const grant=()=>repo.set('qy_feedback_admins',admin,{enabled:true});
 const update=(row,status,n,extra={})=>service.dispatch(admin,{action:'update',id:row.id,version:row.version,status,operationId:token(n),...extra});
 return {repo,service,submit,grant,update,docs};
}
test('customers see their own feedback only; caller-supplied owner and admin fields cannot escalate',async()=>{
 const f=fixture();await f.submit();await f.submit(bob);
 const result=await f.service.dispatch(alice,{action:'mine',owner:bob,isAdmin:true});A.equal(result.items.length,1);A.equal(result.items[0].contact,undefined);A.equal(result.items[0].owner,undefined);
 await A.rejects(f.service.dispatch(alice,{action:'list',isAdmin:true}),{code:'FORBIDDEN'});
 await A.rejects(f.service.dispatch('invalid',{action:'mine'}),{code:'AUTH'});
});
test('simultaneous retries create one receipt and one rate-limit increment',async()=>{
 const f=fixture(),results=await Promise.all([f.submit(),f.submit(),f.submit()]);A.equal(new Set(results.map(x=>x.id)).size,1);
 A.equal((await f.repo.get('qy_feedback_limits',alice+'_0')).count,1);
 await A.rejects(f.service.dispatch(alice,{action:'submit',category:'体验建议',content:'修改后的另外一个问题',contact:'',requestId:token(1)}),{code:'CONFLICT'});
});
test('limits reject spam and invalid/oversized payloads without writing',async()=>{
 const f=fixture();for(let n=1;n<=20;n++)await f.submit(alice,n);
 await A.rejects(f.submit(alice,21),{code:'RATE_LIMIT'});await f.submit(alice,1);
 for(const data of [{category:'未知'},{content:'短'},{content:'字'.repeat(2001)},{contact:'字'.repeat(121)},{requestId:'bad'}])await A.rejects(f.service.dispatch(bob,{action:'submit',category:'功能异常',content:'不能正常进入页面',contact:'',requestId:token(1),...data}),{code:'INPUT'});
 A.equal((await f.service.dispatch(bob,{action:'mine'})).items.length,0);
});
test('admin must confirm before fixing, then verify release before resolving and replying',async()=>{
 const f=fixture();await f.grant();await f.submit();let row=(await f.service.dispatch(admin,{action:'list'})).items[0];
 await A.rejects(f.update(row,'resolved',1),{code:'TRANSITION'});
 await A.rejects(f.update(row,'fixing',2),{code:'TRANSITION'});
 row=await f.update(row,'confirmed',3,{note:'用户确认第1项'});A.ok(row.approvedAt);
 row=await f.update(row,'fixing',4);row=await f.update(row,'ready',5);
 await A.rejects(f.update(row,'resolved',6,{reply:'已修复'}),{code:'RELEASE_REQUIRED'});
 row=await f.update(row,'resolved',7,{reply:'记分页已修复，请更新后重试。',releaseVersion:'1.0.6',verification:'体验版复现步骤通过',note:'内部备注'});
 const customer=(await f.service.dispatch(alice,{action:'mine'})).items[0];A.equal(customer.status,'resolved');A.match(customer.reply,/记分页已修复/);A.equal(customer.note,undefined);A.equal(customer.verification,undefined);A.equal(customer.releaseVersion,'1.0.6');
});
test('admin permission is checked on every write and changes are versioned and audited once',async()=>{
 const f=fixture();await f.grant();await f.submit();const row=(await f.service.dispatch(admin,{action:'list'})).items[0];
 const first=await f.update(row,'confirmed',1,{reply:'已收到，正在核实'}),retry=await f.update(row,'confirmed',1,{reply:'已收到，正在核实'});A.equal(first.version,retry.version);
 A.equal([...f.docs.keys()].filter(k=>k.startsWith('qy_feedback_events:')).length,1);
 await A.rejects(f.update(row,'confirmed',2),{code:'CONFLICT'});
 await A.rejects(f.update(row,'confirmed',1,{reply:'不同回复'}),{code:'CONFLICT'});
 await f.repo.set('qy_feedback_admins',admin,{enabled:false});await A.rejects(f.update(first,'fixing',3),{code:'FORBIDDEN'});
});
test('pagination returns every feedback exactly once without leaking other owners',async()=>{
 const f=fixture();await f.grant();for(let n=1;n<=67;n++)await f.submit(ownerFor('person'+n,'app'),n);
 const ids=[],seen=new Set();let cursor='';do{const page=await f.service.dispatch(admin,{action:'list',cursor});for(const row of page.items){A.ok(!seen.has(row.id));seen.add(row.id);ids.push(row.id);}cursor=page.nextCursor;}while(cursor);A.equal(ids.length,67);
});
function pageFixture(){
 let memory={},definition,user={uid:'test-user'};const messages=[],listeners=new Set();
 global.wx={getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:x=>messages.push(x.title)};
 const Feedback=require('../miniprogram/services/feedback'),original={...Feedback};Feedback.enabled=()=>false;
 const Account=require('../miniprogram/services/account'),originalAccount={...Account};
 Account.user=()=>user;Account.login=async()=>{if(!user)throw Object.assign(Error('请先登录'),{code:'AUTH_REQUIRED'});return user;};Account.subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};Account.needLogin=()=>false;
 global.Page=x=>definition=x;delete require.cache[require.resolve('../miniprogram/pages/feedback/index')];require('../miniprogram/pages/feedback/index');
 const page={...definition,data:structuredClone(definition.data),setData(x){Object.assign(this.data,x);}};page.onLoad();page.setData({loggedIn:true});
 return {page,Feedback,messages,memory,logout(){user=null;for(const fn of listeners)fn(null);},restore(){page.onUnload();Object.assign(Feedback,original);Object.assign(Account,originalAccount);}};
}
test('draft survives failed submission and retry uses the same request id',async()=>{
 const f=pageFixture();try{
 f.page.input({currentTarget:{dataset:{key:'content'}},detail:{value:'反馈一个无法正常进入的问题'}});f.page.setData({connected:true});f.Feedback.token=async()=>token(42);const ids=[];
 f.Feedback.call=async(action,data)=>{ids.push(data.requestId);throw Error('网络失败');};
 await f.page.submit();await f.page.submit();A.deepEqual(ids,[token(42),token(42)]);A.match(f.page.data.draft.content,/无法正常/);A.equal(f.page.data.busy,false);A.match(f.page.data.error,/网络失败/);
 }finally{f.restore();}
});
test('successful submission clears only sent draft and refreshes actual receipts',async()=>{
 const f=pageFixture();try{
 f.page.input({currentTarget:{dataset:{key:'content'}},detail:{value:'反馈一个无法正常进入的问题'}});f.page.setData({connected:true});f.Feedback.token=async()=>token(43);f.Feedback.call=async()=>({id:'fb_test'});f.Feedback.all=async()=>[{id:'fb_test',content:'反馈内容',status:'new',created:1000}];
 await f.page.submit();A.equal(f.page.data.draft.content,'');A.equal(f.page.data.receipts[0].id,'fb_test');A.equal(f.page.data.tab,'history');
 }finally{f.restore();}
});
test('refresh does not overwrite a newer draft; page unload ignores late responses',async()=>{
 const f=pageFixture();try{
 f.page.setData({connected:true});let resolve;f.Feedback.all=()=>new Promise(r=>resolve=r);const job=f.page.status();
 f.page.input({currentTarget:{dataset:{key:'content'}},detail:{value:'正在编辑的下一条反馈'}});resolve([]);await job;A.equal(f.page.data.draft.content,'正在编辑的下一条反馈');
 const late=f.page.status();f.page.onUnload();resolve([{id:'late'}]);await late;A.equal(f.page.data.receipts.length,0);
 }finally{f.restore();}
});
test('service failure is visible, not reported as an empty feedback inbox',async()=>{
 const f=pageFixture();try{f.page.setData({connected:true});f.Feedback.all=async()=>{throw Error('服务无法读取');};await f.page.status();A.equal(f.page.data.error,'服务无法读取');}finally{f.restore();}
});

test('unchanged input events preserve the retry receipt; actual edits start a new submission',async()=>{
 const f=pageFixture();try{
 const input=value=>f.page.input({currentTarget:{dataset:{key:'content'}},detail:{value}});
 input('反馈一个无法正常进入的问题');f.page.setData({connected:true});f.Feedback.token=async()=>token(99);const ids=[];
 f.Feedback.call=async(action,data)=>{ids.push(data.requestId);throw Error('网络失败');};
 await f.page.submit();input('反馈一个无法正常进入的问题');f.page.category({detail:{value:0}});await f.page.submit();
 A.deepEqual(ids,[token(99),token(99)]);
 input('这里是用户新修改的反馈');A.equal(f.memory['qingye.feedback.native.v1'].draft.receiptToken,undefined);
 }finally{f.restore();}
});
test('returning to feedback management reloads actual inbox instead of showing a false empty state',async()=>{
 const f=pageFixture();try{
 f.Feedback.enabled=()=>true;f.Feedback.call=async()=>({isAdmin:true,ownerKey:admin,accepting:true});let called='';
 f.Feedback.all=async action=>{called=action;return [{id:'inbox',category:'功能异常',content:'真实读取的模拟反馈',created:1000,status:'new'}];};
 f.page.setData({tab:'admin'});await f.page.connect();A.equal(called,'list');A.equal(f.page.data.adminItems.length,1);A.equal(f.page.data.isAdmin,true);
 }finally{f.restore();}
});

test('feedback intake stays closed until backend configuration exists; client-created admin or intake records are rejected',async()=>{
 const f=fixture();await f.repo.set('qy_feedback_admins','intake',{enabled:false});
 await A.rejects(f.submit(),{code:'NOT_READY'});
 await f.repo.set('qy_feedback_admins','intake',{enabled:true,_openid:'client'});await A.rejects(f.submit(),{code:'NOT_READY'});
 await f.repo.set('qy_feedback_admins',alice,{enabled:true,_openid:'client'});A.equal((await f.service.dispatch(alice,{action:'access'})).isAdmin,false);
});

test('cloud entry rechecks trusted WeChat identity on warm invocations; payload identity cannot read another account',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=fixture(),appid='wx771368adc305a848';let caller={APPID:appid,OPENID:'owner-wechat'};
 const db={command:{gt:value=>({after:value})},collection(collection){return {
  doc(id){return {async get(){return {data:await f.repo.get(collection,id)};},async set({data}){await f.repo.set(collection,id,data);}};},
  where(filter){let count=51;return {orderBy(){return this;},limit(value){count=value;return this;},async get(){return {data:await f.repo.list(filter,filter._id?.after||'',count)};}};}
 };},runTransaction:fn=>fn(db)};
 const cloud={DYNAMIC_CURRENT_ENV:'test',init(){},database:()=>db,getWXContext:()=>({...caller})},exports={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/qingyeFeedback/index'),'utf8'),{exports,require:name=>name==='wx-server-sdk'?cloud:require('../cloudfunctions/qingyeFeedback/domain')});
 const call=data=>exports.main(data),ownerKey=ownerFor(caller.OPENID,appid);
 await f.repo.set('qy_feedback_admins',ownerKey,{enabled:true});
 const own=await call({action:'submit',category:'体验建议',content:'管理员账号提交的测试反馈',requestId:token(801)});A.equal(own.ok,true);
 A.equal((await call({action:'access'})).data.isAdmin,true);A.equal((await call({action:'list'})).data.items.length,1);
 caller={APPID:appid,OPENID:'another-wechat'};
 const forged={owner:ownerKey,ownerKey,isAdmin:true,OPENID:'owner-wechat',userInfo:{openId:'owner-wechat',appId:appid}};
 const access=await call({action:'access',...forged});A.equal(access.data.isAdmin,false);A.notEqual(access.data.ownerKey,ownerKey);
 const denied=await call({action:'list',...forged});A.equal(denied.ok,false);A.equal(denied.code,'FORBIDDEN');
 A.equal((await call({action:'mine',...forged})).data.items.length,0);
 const other=await call({action:'submit',category:'功能异常',content:'另一个微信账号自己的反馈',requestId:token(802),...forged});A.equal(other.ok,true);
 const mine=await call({action:'mine',...forged});A.equal(mine.data.items.length,1);A.equal(mine.data.items[0].id,other.data.id);A.notEqual(mine.data.items[0].id,own.data.id);
 caller={APPID:appid};A.equal((await call({action:'mine',...forged})).code,'AUTH');
});

test('ordinary account reconnect removes previous admin UI and cannot request the admin list',async()=>{
 const f=pageFixture();try{
 f.page.setData({isAdmin:true,tab:'admin',adminItems:[{id:'old-private-feedback'}],selected:{id:'old-private-feedback'}});
 f.Feedback.enabled=()=>true;f.Feedback.call=async()=>({isAdmin:false,accepting:true,ownerKey:bob});let adminReads=0;
 f.Feedback.all=async()=>{adminReads++;return [];};
 await f.page.connect();A.equal(f.page.data.isAdmin,false);A.equal(f.page.data.tab,'new');A.equal(f.page.data.adminItems.length,0);A.equal(f.page.data.selected,null);
 f.page.tab({currentTarget:{dataset:{id:'admin'}}});await f.page.loadAdmin();A.equal(f.page.data.tab,'new');A.equal(adminReads,0);
 }finally{f.restore();}
});

test('logged-out feedback page never calls cloud access and clears private content',async()=>{
 const f=pageFixture();try{
 f.page.setData({connected:true,isAdmin:true,tab:'admin',receipts:[{id:'private'}],adminItems:[{id:'private'}],selected:{id:'private'}});
 f.Feedback.enabled=()=>true;let requests=0;f.Feedback.call=async()=>{requests++;return {accepting:true,isAdmin:true};};
 f.logout();await f.page.connect();A.equal(requests,0);A.equal(f.page.data.loggedIn,false);A.equal(f.page.data.isAdmin,false);A.equal(f.page.data.receipts.length,0);A.equal(f.page.data.adminItems.length,0);A.equal(f.page.data.selected,null);A.equal(f.page.ownerKey,'');
 }finally{f.restore();}
});
test('logout clears visible feedback immediately and drops an already-requested history response',async()=>{
 const f=pageFixture();try{
 f.page.setData({connected:true,isAdmin:true,receipts:[{id:'old'}],adminItems:[{id:'old'}],selected:{id:'old'}});let finish;
 f.Feedback.all=()=>new Promise(resolve=>finish=resolve);const loading=f.page.status();
 f.logout();A.equal(f.page.data.receipts.length,0);A.equal(f.page.data.adminItems.length,0);A.equal(f.page.data.selected,null);
 finish([{id:'late',created:1}]);await loading;A.equal(f.page.data.receipts.length,0);A.equal(f.page.data.connected,false);
 }finally{f.restore();}
});
test('logout while preparing a submit cannot send or clear a preserved draft',async()=>{
 const f=pageFixture();try{
 f.page.input({currentTarget:{dataset:{key:'content'}},detail:{value:'退出时仍应保留的反馈草稿'}});f.page.setData({connected:true});let finish,requests=0;
 f.Feedback.token=()=>new Promise(resolve=>finish=resolve);f.Feedback.call=async()=>{requests++;return {};};f.Feedback.all=async()=>[];
 const submitting=f.page.submit();f.logout();finish(token(900));await submitting;
 A.equal(requests,0);A.equal(f.memory['qingye.feedback.native.v1'].draft.content,'退出时仍应保留的反馈草稿');A.equal(f.memory['qingye.feedback.native.v1'].draft.receiptToken,undefined);
 }finally{f.restore();}
});
test('unbound legacy local receipts are not shown as the currently signed-in user history',async()=>{
 const f=pageFixture();try{
 f.memory['qingye.feedback.native.v1']={receipts:[{id:'old-local',token:'legacy-token',content:'未经归属验证的旧内容'}]};
 f.page.setData({connected:true});f.Feedback.all=async()=>[];await f.page.status();A.equal(f.page.data.receipts.length,0);A.equal(f.memory['qingye.feedback.native.v1'].receipts.length,1);
 }finally{f.restore();}
});
test('logout cancels admin list rendering and disables export of a previous list',async()=>{
 const f=pageFixture();try{
 let finish,copies=0;wx.setClipboardData=()=>copies++;f.page.setData({connected:true,isAdmin:true,adminItems:[{id:'private'}]});
 f.Feedback.all=()=>new Promise(resolve=>finish=resolve);const loading=f.page.loadAdmin();f.logout();f.page.exportFeedback();
 finish([{id:'late',created:1}]);await loading;A.equal(f.page.data.adminItems.length,0);A.equal(f.page.data.isAdmin,false);A.equal(copies,0);
 }finally{f.restore();}
});
