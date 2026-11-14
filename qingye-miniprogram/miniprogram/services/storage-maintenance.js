const Archive=require('./round-archive');
let checkedStorage=null;
const needsCompact=r=>Array.isArray(r?.changeLog)&&r.changeLog.some(l=>l.before&&l.after);
function compactRound(r){return needsCompact(r)?Archive.compact(r):r;}
function compactData(data){
 if(!data||!Array.isArray(data.rounds))return data;
 const rounds=data.rounds.map(compactRound);
 return rounds.some((r,i)=>r!==data.rounds[i])?{...data,rounds}:data;
}
function compactQueue(queue){
 if(!queue||typeof queue!=='object')return queue;
 let changed=false;
 const next=Object.fromEntries(Object.entries(queue).map(([id,item])=>{
  if(!item?.round)return [id,item];
  const round=compactRound(item.round),sentRound=compactRound(item.sent?.round);
  if(round===item.round&&sentRound===item.sent?.round)return [id,item];
  changed=true;
  return [id,{...item,round,...(sentRound?{sent:{...item.sent,round:sentRound}}:{})}];
 }));
 return changed?next:queue;
}
function writeVerified(key,next,previous){
 try{
  wx.setStorageSync(key,next);
  if(JSON.stringify(wx.getStorageSync(key))!==JSON.stringify(next))throw Error('存储校验不一致');
 }catch(e){
  // Never remove the old value to make room: scores and retry IDs must survive.
  if(previous)try{wx.setStorageSync(key,previous);}catch(ignore){}
  throw e;
 }
}
function readQueue(key){
 const previous=wx.getStorageSync(key)||{},next=compactQueue(previous);
 if(next!==previous)writeVerified(key,next,previous);
 return next;
}
function migratePendingOnce(){
 if(checkedStorage===wx.getStorageSync||typeof wx.getStorageInfoSync!=='function')return;
 for(const key of wx.getStorageInfoSync().keys||[])if(key.startsWith('qingye.personalPending.'))readQueue(key);
 checkedStorage=wx.getStorageSync;
}
module.exports={compactData,compactQueue,readQueue,migratePendingOnce};
