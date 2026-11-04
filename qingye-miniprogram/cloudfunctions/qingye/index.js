const cloud=require('wx-server-sdk'),{createService,uidFor}=require('./domain');
const {createPhoneVerifier}=require('./phone');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function adapter(db){return {async get(c,id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(id))return null;try{return (await db.collection(c).doc(id).get()).data;}catch(e){if(/not exist|不存在|not found/i.test(e.message||''))return null;throw e;}},async set(c,id,data){const clean=JSON.parse(JSON.stringify(data));delete clean._id;await db.collection(c).doc(id).set({data:clean});}};}
const repo={...adapter(db),transaction:fn=>db.runTransaction(tx=>fn(adapter(tx)))};
exports.main=async (event={})=>{
 try{
  const context=cloud.getWXContext();if(context.APPID!=='wx771368adc305a848'||!context.OPENID)return {ok:false,code:'AUTH',message:'请从青野微信小程序访问'};
  const uid=uidFor(context.OPENID,context.APPID),service=createService(repo,{
   verifyPhone:createPhoneVerifier({exchange:q=>cloud.openapi.phonenumber.getPhoneNumber(q),appid:context.APPID,openid:context.OPENID}),
   avatarRoot:'cloud://cloud1-d7gketoi570d17f80.636c-cloud1-d7gketoi570d17f80-1524135194/profiles/'
  });
  if(event.action==='qrcode'){
   await service.dispatch(uid,'login');
   const inv=await repo.get('qy_invites',event.token);if(!inv||inv.issuerUid!==uid||inv.revoked||inv.expiresAt<=Date.now())return {ok:false,code:'EXPIRED',message:'邀请已失效，请重新生成'};
   const result=await cloud.openapi.wxacode.getUnlimited({scene:inv.token,page:'pages/groups/index',checkPath:false,envVersion:process.env.MINIPROGRAM_ENV_VERSION||'release',width:430});
   if(!result.buffer)throw Error('小程序码暂未生成');const file=await cloud.uploadFile({cloudPath:'invites/'+inv.token+'.png',fileContent:result.buffer});const links=await cloud.getTempFileURL({fileList:[file.fileID]}),url=links.fileList?.[0]?.tempFileURL;if(!url)throw Error('小程序码暂不可读取');return {ok:true,data:{url}};
  }
  return {ok:true,data:await service.dispatch(uid,event.action,event)};
 }catch(e){const known=typeof e.code==='string'&&/^[A-Z_]+$/.test(e.code);return {ok:false,code:known?e.code:'SERVER',message:known?e.message:'云服务暂不可用，请稍后重试'};}
};
