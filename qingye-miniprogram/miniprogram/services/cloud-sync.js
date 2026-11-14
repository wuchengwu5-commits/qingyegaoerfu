const A=require('./account'),KEY='qingye.pendingRounds',VERSIONS='qingye.roundVersions';
let running=null,rerun=false;
function enqueue(round){
 if(!round.cloud||A.user()&&round.cloud.ownerUid!==A.user().uid)return;
 const clean=JSON.parse(JSON.stringify(round));clean.auditReason=round.changeLog?.[round.changeLog.length-1]?.reason||'更新球局';delete clean.changeLog;delete clean.operations;delete clean.corrections;
 const q=wx.getStorageSync(KEY)||{},old=q[round.id];
 // Retain an in-flight request across new edits/restarts, including its original
 // version and ID: a lost response must not look like another device's change.
 q[round.id]={round:clean,stamp:Date.now()+'-'+Math.random(),...(old?.sent?{sent:old.sent}:{})};wx.setStorageSync(KEY,q);
 if(running)rerun=true;else flush();
}
async function flush(){
 if(running||!A.user()||!A.configured())return running;
 running=(async()=>{
  const owner=A.user().uid,ids=Object.keys(wx.getStorageSync(KEY)||{});
  for(const id of ids){
   while(A.user()?.uid===owner){
    const q=wx.getStorageSync(KEY)||{},item=q[id];if(!item||item.round.cloud.ownerUid!==owner)break;
    const versions=wx.getStorageSync(VERSIONS)||{};
    if(!item.sent){item.sent={round:item.round,stamp:item.stamp,expectedVersion:versions[id]??item.round.cloud.serverVersion??0};wx.setStorageSync(KEY,q);}
    const sent=item.sent;
    try{
     const out=await A.call('saveRound',{activityId:sent.round.cloud.activityId,groupId:sent.round.cloud.groupId,expectedVersion:sent.expectedVersion,round:sent.round,reason:sent.round.auditReason,mutationId:sent.stamp});
     const latestVersions=wx.getStorageSync(VERSIONS)||{};latestVersions[id]=out.version;wx.setStorageSync(VERSIONS,latestVersions);
     const latest=wx.getStorageSync(KEY)||{};
     if(latest[id]?.stamp===sent.stamp)delete latest[id];else if(latest[id]){delete latest[id].sent;delete latest[id].error;}
     wx.setStorageSync(KEY,latest);
    }catch(e){
     const latest=wx.getStorageSync(KEY)||{};if(latest[id]){latest[id].errorCode=e.code||'';latest[id].error=e.code==='CONFLICT'?'另一设备已更新，请先查看云端成绩再处理本机记录':e.message;wx.setStorageSync(KEY,latest);}return;
    }
   }
  }
 })().finally(()=>{running=null;if(A.syncRatings)A.syncRatings();if(rerun){rerun=false;flush();}});
 return running;
}
function status(id){const x=(wx.getStorageSync(KEY)||{})[id];return x?(x.error||'本机已保存 · 待同步'):'已同步';}
function pending(id){return (wx.getStorageSync(KEY)||{})[id];}
function version(round){return Math.max(round.cloud?.serverVersion||0,(wx.getStorageSync(VERSIONS)||{})[round.id]||0);}
function markVersion(id,value){const known=wx.getStorageSync(VERSIONS)||{};known[id]=value;wx.setStorageSync(VERSIONS,known);}
function keepConflictCopy(id, stamp){
 const queue=wx.getStorageSync(KEY)||{};
 if(running||queue[id]?.stamp!==stamp||queue[id]?.errorCode!=='CONFLICT')throw Error('同步状态已变化，请再试一次');
 const S=require('./store'),r=S.getRound(id);
 const backup={...r,id:S.id(),courseName:r.courseName+'（本机副本）',status:'paused',conflictSourceId:r.id};
 delete backup.cloud;
 S.mutate(d=>d.rounds.push(backup));
 delete queue[id];wx.setStorageSync(KEY,queue);
}
module.exports={enqueue,flush,status,pending,version,markVersion,keepConflictCopy};
