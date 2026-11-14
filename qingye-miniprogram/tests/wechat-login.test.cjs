const Dialog = require('../miniprogram/services/dialog');
const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createService,uidFor}=require('../cloudfunctions/qingye/domain');
function memory(seed={}){let db=structuredClone(seed);const access={get:async(c,id)=>structuredClone(db[c+':'+id]||null),set:async(c,id,v)=>{db[c+':'+id]=structuredClone(v);}};return {...access,transaction:fn=>fn(access),dump:()=>structuredClone(db)};}
const now=1793836800000;
test('WeChat-only login cannot create or upgrade an unverified identity',async()=>{
 const repo=memory({'qy_users:legacy':{uid:'legacy',wechatAuthorizedAt:now,activityIds:['saved']}});
 let phones=0;const api=createService(repo,{now:()=>now,verifyPhone:async()=>{phones++;throw Error('unexpected phone exchange');}}).dispatch;
 for(const uid of ['new','legacy'])for(const action of ['wechatLogin','login','friends','create']){
  await A.rejects(api(uid,action,{phoneVerified:true,phone:{number:'13800000000',verifiedAt:now}}),e=>e.code==='AUTH_REQUIRED');
 }
 A.equal(phones,0);A.equal(repo.dump()['qy_users:new'],undefined);A.deepEqual(repo.dump()['qy_users:legacy'].activityIds,['saved']);
 await A.rejects(api('','wechatLogin'),e=>e.code==='AUTH');
});
test('WeChat login preserves existing account identity, friends, scores and profile',async()=>{
 const old={uid:'existing',name:'老球友',avatarUrl:'cloud://avatar',profileCompleted:true,friendUids:['friend'],activityIds:['saved-round'],createdAt:1,phone:{number:'13800000000',verifiedAt:2},handicapSetting:{mode:'manual',value:8}};
 const repo=memory({'qy_users:existing':old}),api=createService(repo,{now:()=>now}).dispatch;
 const first=await api('existing','wechatLogin'),second=await api('existing','wechatLogin');A.equal(first.uid,second.uid);A.equal(first.name,old.name);
 const saved=repo.dump()['qy_users:existing'];for(const key of ['friendUids','activityIds','createdAt','handicapSetting','phone','avatarUrl','profileCompleted'])A.deepEqual(saved[key],old[key]);
 A.doesNotMatch(JSON.stringify(first),/13800000000/);
});
test('cloud entry derives identity from WXContext and rejects wrong-app or missing context',async()=>{
 const documents=new Map();let phoneCalls=0,context={APPID:'wx771368adc305a848',OPENID:'wx-context-openid'};
 const db={collection:collection=>({doc:id=>({get:async()=>{if(!documents.has(collection+id))throw Error('not exist');return {data:documents.get(collection+id)};},set:async({data})=>documents.set(collection+id,data)})}),runTransaction:fn=>fn(db)};
 const cloud={DYNAMIC_CURRENT_ENV:'env',init(){},database:()=>db,getWXContext:()=>context,openapi:{phonenumber:{getPhoneNumber(){phoneCalls++;throw Error('not allowed');}}}};
 const file=path.resolve(__dirname,'../cloudfunctions/qingye/index.js'),realRequire=require('module').createRequire(file),out={};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='wx-server-sdk'?cloud:realRequire(name),exports:out,process});
 const uid=uidFor(context.OPENID,context.APPID);documents.set('qy_users'+uid,{uid,name:'球友',phone:{number:'13800000000',verifiedAt:now}});
 const result=await out.main({action:'wechatLogin',uid:'fake',OPENID:'fake'});A.equal(result.ok,true);A.equal(result.data.uid,uidFor(context.OPENID,context.APPID));A.equal(result.data.wechatVerified,true);A.equal(phoneCalls,0);
 context={APPID:'wrong',OPENID:'wx-context-openid'};A.equal((await out.main({action:'wechatLogin'})).code,'AUTH');context={APPID:'wx771368adc305a848'};A.equal((await out.main({action:'wechatLogin'})).code,'AUTH');
});
function page(t,previous={route:'pages/create/index',options:{course:'cn_bg_585',activity:'a',group:'g'}}){
 const file=require.resolve('../miniprogram/pages/account/index'),account=require('../miniprogram/services/account'),saved={...account},old={Page:global.Page,wx:global.wx,getCurrentPages:global.getCurrentPages};let def;
 const routes=[],toasts=[],stack=previous?[previous,{route:'pages/account/index'}]:[{route:'pages/account/index'}];
 account.user=()=>null;global.Page=x=>def=x;global.getCurrentPages=()=>stack;global.wx={showToast:q=>toasts.push(q.title),navigateBack:q=>{routes.push({kind:'back',delta:q.delta});q.success?.();},redirectTo:q=>{routes.push({kind:'redirect',url:q.url});q.success?.();},switchTab:q=>{routes.push({kind:'tab',url:q.url});q.success?.();}};
 delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};p.onLoad();p.onShow();
 t.after(()=>{Object.assign(account,saved);Object.assign(global,old);delete require.cache[file];});return {p,account,routes,toasts,stack};
}
test('successful login returns to the original create page after authorization, without automatically starting a round',async t=>{
 const {p,account,routes,toasts}=page(t);let complete;account.loginWithPhone=()=>new Promise(r=>complete=r);
 const pending=p.phoneLogin({detail:{code:'one-use-code'}});A.equal(p.data.busy,true);A.deepEqual(routes,[]);A.equal(p.data.returnLabel,'返回新建记分');
 complete({uid:'u1',wechatVerified:true,phoneVerified:true,name:'球友',profileCompleted:true});await pending;
 A.deepEqual(routes,[{kind:'back',delta:1}]);A.deepEqual(toasts,['登录成功']);A.equal(p.data.loggedIn,true);A.equal(p.data.busy,false);
 await p.phoneLogin({detail:{code:'one-use-code'}});A.equal(routes.length,1);
});
test('failed or repeated login stays on the page without success messages',async t=>{
 const {p,account,routes,toasts}=page(t);let calls=0,reject;account.loginWithPhone=()=>{calls++;return new Promise((_,r)=>reject=r);};
 const first=p.phoneLogin({detail:{code:'one-use-code'}});await p.phoneLogin({detail:{code:'one-use-code'}});A.equal(calls,1);reject(Error('网络连接失败'));await first;
 A.equal(p.data.loggedIn,false);A.equal(p.data.busy,false);A.equal(p.data.error,'网络连接失败');A.deepEqual(routes,[]);A.deepEqual(toasts,[]);
});
test('leaving during login cannot pull the user into another page when the response arrives',async t=>{
 const {p,account,routes,toasts}=page(t);let complete;account.loginWithPhone=()=>new Promise(r=>complete=r);
 const pending=p.phoneLogin({detail:{code:'one-use-code'}});p.onHide();p.onUnload();complete({uid:'u1',wechatVerified:true,phoneVerified:true,profileCompleted:true,name:'球友'});await pending;A.deepEqual(routes,[]);A.deepEqual(toasts,[]);
});
test('a missing stack falls back to the saved create route, including group parameters',async t=>{
 const {p,account,routes}=page(t);wx.navigateBack=q=>q.fail();account.loginWithPhone=async()=>({uid:'u1',wechatVerified:true,phoneVerified:true,profileCompleted:true,name:'球友'});await p.phoneLogin({detail:{code:'one-use-code'}});
 A.deepEqual(routes,[{kind:'redirect',url:'/pages/create/index?course=cn_bg_585&activity=a&group=g'}]);
});
test('login from a tab returns to that tab when native back is unavailable',async t=>{
 const {p,account,routes}=page(t,{route:'pages/profile/index',options:{}});wx.navigateBack=q=>q.fail();account.loginWithPhone=async()=>({uid:'u1',wechatVerified:true,phoneVerified:true,profileCompleted:true,name:'球友'});await p.phoneLogin({detail:{code:'one-use-code'}});A.deepEqual(routes,[{kind:'tab',url:'/pages/profile/index'}]);
});
test('direct entry safely returns to profile and a navigation failure does not undo successful login',async t=>{
 const {p,account,routes}=page(t,null);account.loginWithPhone=async()=>({uid:'u1',wechatVerified:true,phoneVerified:true,profileCompleted:true,name:'球友'});wx.switchTab=q=>{routes.push(q.url);q.fail();};await p.phoneLogin({detail:{code:'one-use-code'}});A.deepEqual(routes,['/pages/profile/index']);A.equal(p.data.loggedIn,true);A.match(p.data.error,/已登录/);
});
test('profile submit still reads validated nickname form contents',async t=>{
 const {p,account}=page(t);p.setData({loggedIn:true});let names=[];account.updateProfile=async name=>{names.push(name);return {name};};p.name({detail:{value:'stale nickname'}});
 await p.save({detail:{value:{nickname:''}}});A.deepEqual(names,[]);await p.save({detail:{value:{nickname:'新球友'}}});A.deepEqual(names,['新球友']);A.equal(p.data.name,'新球友');
});
test('new-round selections survive a login round-trip and start only after the user confirms again',async t=>{
 const S=require('../miniprogram/services/store'),account=require('../miniprogram/services/account'),config=require('../miniprogram/config');
 const old={Page:global.Page,wx:global.wx,getCurrentPages:global.getCurrentPages},user=account.user,needLogin=account.needLogin,login=account.loginWithPhone,oldConfig=config.testPlayersEnabled;let memory={},current=null,stack=[],routes=[];
 Dialog.modal=q=>q.success({confirm:true});global.wx={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast(){},navigateTo:q=>routes.push(q.url),navigateBack:q=>{stack.pop();stack.at(-1).onShow();q.success?.();},redirectTo:q=>routes.push(q.url),switchTab:q=>routes.push(q.url)};
 global.getCurrentPages=()=>stack;account.user=()=>current;account.needLogin=()=>{if(current)return true;wx.navigateTo({url:'/pages/account/index'});return false;};account.loginWithPhone=async()=>current={uid:'u1',wechatVerified:true,phoneVerified:true,profileCompleted:true,name:'球友'};config.testPlayersEnabled=true;S.init();
 const files=[];function make(name,options={}){let def;global.Page=x=>def=x;const f=require.resolve('../miniprogram/pages/'+name+'/index');files.push(f);delete require.cache[f];require(f);const p={...def,route:'pages/'+name+'/index',options,data:structuredClone(def.data||{}),setData(x){Object.assign(this.data,x);}};stack.push(p);p.onLoad?.(options);p.onShow?.();return p;}
 t.after(()=>{Object.assign(global,old);Object.assign(account,{user,needLogin,loginWithPhone:login});config.testPlayersEnabled=oldConfig;files.forEach(f=>delete require.cache[f]);});
 const create=make('create',{course:'cn_bg_585',demo:'1'});create.distanceUnit({currentTarget:{dataset:{unit:'m'}}});create.tee({currentTarget:{dataset:{pid:'local-test-2'}},detail:{value:2}});create.segment({currentTarget:{dataset:{which:'first'}},detail:{value:1}});create.template({currentTarget:{dataset:{id:'four_ball'}}});
 const before=structuredClone(S.read().draft);create.start();A.equal(S.active(),undefined);A.deepEqual(routes,['/pages/account/index']);
 const auth=make('account');await auth.phoneLogin({detail:{code:'one-use-code'}});A.equal(stack.at(-1),create);A.deepEqual(S.read().draft,before);A.equal(S.active(),undefined);
 create.start();const round=S.active();A.equal(round.distanceUnit,'m');A.equal(round.players.length,4);A.equal(round.players[2].tee,'White');A.deepEqual(round.ruleSnapshot,before.ruleSnapshot);A.equal(routes.at(-1),'/pages/play/index');A.deepEqual(require('../miniprogram/services/score-entry').consume(),{kind:'score',options:{id:round.id}});
});
test('cancelled, missing and failed phone authorization never logs in or navigates',async t=>{
 const {p,account,routes,toasts}=page(t);let codes=[];
 account.loginWithPhone=async code=>{codes.push(code);throw Error('验证已过期，请重新点击手机号快捷登录');};
 await p.phoneLogin({detail:{errMsg:'getPhoneNumber:fail user deny'}});A.equal(p.data.loggedIn,false);A.match(p.data.notice,/尚未登录/);A.deepEqual(codes,[]);
 await p.phoneLogin({detail:{errMsg:'getPhoneNumber:fail'}});A.equal(p.data.loggedIn,false);A.deepEqual(codes,[]);
 await p.phoneLogin({detail:{code:'expired-code'}});A.deepEqual(codes,['expired-code']);A.equal(p.data.loggedIn,false);A.match(p.data.error,/过期/);A.deepEqual(routes,[]);A.deepEqual(toasts,[]);
 const markup=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/account/index.wxml'),'utf8');A.match(markup,/open-type="getPhoneNumber" bindgetphonenumber="phoneLogin"/);A.doesNotMatch(markup,/bindtap="wechatLogin"|选填|不绑定/);
});
test('a hidden login page can be used again after the pending request fails',async t=>{
 const {p,account,routes}=page(t);let reject;account.loginWithPhone=()=>new Promise((_,r)=>reject=r);
 const pending=p.phoneLogin({detail:{code:'one-use-code'}});p.onHide();reject(Error('offline'));await pending;p.onShow();A.equal(p.data.busy,false);A.deepEqual(routes,[]);
});

test('first phone authorization stays for profile completion; avatar and validated nickname save before returning to the same group',async t=>{
 const {p,account,routes,stack}=page(t,{route:'pages/groups/index',options:{token:'abc123'}});let uploads=[],saved=[];
 account.loginWithPhone=async()=>({uid:'u1',phoneVerified:true,name:'高球爱好者',profileCompleted:false});
 account.uploadAvatar=async file=>{uploads.push(file);return 'cloud://test/profiles/u1/avatar-test.jpg';};
 account.updateProfile=async(name,avatarUrl)=>{saved.push({name,avatarUrl});return {uid:'u1',name,avatarUrl,phoneVerified:true,profileCompleted:true};};
 await p.phoneLogin({detail:{code:'grant'}});A.deepEqual(routes,[]);A.equal(p.data.loggedIn,true);A.equal(p.data.completingProfile,true);A.equal(p.data.name,'');
 p.chooseAvatar({detail:{avatarUrl:'wxfile://chosen.jpg'}});p.name({detail:{value:'旧的输入事件'}});
 await p.save({detail:{value:{nickname:'吴先生'}}});A.deepEqual(uploads,['wxfile://chosen.jpg']);A.equal(saved[0].name,'吴先生');A.equal(saved[0].avatarUrl,'cloud://test/profiles/u1/avatar-test.jpg');A.deepEqual(routes,[{kind:'back',delta:1}]);A.equal(stack[0].options.token,'abc123');
});
test('profile save rejects default names; upload failure retains fields for retry and never returns early',async t=>{
 const {p,account,routes}=page(t);account.loginWithPhone=async()=>({uid:'u1',phoneVerified:true,name:'高球爱好者'});await p.phoneLogin({detail:{code:'grant'}});
 let uploads=0,saves=0;account.uploadAvatar=async()=>{uploads++;if(uploads===1)throw Error('上传失败');return 'cloud://avatar';};account.updateProfile=async(name,avatarUrl)=>{saves++;if(saves===1)throw Error('保存失败');return {name,avatarUrl,profileCompleted:true};};
 p.chooseAvatar({detail:{avatarUrl:'wxfile://photo.jpg'}});p.chooseAvatar({detail:{}});A.equal(p.data.avatarUrl,'wxfile://photo.jpg');
 await p.save({detail:{value:{nickname:'高球爱好者'}}});A.equal(uploads,0);
 await p.save({detail:{value:{nickname:'陈先生'}}});A.equal(saves,0);A.deepEqual(routes,[]);A.equal(p.avatarFile,'wxfile://photo.jpg');
 await p.save({detail:{value:{nickname:'陈先生'}}});A.equal(uploads,2);A.equal(saves,1);A.deepEqual(routes,[]);
 await p.save({detail:{value:{nickname:'陈先生'}}});A.equal(uploads,2);A.equal(saves,2);A.equal(routes.length,1);
});
test('an already logged-in placeholder user is offered completion without requesting another phone grant',async t=>{
 const {p,account}=page(t);account.user=()=>({uid:'u1',phoneVerified:true,name:'高球爱好者',profileCompleted:false});p.onShow();
 A.equal(p.data.loggedIn,true);A.equal(p.data.completingProfile,true);A.equal(p.continueAfterSave,true);A.equal(p.data.name,'');
});
test('leaving while profile upload is pending cannot save or navigate later',async t=>{
 const {p,account,routes}=page(t);p.setData({loggedIn:true});p.chooseAvatar({detail:{avatarUrl:'wxfile://photo.jpg'}});let complete,saves=0;account.uploadAvatar=()=>new Promise(r=>complete=r);account.updateProfile=async()=>{saves++;};
 const pending=p.save({detail:{value:{nickname:'陈先生'}}});p.onHide();p.onUnload();complete('cloud://avatar');await pending;A.equal(saves,0);A.deepEqual(routes,[]);
});
test('nickname-only confirmation is allowed while avatar remains a deliberate user choice',async t=>{
 const {p,account,routes}=page(t);account.loginWithPhone=async()=>({uid:'u1',phoneVerified:true,profileCompleted:false});await p.phoneLogin({detail:{code:'grant'}});let avatar;
 account.updateProfile=async(name,value)=>{avatar=value;return {uid:'u1',name,profileCompleted:true};};await p.save({detail:{value:{nickname:'黄先生'}}});A.equal(avatar,undefined);A.equal(routes.length,1);
});
