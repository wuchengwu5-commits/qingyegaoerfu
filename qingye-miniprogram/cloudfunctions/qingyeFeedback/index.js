const cloud=require('wx-server-sdk');
const {createService,ownerFor}=require('./domain');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function adapter(client){return {
  async get(collection,id){
    try{return (await client.collection(collection).doc(id).get()).data||null;}
    catch(e){if(/document.*(not exist|not found)|DOCUMENT_NOT_EXIST/i.test(e.message||e.errMsg||''))return null;throw e;}
  },
  async set(collection,id,data){const clean=JSON.parse(JSON.stringify(data));delete clean._id;await client.collection(collection).doc(id).set({data:clean});}
};}
const repo={...adapter(db),
  transaction:fn=>db.runTransaction(tx=>fn(adapter(tx))),
  async list(filter,cursor,limit){const where={...filter};if(cursor)where._id=db.command.gt(cursor);return (await db.collection('qy_feedback').where(where).orderBy('_id','asc').limit(limit).get()).data;}
};
exports.main=async(event={})=>{
  try{
    const context=cloud.getWXContext();
    if(context.APPID!=='wx771368adc305a848'||!context.OPENID)return {ok:false,code:'AUTH',message:'请从青野微信小程序访问'};
    return {ok:true,data:await createService(repo).dispatch(ownerFor(context.OPENID,context.APPID),event)};
  }catch(e){const known=typeof e.code==='string'&&/^[A-Z_]+$/.test(e.code);return {ok:false,code:known?e.code:'SERVER',message:known?e.message:'反馈服务暂不可用，草稿已保留，请稍后重试'};}
};
