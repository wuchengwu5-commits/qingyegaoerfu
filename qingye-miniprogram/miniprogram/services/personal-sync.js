const A=require('./account');
const listeners=new Set();
let running=null,recovering=null,timer=null,error='',rerun=false;
const key=uid=>'qingye.personalPending.'+uid;
const copy=x=>JSON.parse(JSON.stringify(x));
const store=()=>require('./store');
function queue(uid){return require('./storage-maintenance').readQueue(key(uid));}
function emit(){for(const fn of listeners)fn();}
function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
function payload(r){const out=require('./round-archive').compact(copy(r));for(const field of ['cloud','personalCloud','ownerUid','unclaimedOwner','operations'])delete out[field];return out;}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{timer=null;flush().catch(()=>{});},200);if(timer.unref)timer.unref();}
function enqueue(round){
  if(wx.__preview||round.cloud||!round.ownerUid)return;
  const uid=round.ownerUid,q=queue(uid),old=q[round.id],clean=payload(round);
  if(old&&JSON.stringify(old.round)===JSON.stringify(clean))return;
  q[round.id]={round:clean,stamp:Date.now()+'-'+Math.random(),expectedVersion:round.personalCloud?.version||0,...(old?.sent?{sent:old.sent}:{})};
  wx.setStorageSync(key(uid),q);if(running)rerun=true;emit();schedule();
}
function pending(id,uid=A.user()?.uid){return uid?queue(uid)[id]:null;}
async function uploadSnapshot(round,uid){
 const logs=round.changeLog||[],parts=[];let chunk=[];
 for(const log of logs){if(chunk.length&&(chunk.length>=30||JSON.stringify([...chunk,log]).length>180000)){parts.push(chunk);chunk=[];}chunk.push(log);}if(chunk.length)parts.push(chunk);
 const historyRefs=[];for(const logs of parts){if(A.user()?.uid!==uid)throw Error('登录状态已变化');const saved=await A.call('putPersonalHistory',{roundId:round.id,logs});historyRefs.push(saved.id);}
 // Keep the latest undo state in the small snapshot. All older changes live in immutable parts.
 return {round:{...round,changeLog:logs.slice(-1)},historyRefs};
}
async function hydrateHistory(entry){
 if(!entry.historyRefs?.length)return entry;
 const logs=[];for(const historyId of entry.historyRefs){const part=await A.call('getPersonalHistory',{roundId:entry.round.id,historyId});logs.push(...part.logs);}
 return {...entry,round:{...entry.round,changeLog:logs}};
}
function decorate(entry){return {...entry.round,operations:[],changeLog:entry.round.changeLog||[],corrections:entry.round.corrections||[],ownerUid:entry.ownerUid,personalCloud:{version:entry.version,syncedRevision:entry.round.revision}};}
function hasBoardEdits(r,uid){return r?.cloud&&(wx.getStorageSync('qingye.boardEdit.'+uid+'.'+r.cloud.activityId+'.'+r.cloud.groupId)||[]).length;}
async function keepConflict(uid,id){
  const remote=await hydrateHistory(await A.call('getPersonalRound',{roundId:id}));
  if(A.user()?.uid!==uid)return;
  const S=store(),local=S.getRound(id);
  if(S.isEditing(id)||local?.cloud)return;
  if(!local||local.ownerUid!==uid)return;
  const backup={...copy(local),id:S.id(),courseName:local.courseName+'（本机副本）',conflictSourceId:id};delete backup.personalCloud;
  S.mutate(d=>{const index=d.rounds.findIndex(r=>r.id===id);d.rounds[index]=decorate(remote);d.rounds.push(backup);});
  const q=queue(uid);delete q[id];wx.setStorageSync(key(uid),q);
  enqueue(backup);error='另一设备已更新，已保留本机副本，可在历史球局中核对';emit();
}
async function flush(){
  if(running)return running;
  if(wx.__preview||!A.user()||!A.configured())return;
  const uid=A.user().uid;
  const job=(async()=>{
    // A conflict in one round must not block the rest of this account's backups.
    for(const id of Object.keys(queue(uid))){
      while(A.user()?.uid===uid){
        const q=queue(uid),item=q[id];if(!item)break;
        const local=store().getRound(id);
        if(local?.cloud){delete q[id];wx.setStorageSync(key(uid),q);break;}
        if(local&&local.ownerUid!==uid)break;
        if(!item.sent){item.sent={round:item.round,stamp:item.stamp,expectedVersion:item.expectedVersion};wx.setStorageSync(key(uid),q);}
        const sent=item.sent;sent.round=payload(sent.round);
        try{
          const snapshot=await uploadSnapshot(sent.round,uid);
          if(A.user()?.uid!==uid)return;
          const out=await A.call('savePersonalRound',{...snapshot,expectedVersion:sent.expectedVersion,mutationId:sent.stamp});
          if(A.user()?.uid!==uid)return;
          if(!Number.isInteger(out?.version))throw Error('云端未确认保存，请稍后重试');
          const latest=queue(uid),next=latest[id];
          // Save acknowledgement with the local card before dropping the retry entry.
          store().mutate(d=>{const r=d.rounds.find(r=>r.id===id&&r.ownerUid===uid);if(r&&!r.cloud)r.personalCloud={version:out.version,syncedRevision:sent.round.revision};});
          if(next?.stamp===sent.stamp)delete latest[id];else if(next){delete next.sent;delete next.error;next.expectedVersion=out.version;}
          wx.setStorageSync(key(uid),latest);emit();
        }catch(e){
          if(A.user()?.uid!==uid)return;
          const latest=queue(uid);if(latest[id]){latest[id].error=e.message;latest[id].errorCode=e.code;wx.setStorageSync(key(uid),latest);}
          if(e.code==='CONFLICT')try{await keepConflict(uid,id);}catch(ignore){}
          emit();break;
        }
      }
    }
  })().finally(()=>{if(running===job)running=null;if(rerun){rerun=false;schedule();}});running=job;return job;
}
async function sync(){
  if(recovering)return recovering;
  if(wx.__preview||!A.user()||!A.configured())return;
  const uid=A.user().uid;
  const job=(async()=>{
    error='';const S=store();
    for(const r of S.read().rounds){if(r.ownerUid===uid&&!r.cloud&&!pending(r.id,uid)&&r.personalCloud?.syncedRevision!==r.revision)enqueue(r);}
    await flush();
    const History=require('./cloud-history');
    const [entries,linked]=await Promise.all([History.all('personalRounds'),History.all('myRounds')]);
    const personal=[];for(const entry of entries)personal.push(await hydrateHistory(entry));
    if(A.user()?.uid!==uid)return;
    const online=new Map(linked.map(item=>[item.round.id,item]));
    S.mutate(d=>{
      for(const entry of personal){
        const id=entry.round.id,index=d.rounds.findIndex(r=>r.id===id),old=d.rounds[index];
        if(entry.ownerUid!==uid||online.has(id)||pending(id,uid)||S.isEditing(id)||old?.cloud||old&&old.ownerUid!==uid)continue;
        if(old?.personalCloud?.version>entry.version)continue;
        const r=decorate(entry);if(index<0)d.rounds.push(r);else d.rounds[index]=r;
      }
      for(const entry of linked){
        if(entry.ownerUid!==uid||!entry.cloud||entry.competition)continue;
        const id=entry.round.id,index=d.rounds.findIndex(r=>r.id===id),old=d.rounds[index];
        if(S.isEditing(id)||require('./cloud-sync').pending(id)||pending(id,uid)||hasBoardEdits(old,uid)||old&&old.ownerUid&&old.ownerUid!==uid)continue;
        if(old?.cloud?.serverVersion>entry.cloud.serverVersion)continue;
        const r={...entry.round,operations:[],changeLog:old?.changeLog||[],corrections:old?.corrections||[],ownerUid:uid,cloud:entry.cloud};
        if(index<0)d.rounds.push(r);else d.rounds[index]=r;
      }
      d.linkedRounds=linked;
    });emit();if(A.syncRatings)A.syncRatings().catch(()=>{});return true;
  })().catch(e=>{error=e.message||'球局暂未完成同步，请重试';emit();return false;}).finally(()=>{if(recovering===job)recovering=null;});recovering=job;return job;
}
function status(round){
  if(round.cloud)return require('./cloud-sync').status(round.id);
  if(!round.ownerUid)return '仅本机保存 · 未关联账号';
  const p=pending(round.id,round.ownerUid);return p?(p.error?'本机已保存 · 待重试':'本机已保存 · 待同步'):round.personalCloud?'已保存到账号':'本机已保存 · 待同步';
}
function unclaimed(){return store().read().rounds.filter(r=>!r.ownerUid&&!r.cloud);}
function claim(){const uid=A.user()?.uid;if(!uid)return;store().mutate(d=>{for(const r of d.rounds)if(!r.ownerUid&&!r.cloud){r.ownerUid=uid;delete r.unclaimedOwner;}});return sync();}
module.exports={enqueue,flush,sync,pending,status,unclaimed,claim,subscribe,error:()=>error};
