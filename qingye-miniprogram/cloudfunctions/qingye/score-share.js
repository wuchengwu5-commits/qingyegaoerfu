const R=require('./lib/rules'),Personal=require('./personal-rounds');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
async function source(repo,uid,input){
 if(input.activityId){
  const a=await repo.get('qy_activities',input.activityId);if(!a?.groups)fail('NOT_FOUND','球局不存在');
  if(input.scope==='competition'){
   if(a.kind!=='competition'||a.ownerUid!==uid)fail('FORBIDDEN','只有赛事发起人可以分享正式排行榜');
   if(!['published','revising'].includes(a.status)||!a.publishedRows)fail('CLOSED','请先公布正式成绩后分享');
   return {title:a.title,courseName:a.courseName,date:a.date,version:a.publicationVersion||1,status:a.status,scope:'competition',players:a.publishedRows.map(p=>({name:p.name,tee:p.tee,rank:p.rank,total:p.total,played:p.played,holes:p.holes,courseName:p.courseName,routeName:p.routeName,state:p.state})),holes:[]};
  }
  const g=a.groups.find(g=>g.id===input.groupId);
  if(!g?.round||!(g.memberUids.includes(uid)||(g.scorerUids||[]).includes(uid)||a.ownerUid===uid))fail('FORBIDDEN','只能分享自己参与的球局');
  if(input.scope==='group'&&(a.kind==='competition'||g.ownerUid!==uid))fail('FORBIDDEN','只有普通球局发起人可以分享全组成绩');
  return card(g.round,uid,input.scope,false,a.status);
 }
 const doc=await repo.get('qy_activities',Personal.key(uid,input.roundId));
 if(doc?.kind!=='personal-round'||doc.ownerUid!==uid)fail('NOT_FOUND','请先将球局保存到账号，再分享');
 return card(doc.round,uid,input.scope,true);
}
function card(round,uid,scope,personal,eventStatus){
 if(!R.isFinished(round))fail('CLOSED','请先结束本轮，再分享成绩');
 const selected=scope==='group'?round.players:round.players.filter(p=>personal?p.id==='me':p.accountUid===uid);
 if(!selected.length)fail('FORBIDDEN','你没有参赛成绩，可由发起人分享本组结果');
 return {title:round.courseName+' · 本轮成绩',courseName:round.courseName,date:round.date,version:round.revision,status:eventStatus||round.status,scope,
  holes:round.holes.map(h=>({number:h.number,label:(h.sectionName||'')+' '+(h.label||h.number),par:h.par})),
  players:selected.map(p=>{const sum=R.rawSummary(round,p.id);return {name:p.name,tee:p.tee,total:sum.totalText,played:sum.played,holes:round.holes.length,diff:sum.diffText,scores:round.holes.map(h=>{const s=round.scores[p.id]?.[h.number];return s?.completion==='holed_out'?s.grossStrokes:s?({picked_up:'捡',skipped:'跳',conceded_next_stroke:'认'})[s.completion]:'—';})};})};
}
async function read(repo,token,now){
 if(!/^[a-f0-9]{24}$/.test(token||''))fail('INVALID','分享链接无效');
 const link=await repo.get('qy_invites',token);if(link?.kind!=='score-share'||link.revoked||link.expiresAt<=now())fail('EXPIRED','成绩分享已失效，请向分享人索取新链接');
 const result=await source(repo,link.issuerUid,link.source);
 return {...result,sharedVersion:link.version,updated:result.version!==link.version,expiresAt:link.expiresAt};
}
async function create(repo,uid,input,now,random){
 if(!['own','group','competition'].includes(input.scope))fail('INVALID','请选择分享范围');
 const data=await source(repo,uid,input),token=random(),expiresAt=now()+30*86400000;
 const ref={scope:input.scope,...(input.activityId?{activityId:input.activityId,groupId:input.groupId||null}:{roundId:input.roundId})};
 await repo.transaction(tx=>tx.set('qy_invites',token,{token,kind:'score-share',issuerUid:uid,source:ref,version:data.version,expiresAt,revoked:false}));
 return {token,expiresAt,title:data.title,version:data.version};
}
module.exports={create,read};
