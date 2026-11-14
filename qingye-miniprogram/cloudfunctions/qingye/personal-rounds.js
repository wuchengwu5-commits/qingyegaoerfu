const crypto=require('crypto'),R=require('./lib/rules'),Pages=require('./history-pages');
const COLLECTION='qy_activities'; // Existing collection denies all direct client reads/writes.
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const key=(uid,id)=>'personal-'+crypto.createHash('sha256').update(JSON.stringify([uid,id])).digest('hex').slice(0,48);
function validId(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))fail('INVALID','球局编号无效');return id;}
function clean(source,uid){
  if(!source||JSON.stringify(source).length>350000)fail('INVALID','球局数据过大或无效');
  validId(source.id);
  if(source.cloud)fail('INVALID','共同记分请使用原球局同步');
  if(source.ownerUid&&source.ownerUid!==uid)fail('FORBIDDEN','不能保存其他账号的球局');
  if(![9,18].includes(source.holes?.length)||!Array.isArray(source.players)||!source.players.some(p=>p.id==='me')||source.players.length>16)fail('INVALID','球局资料不完整');
  const round=require('./live-round').publicRound(source);
  // Private audit/history fields never enter a shared scoreboard.
  for(const field of ['handicapInputs','changeLog','corrections','conflictSourceId'])if(source[field]!==undefined)round[field]=source[field];
  round.operations=[];round.changeLog=round.changeLog||[];round.corrections=round.corrections||[];
  R.validateRound(round);return JSON.parse(JSON.stringify(round));
}
function entry(doc){return {round:doc.round,version:doc.version,ownerUid:doc.ownerUid,historyRefs:doc.historyRefs||[]};}
async function dispatch(repo,uid,me,action,input,now){
  if(action==='putPersonalHistory'){
    validId(input.roundId);
    if(!Array.isArray(input.logs)||!input.logs.length||JSON.stringify(input.logs).length>200000)fail('INVALID','修改记录分段无效');
    const id='history-'+crypto.createHash('sha256').update(JSON.stringify([uid,input.roundId,input.logs])).digest('hex');
    await repo.transaction(tx=>tx.set(COLLECTION,id,{id,kind:'personal-history',ownerUid:uid,roundId:input.roundId,logs:input.logs}));return {id};
  }
  if(action==='getPersonalHistory'){
    const doc=await repo.get(COLLECTION,input.historyId);
    if(!doc||doc.kind!=='personal-history'||doc.ownerUid!==uid||doc.roundId!==input.roundId)fail('FORBIDDEN','不能读取这份修改记录');
    return {logs:doc.logs};
  }
  if(action==='personalRounds'){
    const selection=Pages.page(me.personalRoundIds,input,10);
    const docs=await Promise.all(selection.ids.map(id=>repo.get(COLLECTION,key(uid,id))));
    return {items:docs.filter(d=>d?.kind==='personal-round'&&d.ownerUid===uid).map(entry),nextCursor:selection.nextCursor};
  }
  const id=validId(input.roundId||input.round?.id),docId=key(uid,id);
  if(action==='getPersonalRound'){
    const doc=await repo.get(COLLECTION,docId);
    if(!doc||doc.ownerUid!==uid||doc.kind!=='personal-round')fail('NOT_FOUND','未找到本账号的球局');
    return entry(doc);
  }
  if(action!=='savePersonalRound')fail('INVALID','不支持此操作');
  const round=clean(input.round,uid);
  if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0||typeof input.mutationId!=='string'||!input.mutationId||input.mutationId.length>100)fail('INVALID','同步信息无效');
  return repo.transaction(async tx=>{
    const old=await tx.get(COLLECTION,docId);
    if(old&&(old.ownerUid!==uid||old.kind!=='personal-round'))fail('FORBIDDEN','球局归属不符');
    if(old?.lastMutation===input.mutationId)return {version:old.version};
    if((old?.version||0)!==input.expectedVersion)fail('CONFLICT','另一设备已更新这场球局');
    if(old?.historyRefs?.length&&!Array.isArray(input.historyRefs))fail('UPDATE_REQUIRED','请更新小程序后继续同步，已有云端记录仍保留');
    const historyRefs=input.historyRefs||[];
    if(!Array.isArray(historyRefs)||historyRefs.length>2000||new Set(historyRefs).size!==historyRefs.length)fail('INVALID','修改记录索引无效');
    for(const id of historyRefs){const part=await tx.get(COLLECTION,id);if(part?.kind!=='personal-history'||part.ownerUid!==uid||part.roundId!==round.id)fail('INVALID','修改记录尚未完整保存，请重试');}
    const version=(old?.version||0)+1;
    await tx.set(COLLECTION,docId,{id:docId,kind:'personal-round',ownerUid:uid,round,historyRefs,version,lastMutation:input.mutationId,createdAt:old?.createdAt||now(),updatedAt:now()});
    if(!old){const user=await tx.get('qy_users',uid);user.personalRoundIds=Array.from(new Set([...(user.personalRoundIds||[]),id]));await tx.set('qy_users',uid,user);}
    return {version};
  });
}
module.exports={dispatch,key};
