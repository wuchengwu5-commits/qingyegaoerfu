const cfg=require('../config');let activeClient=null,activeEnv='';
function init(){
 const env=cfg.cloudEnv||cfg.mediaEnv;
 if(!env||typeof wx==='undefined'||!wx.cloud)return null;
 if(activeClient!==wx.cloud||activeEnv!==env){wx.cloud.init({env,traceUser:false});activeClient=wx.cloud;activeEnv=env;}
 return activeClient;
}
module.exports={init};
