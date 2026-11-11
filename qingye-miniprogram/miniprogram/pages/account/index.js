const A=require('../../services/account');
const tabs=['pages/home/index','pages/courses/index','pages/play/index','pages/profile/index'];
Page({
 data:{name:'',avatarUrl:'',busy:false,loggedIn:false,phoneVerified:false,phoneMasked:'',error:'',notice:'',returnLabel:'先逛逛球场'},
 onLoad(){
  this.offAccount=A.subscribe(()=>{if(this.visible&&!this.data.busy)this.onShow();});
  const stack=typeof getCurrentPages==='function'?getCurrentPages():[],previous=stack[stack.length-2];
  if(previous&&/^(pages|packages)\/[a-z-]+\/index$/.test(previous.route||'')&&previous.route!=='pages/account/index'){
   const route=previous.route,query=Object.entries(previous.options||{}).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
   this.returnPage={route,url:'/'+route+(query?'?'+query:'')};
   this.setData({returnLabel:route==='pages/create/index'?'返回新建记分':'返回上一页'});
  }
 },
 onShow(){
  this.visible=true;
  const p=A.user();
  if(wx.setNavigationBarTitle)wx.setNavigationBarTitle({title:p?'账号资料':'手机号授权登录'});
  if(!p){this.dirty=false;this.avatarFile='';this.uploadedAvatar='';this.setData({name:'',avatarUrl:'',error:'',notice:''});}
  this.setData({loggedIn:!!p,phoneVerified:!!p?.phoneVerified,phoneMasked:p?.phoneMasked||''});
  if(!this.dirty)this.setData({name:p?.profileCompleted?p.name:'',avatarUrl:p?.avatarUrl||''});
 },
 onHide(){this.visible=false;},
 onUnload(){this.visible=false;this.unloaded=true;if(this.offAccount)this.offAccount();},
 async phoneLogin(e){
  if(this.data.busy||this.data.loggedIn)return;
  const detail=e?.detail||{};
  if(!detail.code){
   this.setData({error:'',notice:/deny|cancel/i.test(detail.errMsg||'')?'已取消手机号授权，尚未登录':'未获取手机号授权，请重新点击登录'});
   return;
  }
  this.setData({busy:true,error:'',notice:''});
  try{
   const p=await A.loginWithPhone(detail.code);
   if(this.visible===false)return;
   this.setData({loggedIn:true,phoneVerified:!!p.phoneVerified,phoneMasked:p.phoneMasked||'',name:p.profileCompleted?p.name:'',avatarUrl:p.avatarUrl||'',notice:'登录成功'});
   this.returnToSource(true);
  }catch(err){if(this.visible!==false)this.setData({loggedIn:false,error:err.message||'手机号验证未完成，请重试'});}
  finally{if(!this.unloaded)this.setData({busy:false});}
 },
 returnToSource(loggedIn=false){
  const success=()=>{if(loggedIn)wx.showToast({title:'登录成功',icon:'success'});};
  const fail=()=>this.setData({error:loggedIn?'已登录，返回失败，请点击左上角返回':'暂时无法返回，请稍后重试'});
  const target=this.returnPage;
  if(!target)return wx.switchTab({url:loggedIn?'/pages/profile/index':'/pages/courses/index',success,fail});
  // navigateBack resumes the original instance, retaining its draft and inputs.
  wx.navigateBack({delta:1,success,fail:()=>{
   if(tabs.includes(target.route))wx.switchTab({url:'/'+target.route,success,fail});
   else wx.redirectTo({url:target.url,success,fail});
  }});
 },
 chooseAvatar(e){if(!this.data.loggedIn||this.data.busy||!e.detail?.avatarUrl)return;this.dirty=true;this.avatarFile=e.detail.avatarUrl;this.uploadedAvatar='';this.setData({avatarUrl:this.avatarFile,error:''});},
 name(e){this.dirty=true;this.setData({name:e.detail.value});},
 async save(e){
  if(this.data.busy||!this.data.loggedIn)return;
  // Read the form after WeChat nickname validation, not a stale input event.
  const name=typeof e.detail?.value?.nickname==='string'?e.detail.value.nickname.trim():'';
  if(!name||name.length>16)return this.setData({error:'请填写 1–16 个字的昵称'});
  this.setData({busy:true,error:'',notice:''});
  try{
   if(this.avatarFile&&!this.uploadedAvatar)this.uploadedAvatar=await A.uploadAvatar(this.avatarFile);
   const p=await A.updateProfile(name,this.uploadedAvatar||undefined);
   this.avatarFile='';this.uploadedAvatar='';this.dirty=false;
   this.setData({name:p.name,avatarUrl:p.avatarUrl||'',notice:'头像和昵称已保存'});
   wx.showToast({title:'资料已保存',icon:'success'});
  }catch(err){this.setData({error:err.message||'保存失败，请重试'});}
  finally{this.setData({busy:false});}
 },
 logout(){if(this.data.busy)return;require('../../services/ui').logout(()=>this.onShow());},
 policy(){wx.openPrivacyContract({fail(){wx.showToast({title:'隐私保护指引暂不可用',icon:'none'});}});},
 back(){this.returnToSource();}
});
