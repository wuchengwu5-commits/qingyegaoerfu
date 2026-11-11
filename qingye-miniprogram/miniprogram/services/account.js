const cfg=require('../config');
const KEY='qingye.account.v1',DISPLAY_AGE_MS=30*86400000;
let current=null,inflight=null,ratingsRunning=null,session=0,hydrated=false,verified=false,restoring=null,canRestore=false;
const listeners=new Set();
function configured(){return typeof cfg.cloudEnv==='string'&&!!cfg.cloudEnv.trim();}
function publicSession(p){return {uid:p.uid,name:p.name||'',avatarUrl:p.avatarUrl||'',wechatVerified:!!p.wechatVerified,phoneVerified:!!p.phoneVerified,phoneMasked:p.phoneMasked||'',profileCompleted:!!p.profileCompleted};}
function save(value){try{wx.setStorageSync(KEY,value);}catch(ignore){}}
function hydrate(){
 if(hydrated)return;hydrated=true;
 try{
  const saved=wx.getStorageSync(KEY),owner=require('./store').read().profile.accountUid;
  if(saved?.loggedOut)return;
  const p=saved?.version===1?saved.profile:null;
  canRestore=!!owner;
  if(p&&typeof p.uid==='string'&&p.uid===owner&&p.phoneVerified===true){
   canRestore=true;
   if(Number.isFinite(saved.savedAt)&&saved.savedAt<=Date.now()+60000&&Date.now()-saved.savedAt<DISPLAY_AGE_MS)current=publicSession(p);
  }
 }catch(ignore){}
}
function init(){hydrate();if(configured())require('./cloud-client').init();}
function user(){hydrate();return current;}
function emit(){for(const fn of listeners)fn(current);}
function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function active(epoch){if(epoch!==session){const e=Error('已退出登录，请重新登录');e.code='SESSION_ENDED';throw e;}}
function logout(){session++;current=null;inflight=null;ratingsRunning=null;restoring=null;verified=false;canRestore=false;hydrated=true;save({version:1,loggedOut:true});emit();}
async function exchange(action,data={},epoch=session){
 init();if(!configured())throw Error('微信登录与组队暂未开通，球场和地图仍可浏览');if(!wx.cloud?.callFunction)throw Error('请在微信小程序中使用登录与组队');
 const res=await wx.cloud.callFunction({name:'qingye',data:{action,...data}}),r=res.result;
 active(epoch);
 if(!r?.ok){const e=Error(r?.message||'连接失败，请稍后重试');e.code=r?.code;throw e;}return r.data;
}
async function call(action,data={}){
 const epoch=session;
 if(!(current&&verified)){await login();active(epoch);}
 try{const result=await exchange(action,data,epoch);active(epoch);return result;}
 catch(e){if(epoch===session&&['AUTH','AUTH_REQUIRED','ACCOUNT_CHANGED'].includes(e.code))logout();throw e;}
}
function accept(p){
 if(p?.phoneVerified!==true||typeof p.uid!=='string'||!p.uid){const e=Error('请先授权手机号并完成验证');e.code='AUTH_REQUIRED';throw e;}
 const S=require('./store'),old=S.read().profile.accountUid;
 if(old&&old!==p.uid){const e=Error('本机记录属于另一个微信账号，请使用原账号继续');e.code='ACCOUNT_CHANGED';throw e;}
 S.mutate(d=>{d.profile.accountUid=p.uid;if(p.name)d.profile.name=p.name;d.profile.avatarUrl=p.avatarUrl||'';if(p.handicapSetting&&!d.profile.handicapPending)d.profile.handicapSetting=p.handicapSetting;if(p.handicapInputs)d.personalHandicapInputs={...d.personalHandicapInputs,...p.handicapInputs,...d.pendingHandicapInputs};});
 current=p;verified=true;canRestore=true;save({version:1,profile:publicSession(p),savedAt:Date.now()});emit();return p;
}
function sync(){require('./cloud-sync').flush().catch(()=>{});syncRatings().catch(()=>{});}
function restore(){
 init();if(inflight)return inflight;if(verified)return Promise.resolve(current);if(restoring)return restoring;
 if(!canRestore)return Promise.resolve(null);
 const epoch=session;
 // The server's login action only reads an already-authorized WXContext account.
 // Cached profile fields never authenticate a cloud write or create an account.
 const job=exchange('login',{},epoch).then(p=>{active(epoch);return accept(p);}).then(p=>{active(epoch);sync();return p;}).catch(e=>{
  if(epoch===session&&['AUTH','AUTH_REQUIRED','ACCOUNT_CHANGED'].includes(e.code))logout();
  throw e;
 }).finally(()=>{if(restoring===job)restoring=null;});restoring=job;return job;
}
async function login(){
 hydrate();if(current&&verified)return current;
 const p=await restore();if(p)return p;
 const e=Error('请先完成手机号授权登录');e.code='AUTH_REQUIRED';throw e;
}
function authorize(action,data){
 if(inflight)return inflight;
 // A fresh phone grant supersedes an earlier silent restore. Its late response
 // must not clear or overwrite the newly verified session.
 const epoch=++session;restoring=null;
 const job=exchange(action,data,epoch).then(p=>{active(epoch);return accept(p);}).then(p=>{active(epoch);sync();return p;}).finally(()=>{if(inflight===job)inflight=null;});inflight=job;return job;
}
// Compatibility entry: only restore a previously phone-verified account.
async function loginWithWechat(){return login();}
async function loginWithPhone(code){if(typeof code!=='string'||!code.trim())throw Error('未获得手机号授权，请重新点击登录');return authorize('phoneLogin',{code});}
async function updateProfile(name,avatarUrl){const epoch=session;await login();active(epoch);const p=await call('profile',{name,...(avatarUrl!==undefined?{avatarUrl}:{})});active(epoch);return accept(p);}
async function uploadAvatar(filePath){
 const epoch=session,p=await login();active(epoch);init();if(!wx.cloud?.uploadFile)throw Error('请在微信小程序中选择头像');
 const ext=(filePath.match(/\.(jpe?g|png|webp)(?:\?|$)/i)||[])[1]||'jpg';
 const suffix=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
 const r=await wx.cloud.uploadFile({cloudPath:`profiles/${p.uid}/avatar-${suffix}.${ext.toLowerCase()}`,filePath});
 active(epoch);
 if(!r.fileID)throw Error('头像上传失败，请重试');return r.fileID;
}
async function friends(){await login();const list=await call('friends');require('./store').mutate(d=>{d.friends=[...d.friends.filter(f=>!f.accountUid),...list.map(p=>({id:p.uid,accountUid:p.uid,name:p.name,registered:true}))];});return list;}
async function syncRatings(){
 if(!current||!configured())return false;if(ratingsRunning)return ratingsRunning;
 const S=require('./store'),epoch=session,job=(async()=>{for(const [roundId,values] of Object.entries(S.read().pendingHandicapInputs||{})){
  if(epoch!==session||!current)return false;
  try{await call('rating',{roundId,values});S.mutate(d=>{if(JSON.stringify(d.pendingHandicapInputs?.[roundId])===JSON.stringify(values))delete d.pendingHandicapInputs[roundId];});}catch{return false;}
 }return true;})().finally(()=>{if(ratingsRunning===job)ratingsRunning=null;});ratingsRunning=job;return job;
}
function needLogin(){if(user())return true;wx.navigateTo({url:'/pages/account/index'});return false;}
module.exports={configured,init,user,subscribe,restore,call,login,loginWithWechat,loginWithPhone,logout,updateProfile,uploadAvatar,friends,needLogin,syncRatings};
