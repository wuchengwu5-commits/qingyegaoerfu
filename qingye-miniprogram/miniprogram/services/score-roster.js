const R=require('./rules');
function canAdd(round){return !!round&&!R.isFinished(round)&&round.players.length<R.GROUP_MAX_PLAYERS&&round.ruleSnapshot.grouping.type==='individual'&&round.ruleSnapshot.scoring.type!=='match_play';}
function append(round,{id,name},time=Date.now()){
 if(R.isFinished(round))throw Error('本轮已结束');
 if(round.players.length>=R.GROUP_MAX_PLAYERS)throw Error('每组最多 16 人，可以新建另一组');
 if(!canAdd(round))throw Error('本场玩法人数固定，请新建另一组记分');
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||round.players.some(p=>p.id===id))throw Error('球位编号无效或重复');
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
module.exports={canAdd,append};
