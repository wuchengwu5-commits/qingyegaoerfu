const Account = require('./account');
const Store = require('./store');
const Sync = require('./cloud-sync');

function context(board) {
  return {activityId:board.activityId, groupId:board.groupId};
}

function adopt(board) {
  const local = Store.getRound(board.round.id);
  if (!local || Store.isEditing(local.id) || board.ownerUid !== Account.user()?.uid || Sync.pending(local.id)) return false;
  if (local.cloud?.live && (local.cloud.activityId !== board.activityId || board.version < Sync.version(local))) return false;
  const cloud = {...context(board), ownerUid:board.ownerUid, live:true, serverVersion:board.version, cells:board.cells};
  const currentPhysical=local.holes.find(h=>h.number===local.currentHole)?.id;
  const currentHole=board.round.holes.find(h=>h.id&&h.id===currentPhysical)?.number || board.round.currentHole;
  Store.mutate(data=>{
    const index = data.rounds.findIndex(r=>r.id===local.id);
    data.rounds[index] = {...local,...board.round,cloud,currentHole,
      currentPlayer:board.round.players.some(p=>p.id===local.currentPlayer)?local.currentPlayer:board.round.players[0].id};
  });
  Sync.markVersion(local.id,board.version);
  return true;
}

async function enable(round) {
  if (round.cloud?.live) return round.cloud;
  if (round.cloud) {
    await Sync.flush();
    if (Sync.pending(round.id)) throw Error('请先同步本机成绩，再生成邀请码');
  }
  const {changeLog,operations,corrections,cloud,...scorecard} = round;
  const board = await Account.call('enableBoard',{...context(cloud||{}),round:scorecard});
  const current=Store.getRound(round.id);
  if(!current)throw Error('本机球局已移除');
  // The invitation can be retried after the first upload succeeds but its reply
  // is lost. Preserve divergent offline edits before adopting the shared card.
  const results=r=>JSON.stringify([r.scores,r.events,r.awards,r.ruleSnapshot,r.status]);
  if(results(current)!==results(board.round)){
    const backup={...current,id:Store.id(),courseName:current.courseName+'（本机副本）',status:'paused'};
    delete backup.cloud;
    Store.mutate(data=>data.rounds.push(backup));
    wx.showToast({title:'本机修改已另存到历史球局',icon:'none'});
  }
  if (!adopt(board)) throw Error('本机成绩有更新，请稍后重试');
  return board;
}

function pendingKey(ref) {
  return 'qingye.boardEdit.'+Account.user().uid+'.'+ref.activityId+'.'+ref.groupId;
}
module.exports={adopt,enable,context,pendingKey};

