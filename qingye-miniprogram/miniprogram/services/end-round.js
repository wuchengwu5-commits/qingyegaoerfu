const Dialog = require('./dialog');
const S=require('./store'),A=require('./account'),Shared=require('./shared-round'),Sync=require('./cloud-sync');

module.exports=async function endRound(item){
 let local=S.getRound(item.id),ref=local?.cloud||(item.activityId?item:null),board;
 const uid=A.user()?.uid;
 function settled(){
  if(S.isEditing(item.id)||Sync.pending(item.id)||ref&&uid&&(
   require('./score-edit-queue').conflicts(Shared.pendingKey(ref)).length||wx.getStorageSync(Shared.pendingKey(ref))||wx.getStorageSync('qingye.virtualSeat.'+uid+'.'+ref.activityId+'.'+ref.groupId)))
   throw Error('请先进入本组完成待同步记分，再结束');
 }
 settled();
 if(ref){
  if(!uid)throw Error('请先登录后结束本组');
  if(local?.cloud&&!local.cloud.live)ref=await Shared.enable(local);
  board=await A.call('readBoard',Shared.context(ref));
  if(board.competition||board.ownerUid!==uid)throw Error('只有本组发起人可以结束');
  if(board.round?.id!==item.id)throw Error('球局已变化，请刷新后重试');
 }else if(!local)throw Error('球局已不存在，请刷新');
 const round=board?.round||local;
 if(!['active','paused'].includes(round.status)){if(board)Shared.adopt(board);return true;}
 const blank=!round.players.some(p=>Object.keys(round.scores[p.id]||{}).length)&&!round.events.length&&!round.awards.length;
 const progress=round.players.map(p=>p.name+' '+require('./rules').rawSummary(round,p.id).played+'/'+round.holes.length+' 洞').join('；');
 const confirmed=await new Promise((resolve,reject)=>Dialog.modal({title:blank?'取消空白球局？':'核对并结束本组？',content:round.courseName+'\n'+progress+'\n'+(blank?'没有录入成绩，取消后保留取消记录，不计入完成轮数。':'未记球洞保留空白；结束后可授权更正。只影响本组。'),confirmText:blank?'取消球局':'结束本组',cancelText:'继续记分',success:r=>resolve(r.confirm),fail:reject}));
 if(!confirmed)return false;
 settled();
 if(ref){
  if(A.user()?.uid!==uid)throw Error('登录状态已变化，请重试');
  Shared.adopt(await A.call('finishBoard',{...Shared.context(ref),version:board.version,allowEmpty:true}));
 }else{
  local=S.getRound(item.id);
  if(!local||local.cloud||local.revision!==round.revision)throw Error('成绩已更新，请重新核对后结束');
  S.finish(item.id,{allowEmpty:true});
 }
 return true;
};
