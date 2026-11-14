// Public course imagery is versioned in cloud storage; scoring stays local.
const cfg=require('../config');
const pending=new Map();
const Cache=require('./media-cache');
function remote(src){return typeof src==='string'&&(/^\/packages\/.*\.jpe?g$/i.test(src)||/^\/assets\/(course-[0-2]\.jpg|spring-lake\.webp)$/.test(src)||['backgrounds-v1/','course-thumbs-v1/','hole-reference-v1/','hole-gps-v1/'].some(dir=>src.startsWith((cfg.mediaRoot||'').replace(/\/media-v1\/?$/,'')+'/'+dir)));}
function init(){return require('./cloud-client').init();}
function fileID(src){return /^cloud:\/\//.test(src)?src:remote(src)&&cfg.mediaRoot?cfg.mediaRoot+'/'+src.slice(1).replace(/\//g,'__'):src;}
function cachePath(src){return wx.env.USER_DATA_PATH+'/qingye-media-v1/'+encodeURIComponent(src);}
function forget(src){pending.delete(src);Cache.forget(src);try{wx.getFileSystemManager().unlinkSync(cachePath(src));}catch(_){}}
function bounded(promise,ms,message){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
function download(src, map){
 return new Promise((resolve,reject)=>{
  let settled=false,task;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
  const timer=setTimeout(()=>{finish(reject,new Error('图片下载超时'));task?.abort?.();},map?6500:15000);
  try{task=wx.cloud.downloadFile({fileID:fileID(src),config:{env:cfg.mediaEnv},success:r=>{
   if(r.tempFilePath)return finish(resolve,r.tempFilePath);
   finish(reject,new Error('图片下载未完成'));
  },fail:e=>finish(reject,e)});}catch(e){finish(reject,e);}
 });
}
function fallbackRequest(src){
 if(/^\/packages\/[^/]+-map\/.*\.jpe?g$/i.test(src))return {action:'mapImage',name:src.slice(1).replace(/\//g,'__')};
 const root=(cfg.mediaRoot||'').replace(/\/media-v1\/?$/,'')+'/hole-reference-v1/';
 if(src.startsWith(root))return {action:'referenceImage',name:src.slice(root.length)};
 return null;
}
async function downloadMapThroughFunction(src,fs,target,request){
 const deadline=Date.now()+15000;
 async function chunk(index){
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('球道图片下载超时，请重试');
  const {result}=await bounded(wx.cloud.callFunction({name:'qingyeGpsMaps',config:{env:cfg.mediaEnv},data:{...request,index}}),Math.min(8000,remaining),'球道图片下载超时，请重试');
  if(!result?.ok||result.index!==index||!Number.isInteger(result.chunks)||result.chunks<=index||result.chunks>8||typeof result.data!=='string'||!result.data){
   throw new Error('球道图片下载未完成');
  }
  return result;
 }
 const first=await chunk(0),parts=[first.data];
 for(let i=1;i<first.chunks;i++){
  const part=await chunk(i);
  if(part.chunks!==first.chunks)throw new Error('球道图片下载未完成');
  parts.push(part.data);
 }
 await bounded(new Promise((success,fail)=>fs.writeFile({filePath:target,data:parts.join(''),encoding:'base64',success,fail})),3000,'图片保存超时，请重试');
 Cache.stored(src);
 return target;
}
function local(src){
 if(!remote(src)||!cfg.mediaRoot||typeof wx==='undefined'||wx.__preview)return Promise.resolve(src);
 if(pending.has(src))return pending.get(src);
 const task=(async()=>{
  if(!wx.cloud)throw new Error('请更新微信后重试');
  init();let fs,target;
  try{fs=wx.getFileSystemManager();target=cachePath(src);fs.accessSync(target);Cache.touch(src);return target;}catch(_){}
  try{fs.mkdirSync(wx.env.USER_DATA_PATH+'/qingye-media-v1',true);}catch(_){}
  const fallback=fallbackRequest(src);
  let downloaded;
  try{downloaded=await download(src,!!fallback);}catch(error){
   if(fallback&&target&&fs?.writeFile&&wx.cloud.callFunction)return downloadMapThroughFunction(src,fs,target,fallback);
   throw error;
  }
  if(!fs||!target)return downloaded;
  try{
   await bounded(new Promise((success,fail)=>fs.copyFile({srcPath:downloaded,destPath:target,success,fail})),3000,'图片缓存超时');
   Cache.stored(src);return target;
  }catch(_){Cache.trim().catch(()=>{});return downloaded;}
 })().finally(()=>{pending.delete(src);});
 pending.set(src,task);return task;
}
module.exports={init,fileID,local,forget,remote,cacheStats:Cache.stats,trimCache:Cache.trim};
