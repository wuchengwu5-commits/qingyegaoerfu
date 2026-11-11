const Account=require('./account');
function version(){const value=wx.getAccountInfoSync?.().miniProgram?.envVersion;return ['develop','trial','release'].includes(value)?value:'release';}
function versionLabel(){return {develop:'开发版',trial:'体验版',release:'正式版'}[version()];}
async function generate(token){
 const out=await Account.call('qrcode',{token,envVersion:version()});
 if(typeof out?.url!=='string'||!out.url)throw Error('微信小程序码暂未生成，请重试');
 return out.url;
}
module.exports={generate,versionLabel};
