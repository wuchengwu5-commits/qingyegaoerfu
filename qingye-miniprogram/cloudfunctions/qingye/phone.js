// Only the server exchanges the one-use component code. Never log codes or numbers.
function fail(code,message){const e=Error(message);e.code=code;throw e;}
function createPhoneVerifier({exchange,appid,openid,now=()=>Date.now()}){
 return async code=>{
  if(typeof code!=='string'||!code.trim()||code.length>1024)fail('PHONE_REQUIRED','请点击手机号快捷登录并允许验证');
  let result;
  try{result=await exchange({code,openid});}
  catch(e){
   const n=Number(e.errCode||e.errcode||e.code);
   if(n===40029)fail('PHONE_CODE_EXPIRED','验证已过期，请重新点击手机号快捷登录');
   if(n===45011)fail('PHONE_BUSY','验证过于频繁，请稍后再试');
   if(n===48001)fail('PHONE_UNAVAILABLE','手机号验证暂未开通，请联系小程序管理员');
   fail('PHONE_VERIFY_FAILED','手机号验证失败，请稍后重新授权');
  }
  if(Number(result.errCode||result.errcode||0)!==0)fail('PHONE_VERIFY_FAILED','手机号验证失败，请重新授权');
  const p=result.phoneInfo||result.phone_info,w=p&&p.watermark;
  if(!p||!w||w.appid!==appid||!/^\d{5,15}$/.test(p.purePhoneNumber||'')||!/^\d{1,4}$/.test(String(p.countryCode||'')))fail('PHONE_VERIFY_FAILED','手机号验证结果无效，请重新授权');
  const stamp=Number(w.timestamp)*1000;
  if(!Number.isFinite(stamp)||stamp>now()+60000||now()-stamp>5*60000)fail('PHONE_CODE_EXPIRED','验证已过期，请重新点击手机号快捷登录');
  return {number:p.purePhoneNumber,countryCode:String(p.countryCode),verifiedAt:now()};
 };
}
function maskedPhone(phone){const n=phone?.number||'';return n?`${n.slice(0,3)}${'*'.repeat(Math.max(1,n.length-7))}${n.slice(-4)}`:'';}
module.exports={createPhoneVerifier,maskedPhone};
