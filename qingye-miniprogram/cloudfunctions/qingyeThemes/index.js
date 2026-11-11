const cloud=require('wx-server-sdk'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createService}=require('./catalog-service');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database(),collection='qy_backgrounds';
const errorText=e=>[e.message,e.errMsg].filter(Boolean).join(' ');
const missing=e=>/not exist|not found|does not exist|不存在|DOCUMENT_NOT_EXIST|COLLECTION_NOT_EXIST/i.test(errorText(e));
const repo={
 async ensure(){
  try{await db.collection(collection).limit(1).get();return;}catch(e){if(!missing(e)){e.stage='collection-read';throw e;}}
  try{await db.createCollection(collection);}catch(e){if(!/already exist|COLLECTION_EXIST|collection exist|已存在/i.test(errorText(e))){e.stage='collection';throw e;}}
 },
 async get(id){try{return (await db.collection(collection).doc(id).get()).data;}catch(e){if(missing(e))return null;e.stage='read';throw e;}},
 async set(id,data){try{await db.collection(collection).doc(id).set({data});}catch(e){e.stage='write';throw e;}}
};
const service=createService(repo,async seed=>{
 const fileContent=fs.readFileSync(path.join(__dirname,'assets',seed.asset));
 if(fileContent.length!==seed.bytes||fileContent.length>80000||crypto.createHash('sha256').update(fileContent).digest('hex')!==seed.sha256)throw Error('背景资源校验失败');
 try{return (await cloud.uploadFile({cloudPath:seed.cloudPath,fileContent})).fileID;}catch(e){e.stage='upload';throw e;}
});
exports.main=async(event={})=>{
 const ctx=cloud.getWXContext();if(ctx.APPID!=='wx771368adc305a848'||!ctx.OPENID)return {ok:false,message:'请从青野小程序访问'};
 try{
  if(event.action==='list')return {ok:true,data:await service.list()};
  if(event.action==='seedThumbnail'){
   const seed=require('./thumbnails.json').find(s=>s.id===event.id);if(!seed)return {ok:false,message:'未知缩略图'};
   const fileContent=fs.readFileSync(path.join(__dirname,'assets',seed.asset));
   if(fileContent.length!==seed.bytes||fileContent.length>5000||crypto.createHash('sha256').update(fileContent).digest('hex')!==seed.sha256)throw Error('缩略图校验失败');
   const result=await cloud.uploadFile({cloudPath:seed.cloudPath,fileContent});return {ok:true,data:{fileID:result.fileID,bytes:seed.bytes}};
  }
  // Idempotent installation of the eight fixed public assets, used during deployment only.
  if(event.action==='seedAsset')return {ok:true,data:await service.seedAsset(event.id)};
  return {ok:false,message:'未知操作'};
 }catch(e){console.error('theme catalog error',e);return {ok:false,message:'背景资源暂不可用，请稍后重试',stage:e.stage||'asset',code:String(e.errCode||e.code||'UNKNOWN')};}
};
