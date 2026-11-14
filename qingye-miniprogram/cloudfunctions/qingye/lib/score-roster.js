const R=require('./rules');
function canAdd(round){return !!round&&!R.isFinished(round)&&round.players.length<R.GROUP_MAX_PLAYERS&&round.ruleSnapshot.grouping.type==='individual'&&round.ruleSnapshot.scoring.type!=='match_play';}
function append(round,{id,name},time=Date.now()){
 if(R.isFinished(round))throw Error('本轮已结束');
 if(round.players.length>=R.GROUP_MAX_PLAYERS)throw Error('每组最多 16 人，可以新建另一组');
 if(!canAdd(round))throw Error('本场玩法人数固定，请新建另一组记分');
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||round.players.some(p=>p.id===id)||round.courseSnapshot?.rosterArchive?.some(a=>a.player.id===id))throw Error('球位编号无效或重复');
 name=typeof name==='string'?name.trim():'';if(!name||name.length>20)throw Error('昵称为 1–20 个字');
 const next=R.clone(round),source=next.players[0],player={id,name,isVirtual:true};
 for(const key of ['tee','teeId','teeName','holePars','holeSI','holeDistances'])if(source[key]!==undefined)player[key]=R.clone(source[key]);
 next.players.push(player);next.scores[id]={};
 const hc=next.ruleSnapshot.handicap;
 if(hc.mode==='manual_round_total')hc.totals[id]=0;
 if(hc.mode==='manual_hole')hc.perHole[id]=Object.fromEntries(next.holes.map(h=>[h.number,0]));
 next.revision++;next.updatedAt=time;
 // Earlier undo snapshots contain the old roster and must not remove new seats.
 next.changeLog=[];R.validateRound(next);return next;
}
function removalReason(round,id,ownerUid=round?.ownerUid){
 if(!round||!['active','paused'].includes(round.status))return '本轮已结束，不能移除球员';
 const player=round.players.find(p=>p.id===id);
 if(!player)return '球员已不在本组，请刷新';
 if(player.id==='me'||ownerUid&&player.accountUid===ownerUid)return '发起人需保留在本组';
 if(round.players.length<=1)return '本组至少保留一位球员';
 if(round.ruleSnapshot.grouping.type!=='individual'||round.ruleSnapshot.scoring.type==='match_play')return '本场玩法人数固定，不能中途移除球员';
 if(round.players.length===2&&round.ruleSnapshot.sideGames.some(g=>g.type==='skins'))return '本场 Skins 玩法至少需要两位球员';
 const records=[round,...Object.values(round.courseSnapshot?.routeArchive||{})];
 if(records.some(r=>(r.events||[]).some(e=>e.beneficiary===id)||(r.awards||[]).some(a=>a.winnerIds?.includes(id))))return '该球员已有比赛裁定或奖项，请先核对相关记录';
 return '';
}
function remove(round,id,{ownerUid=round.ownerUid,time=Date.now(),operationId='remove-'+time}={}){
 const reason=removalReason(round,id,ownerUid);if(reason)throw Error(reason);
 const next=R.clone(round),player=next.players.find(p=>p.id===id);
 const snapshot=next.courseSnapshot ||= {},routeScores={};
 for(const [hole,entry] of Object.entries(snapshot.routeArchive||{})){
  if(entry.players?.[id]){routeScores[hole]=R.clone(entry.players[id]);delete entry.players[id];}
 }
 // Keep the removed scorecard independently of undo and route changes.
 const archive={operationId,at:time,player:R.clone(player),name:snapshot.playerNames?.[id]||player.name,
  scores:R.clone(next.scores[id]),holes:R.clone(next.holes),routeScores};
 snapshot.rosterArchive=[...(snapshot.rosterArchive||[]),archive];
 next.players=next.players.filter(p=>p.id!==id);delete next.scores[id];
 for(const values of [next.ruleSnapshot.handicap.totals,next.ruleSnapshot.handicap.perHole,next.handicapInputs,snapshot.playerNames])if(values)delete values[id];
 if(next.currentPlayer===id||!next.players.some(p=>p.id===next.currentPlayer))next.currentPlayer=next.players[0].id;
 next.revision++;next.updatedAt=time;
 // A score undo must never restore the old roster or its stale permissions.
 next.changeLog=[];
 R.validateRound(next);return next;
}
module.exports={canAdd,append,removalReason,remove};
