// Public course imagery is versioned in cloud storage; scoring stays local.
const cfg=require('../config');
const pending=new Map();
function remote(src){return typeof src==='string'&&(/^\/packages\/.*\.jpe?g$/i.test(src)||/^\/assets\/(course-[0-2]\.jpg|spring-lake\.webp)$/.test(src));}
function init(){return require('./cloud-client').init();}
function fileID(src){return remote(src)&&cfg.mediaRoot?cfg.mediaRoot+'/'+src.slice(1).replace(/\//g,'__'):src;}
function cachePath(src){return wx.env.USER_DATA_PATH+'/qingye-media-v1/'+encodeURIComponent(src);}
function forget(src){pending.delete(src);try{wx.getFileSystemManager().unlinkSync(cachePath(src));}catch(_){}}
function local(src){
 if(!remote(src)||!cfg.mediaRoot||typeof wx==='undefined'||wx.__preview)return Promise.resolve(src);
 if(pending.has(src))return pending.get(src);
 const task=new Promise((resolve,reject)=>{
  if(!wx.cloud)return reject(new Error('请更新微信后重试'));
  init();let fs,target;
  try{fs=wx.getFileSystemManager();target=cachePath(src);fs.accessSync(target);return resolve(target);}catch(_){}
  wx.cloud.downloadFile({fileID:fileID(src),config:{env:cfg.mediaEnv},success:r=>{
   if(!r.tempFilePath)return reject(new Error('图片下载未完成'));
   if(!fs||!target)return resolve(r.tempFilePath);
   try{fs.mkdirSync(wx.env.USER_DATA_PATH+'/qingye-media-v1',true);}catch(_){}
   try{fs.copyFile({srcPath:r.tempFilePath,destPath:target,success:()=>resolve(target),fail:()=>resolve(r.tempFilePath)});}catch(_){resolve(r.tempFilePath);}
  },fail:reject});
 }).catch(error=>{pending.delete(src);throw error;});
 pending.set(src,task);return task;
}
module.exports={init,fileID,local,forget,remote};
