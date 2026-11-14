const A=require('./account');
async function all(action, data={}){
  const uid=A.user()?.uid,items=[],seen=new Set();let cursor=null;
  do{
    if(!uid||A.user()?.uid!==uid)throw Error('登录状态已变化，请重试');
    const page=await A.call(action,{...data,paged:true,cursor});
    if(A.user()?.uid!==uid)throw Error('登录状态已变化，请重试');
    // Older deployed functions can still return their original array response.
    if(Array.isArray(page)){items.push(...page);break;}
    if(!page||!Array.isArray(page.items))throw Error('球局记录暂未完整加载，请重试');
    items.push(...page.items);cursor=page.nextCursor;
    if(cursor&&seen.has(cursor))throw Error('球局记录暂未完整加载，请重试');
    if(cursor)seen.add(cursor);
  }while(cursor);
  return items;
}
module.exports={all};
