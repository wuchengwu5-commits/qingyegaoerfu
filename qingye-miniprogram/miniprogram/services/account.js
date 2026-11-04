const cfg=require('../config');let current=null,inflight=null,ratingsRunning=null,session=0;
function configured(){return typeof cfg.cloudEnv==='string'&&!!cfg.cloudEnv.trim();}
function init(){if(configured())require('./cloud-client').init();}
function user(){return current;}
function active(epoch){if(epoch!==session){const e=Error('已退出登录，请重新登录');e.code='SESSION_ENDED';throw e;}}
function logout(){session++;current=null;inflight=null;ratingsRunning=null;}
async function call(action,data={}){
 const epoch=session;if(action!=='phoneLogin'&&!current?.phoneVerified){const e=Error('请先点击手机号快捷登录完成验证');e.code='PHONE_REQUIRED';throw e;}
 init();if(!configured())throw Error('微信登录与组队暂未开通，球场和地图仍可浏览');if(!wx.cloud?.callFunction)throw Error('请在微信小程序中使用登录与组队');
 const res=await wx.cloud.callFunction({name:'qingye',data:{action,...data}}),r=res.result;
 active(epoch);
 if(!r?.ok){const e=Error(r?.message||'连接失败，请稍后重试');e.code=r?.code;throw e;}return r.data;
}
function accept(p){
 if(!p?.phoneVerified||!p.uid)throw Error('请先完成手机号验证');
 const S=require('./store'),old=S.read().profile.accountUid;if(old&&old!==p.uid)throw Error('本机记录属于另一个微信账号，请使用原账号继续');
 S.mutate(d=>{d.profile.accountUid=p.uid;if(p.name)d.profile.name=p.name;d.profile.avatarUrl=p.avatarUrl||'';if(p.handicapSetting&&!d.profile.handicapPending)d.profile.handicapSetting=p.handicapSetting;if(p.handicapInputs)d.personalHandicapInputs={...d.personalHandicapInputs,...p.handicapInputs,...d.pendingHandicapInputs};});
 current=p;return p;
}
async function login(){if(current?.phoneVerified)return current;const e=Error('请先点击手机号快捷登录完成验证');e.code='PHONE_REQUIRED';throw e;}
async function loginWithPhone(code){
 if(inflight)return inflight;
 if(typeof code!=='string'||!code.trim())throw Error('未获得手机号授权，请重新点击登录');
 const epoch=session,job=call('phoneLogin',{code}).then(p=>{active(epoch);return accept(p);}).then(p=>{active(epoch);require('./cloud-sync').flush().catch(()=>{});syncRatings().catch(()=>{});return p;}).finally(()=>{if(inflight===job)inflight=null;});inflight=job;return job;
}
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
module.exports={configured,init,user,call,login,loginWithPhone,logout,updateProfile,uploadAvatar,friends,needLogin,syncRatings};
