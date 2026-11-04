const A=require('../../services/account');
Page({
 data:{name:'',avatarUrl:'',busy:false,loggedIn:false,phoneMasked:'',error:'',notice:''},
 onShow(){
  const p=A.user();
  if(!p){this.dirty=false;this.avatarFile='';this.uploadedAvatar='';this.setData({name:'',avatarUrl:'',phoneMasked:'',error:'',notice:''});}
  this.setData({loggedIn:!!p?.phoneVerified,phoneMasked:p?.phoneMasked||''});
  if(!this.dirty)this.setData({name:p?.profileCompleted?p.name:'',avatarUrl:p?.avatarUrl||''});
 },
 async phoneLogin(e){
  if(this.data.busy||this.data.loggedIn)return;
  const d=e?.detail||{};
  if(!d.code){
   const refused=/deny|denied|cancel/i.test(d.errMsg||'');
   this.setData({error:refused?'你已取消手机号授权，可以继续浏览球场':d.errno===1400001?'手机号验证暂不可用，请联系小程序管理员':'未能获取手机号授权，请稍后重试',notice:''});return;
  }
  this.setData({busy:true,error:'',notice:''});
  try{
   const p=await A.loginWithPhone(d.code);
   this.setData({loggedIn:true,phoneMasked:p.phoneMasked,name:p.profileCompleted?p.name:'',avatarUrl:p.avatarUrl||'',notice:'登录成功'});
   wx.switchTab({url:'/pages/home/index',success(){wx.showToast({title:'登录成功',icon:'success'});},fail:()=>this.setData({error:'已登录，暂时无法打开首页，请稍后重试'})});
  }catch(err){this.setData({loggedIn:false,error:err.message||'验证失败，请重新授权'});}
  finally{this.setData({busy:false});}
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
 back(){wx.navigateBack({fail(){wx.switchTab({url:'/pages/courses/index'});}});}
});
