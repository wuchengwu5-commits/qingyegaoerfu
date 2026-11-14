const cases=require('./cases'),Config=require('../../config'),Cloud=require('../../services/cloud-client'),env=Config.mediaEnv,root=Config.mediaRoot+'/';
function run(work){
 const at=Date.now();let timer,task;
 const result=new Promise((resolve,reject)=>{
  timer=setTimeout(()=>{reject({errMsg:'连接等待超时',errCode:'TIMEOUT'});task?.abort?.();},12000);
  try{task=work(resolve,reject);}catch(error){reject(error);}
 });
 return result.then(detail=>({ok:true,ms:Date.now()-at,...detail})).catch(e=>({ok:false,ms:Date.now()-at,code:String(e.errCode||e.code||''),message:String(e.errMsg||e.message||'请求失败').slice(0,500)})).finally(()=>clearTimeout(timer));
}
function summary(result){return result.ok?'成功 · '+(result.ms/1000).toFixed(1)+' 秒':result.message;}
Page({
 data:{busy:false,done:false,rows:[],message:'用当前手机检查 GPS 卫星图和精修图的连接。检查完成后，可复制结果发给维护人员。'},
 onUnload(){this.closed=true;},
 async check(){
  if(this.data.busy)return;Cloud.init();this.setData({busy:true,done:false,rows:[],message:'正在检查，请保持页面打开…'});
  const system=wx.getSystemInfoSync(),report={test:'gps-access-v2',date:new Date().toISOString(),version:wx.getAccountInfoSync().miniProgram.envVersion,platform:system.platform,system:system.system,wechat:system.version,sdk:system.SDKVersion,rows:[]};
  for(const item of cases){
   if(this.closed)return;
   const [direct,backup]=await Promise.all([
    run((success,fail)=>wx.cloud.downloadFile({fileID:(item.action==='referenceImage'?root.replace('/media-v1/','/hole-reference-v1/'):root)+item.name,config:{env},success:r=>{if(!r.tempFilePath)return fail({message:'未返回图片'});wx.getImageInfo({src:r.tempFilePath,success:image=>success({width:image.width,height:image.height}),fail,complete(){wx.getFileSystemManager().unlink({filePath:r.tempFilePath,fail(){}});}});},fail})),
    run((success,fail)=>wx.cloud.callFunction({name:'qingyeGpsMaps',config:{env},data:{action:item.action||'mapImage',name:item.name,index:0},success:r=>{const p=r.result;if(p?.ok&&typeof p.data==='string'&&(item.action==='referenceImage'?p.data.startsWith('iVBORw0KGgo'):p.data.startsWith('/9j/')))success({received:true,chunks:p.chunks});else fail({message:p?.message||'地图备用服务未返回图片'});},fail}))
   ]);
   report.rows.push({course:item.title,direct,backup});
   if(!this.closed)this.setData({rows:report.rows.map(r=>({title:r.course,direct:summary(r.direct),backup:summary(r.backup),ok:r.direct.ok||r.backup.ok}))});
  }
  this.report=report;
  if(!this.closed)this.setData({busy:false,done:true,message:report.rows.every(r=>r.direct.ok)?'连接检查通过。若原地图仍打不开，请复制结果反馈。':report.rows.every(r=>r.backup.ok)?'直接下载存在异常，备用服务可以读取。请复制结果反馈。':'已记录连接失败原因，请复制结果反馈。'});
 },
 copy(){if(this.report)wx.setClipboardData({data:JSON.stringify(this.report,null,2)});}
});
