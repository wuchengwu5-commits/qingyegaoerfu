const Cloud=require('./cloud-client'),Account=require('./account');
const STATUS={new:'已收到',confirmed:'已确认',fixing:'修复中',ready:'待发布',resolved:'已解决',need_info:'待补充',declined:'暂不处理',reading:'处理中',replied:'已回复',closed:'已处理'};
function enabled(){return !!Cloud.init()?.callFunction;}
async function call(action,data={}){
 return Account.withSession(async()=>{
  const client=Cloud.init();if(!client?.callFunction)throw Error('请在微信小程序中提交反馈，草稿已保留');
  let response;try{response=await client.callFunction({name:'qingyeFeedback',data:{...data,action}});}catch(e){throw Error('反馈服务暂不可用，草稿已保留，请稍后重试');}
  const result=response.result;if(!result?.ok)throw Object.assign(Error(result?.message||'反馈服务暂不可用'),{code:result?.code});return result.data;
 });
}
async function all(action){return Account.withSession(async()=>{const items=[],seen=new Set();let cursor='';do{const result=await call(action,{cursor});items.push(...result.items);cursor=result.nextCursor;if(cursor&&seen.has(cursor))throw Error('读取反馈未完成，请刷新重试');seen.add(cursor);}while(cursor);return items.sort((a,b)=>b.created-a.created);});}
function token(){return new Promise((resolve,reject)=>{if(!wx.getRandomValues)return reject(Error('请升级微信后提交，草稿已保存'));wx.getRandomValues({length:32,success:r=>resolve(Array.from(new Uint8Array(r.randomValues),n=>n.toString(16).padStart(2,'0')).join('')),fail:()=>reject(Error('提交凭据生成失败，请重试'))});});}
function decorate(row){return {...row,statusLabel:STATUS[row.status]||'处理中',date:new Date(row.created).toLocaleString('zh-CN',{hour12:false})};}
module.exports={enabled,call,all,token,decorate,STATUS};
