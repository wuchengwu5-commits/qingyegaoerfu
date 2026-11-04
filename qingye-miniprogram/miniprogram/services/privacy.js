let pending=null,listeners=[];
function notify(){listeners.forEach(fn=>fn(!!pending));}
function init(){if(wx.onNeedPrivacyAuthorization)wx.onNeedPrivacyAuthorization(resolve=>{pending=resolve;notify();});}
function subscribe(fn){listeners.push(fn);fn(!!pending);return()=>{listeners=listeners.filter(x=>x!==fn);};}
function answer(agree){const fn=pending;pending=null;notify();if(fn)fn(agree?{event:'agree',buttonId:'privacy-agree'}:{event:'disagree'});}
function ensure(){return new Promise((resolve,reject)=>{if(!wx.requirePrivacyAuthorize)return resolve();wx.requirePrivacyAuthorize({success:resolve,fail:reject});});}
module.exports={init,subscribe,answer,ensure};
