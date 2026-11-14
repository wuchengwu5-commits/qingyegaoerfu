const R=require('./rules'),Tee=require('./tee-colors');
const generic=name=>!name||['高球爱好者','微信用户','微信球友'].includes(name);
function labels(round,profiles=[]){
 const names=round.courseSnapshot?.playerNames||{};
 const players=round.players.map((p,i)=>{
  const profile=profiles.find(x=>p.accountUid&&(x.uid===p.accountUid||x.accountUid===p.accountUid));
  const alias=Object.prototype.hasOwnProperty.call(names,p.id)?names[p.id]:'';
  const actualName=alias||profile?.name||p.name||'';
  return {...p,actualName,name:generic(actualName)?'球友 '+(i+1):actualName,seat:i+1,teeColor:Tee.swatch(p.teeName||p.tee),avatarUrl:profile?(profile.avatarUrl||''):(p.avatarUrl||'')};
 });
 const counts=players.reduce((all,p)=>{all.set(p.name,(all.get(p.name)||0)+1);return all;},new Map());
 return players.map(p=>({...p,name:counts.get(p.name)>1?p.name+' · '+p.seat:p.name}));
}
function tees(round,course){return [...new Set([...(course?.tees||[]),...round.players.map(p=>p.tee).filter(Boolean)])];}
function edit(round,course,playerId,details,options={}){
 if(round.status==='cancelled')throw Error('已取消的球局不能修改');
 const player=round.players.find(p=>p.id===playerId);if(!player)throw Error('组员已变化，请刷新后重试');
 const oldName=round.courseSnapshot?.playerNames?.[playerId]||player.name;
 const name=details.name===undefined?oldName:typeof details.name==='string'?details.name.trim():'';
 if(!name||name.length>20)throw Error('本轮称呼为 1–20 个字');
 const tee=details.tee;
 if(typeof tee!=='string'||!tees(round,course).includes(tee))throw Error('请选择本球场的发球台');
 const next=R.clone(round),target=next.players.find(p=>p.id===playerId);
 if(name===oldName&&tee===player.tee)return next;
 if(name!==oldName){target.name=name;next.courseSnapshot={...next.courseSnapshot,playerNames:{...next.courseSnapshot?.playerNames,[playerId]:name}};}
 if(tee!==player.tee){
  const data=course?.teeData?.find(t=>t.name===tee);
  if(!data)throw Error('该发球台资料暂不完整，请稍后重试');
  target.tee=tee;target.teeName=tee;target.teeId=data.id||null;
  // Keep recorded strokes, Par and SI; only the selected player's tee distances change.
  target.holeDistances=Object.fromEntries(next.holes.map(h=>[h.number,data.distances?.[h.id]??null]));
  for(const [id,hole] of Object.entries(next.courseSnapshot.routeArchive||{})){
   if(hole.players?.[playerId])hole.players[playerId].distance=data.distances?.[id]??null;
  }
 }
 const reason='修改组员资料：'+oldName+' → '+name+(tee!==player.tee?'，Tee '+player.tee+' → '+tee:'');
 const updated=R.applyOperation(round,{type:R.isFinished(round)?'correction':'rules',operationId:options.operationId,baseRevision:options.baseRevision??round.revision,time:options.time??Date.now(),reason,
  rules:round.ruleSnapshot,players:next.players,changes:{players:next.players,courseSnapshot:next.courseSnapshot}});
 updated.courseSnapshot=next.courseSnapshot;updated.status=round.status;
 const log=updated.changeLog[updated.changeLog.length-1];log.before.courseSnapshot=R.clone(round.courseSnapshot||{});log.after.courseSnapshot=R.clone(next.courseSnapshot);
 R.validateRound(updated);return updated;
}
module.exports={labels,tees,edit};
