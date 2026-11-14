const S=require('./store'),A=require('./account');
function query(o){return o.activity&&o.group?'?activity='+encodeURIComponent(o.activity)+'&group='+encodeURIComponent(o.group):'?id='+encodeURIComponent(o.id||'');}
async function load(o){
 const local=o.id?S.getRound(o.id):null,ref=o.activity&&o.group?{activityId:o.activity,groupId:o.group}:local?.cloud;
 const board=ref?await A.call('readBoard',{activityId:ref.activityId,groupId:ref.groupId}):null;
 const round=board?.round||local;if(!round)throw Error('球局不存在或尚未同步，请返回历史记录重试');
 const uid=A.user()?.uid,mineId=ref?round.players.find(p=>p.accountUid===uid)?.id:round.players.find(p=>p.id==='me')?.id;
 return {round,board,ref,mineId,canEdit:round.status!=='cancelled'&&!board?.competition&&(!ref||board.ownerUid===uid),canShareGroup:ref?!board?.competition&&board.ownerUid===uid:!!uid&&round.ownerUid===uid};
}
module.exports={load,query};
