const Dialog=require('./dialog'),Account=require('./account'),Store=require('./store');
const Roster=require('./score-roster'),Shared=require('./shared-round'),Sync=require('./cloud-sync');
function owner(page,round){return page.boardOwnerUid||round.cloud?.ownerUid||round.ownerUid;}
function allowed(page){
 const r=page.viewedRound(),uid=Account.user()?.uid;
 return !!r&&!page.competitionBoard&&!Store.isEditing(r.id)&&['active','paused'].includes(r.status)&&(!owner(page,r)||owner(page,r)===uid);
}
module.exports={
 removalKey(ref){return 'qingye.removePlayer.'+Account.user()?.uid+'.'+ref.activityId+'.'+ref.groupId;},
 managePlayers(){
  if(!allowed(this))return;
  const ref=this.ref();
  if(ref&&Account.user()&&wx.getStorageSync(this.removalKey(ref)))return this.submitRemoval(ref);
  if(!this.boardSettled())return;
  const r=this.viewedRound(),uid=Account.user()?.uid,rid=r.id;
  const items=[{label:'＋ 添加手动球员',add:true}];
  for(const p of r.players){
   const reason=Roster.removalReason(r,p.id,owner(this,r)),name=this.data.players.find(x=>x.id===p.id)?.name||p.name;
   items.push({label:reason?name+' · '+reason:'移除 '+name+' · '+(Object.keys(r.scores[p.id]).length?'已有成绩':'尚未记分'),disabled:!!reason,playerId:p.id});
  }
  if(r.courseSnapshot?.rosterArchive?.length)items.push({label:'查看已移除球员的记录',history:true});
  Dialog.actionSheet({title:'管理本组球员 · '+r.players.length+'/16',itemList:items,success:choice=>{
   if(!this.boardVisible||this.rid!==rid||Account.user()?.uid!==uid||!allowed(this))return;
   const selected=items[choice.tapIndex];if(!selected||selected.disabled)return;
   if(selected.add)return this.addVirtual();if(selected.history)return this.removedPlayers();
   return this.removePlayer(selected.playerId);
  }});
 },
 removedPlayers(){
  const r=this.viewedRound(),uid=Account.user()?.uid,records=r.courseSnapshot?.rosterArchive||[];
  Dialog.actionSheet({title:'已移除球员 · 成绩留存',itemList:records.map(a=>a.name+' · 已记 '+Object.keys(a.scores).length+' 洞'),success:choice=>{
   if(!this.boardVisible||this.rid!==r.id||Account.user()?.uid!==uid)return;
   const a=records[choice.tapIndex];if(!a)return;
   const lines=Object.entries(a.scores).map(([n,s])=>(a.holes.find(h=>h.number===Number(n))?.label||n)+' 洞：'+(s.grossStrokes??'未完洞'));
   for(const [hole,entry] of Object.entries(a.routeScores||{}))if(entry.score)lines.push('原路线 '+hole+'：'+(entry.score.grossStrokes??'未完洞'));
   Dialog.modal({title:a.name+' · 移除记录',content:lines.length?lines.join('\n'):'移除时尚未记录成绩。',message:'不计入当前小组记分和排名。',showCancel:false});
  }});
 },
 removePlayer(playerId){
  if(!allowed(this)||!this.boardSettled())return;
  const r=this.viewedRound(),uid=Account.user()?.uid,ref=this.ref();
  const reason=Roster.removalReason(r,playerId,owner(this,r));if(reason)return wx.showToast({title:reason,icon:'none'});
  if(ref&&!this.data.liveBoard)return wx.showToast({title:'请先联网开启共同记分',icon:'none'});
  if(this.data.liveBoard&&!this.playerRemovalSupported)return this.refreshBeforeRemove(playerId);
  const p=r.players.find(x=>x.id===playerId),name=this.data.players.find(x=>x.id===playerId)?.name||p.name;
  const request={roundId:r.id,playerId,version:this.remoteRef?this.boardVersion:r.cloud?.serverVersion,mutationId:Store.id()};
  const count=Object.keys(r.scores[playerId]).length;
  Dialog.modal({title:'移除「'+name+'」？',content:(count?'已记 '+count+' 洞的成绩会保留在移除记录中，不再计入本组排名。':'该球员尚未记分，移除后会空出一个球位。')+(p.accountUid?'\n对方将失去本组的记分权限。':''),message:'只移出本组，不删除常用球友。',confirmText:'确认移除',success:async result=>{
   if(!result.confirm||!this.boardVisible||this.rid!==r.id||Account.user()?.uid!==uid||!allowed(this)||!this.boardSettled())return;
   try{
    const current=this.viewedRound();
    if(current.revision!==r.revision||ref&&Sync.pending(r.id))throw Error('组内记录已有更新，请刷新后重新确认');
    if(this.data.liveBoard){wx.setStorageSync(this.removalKey(ref),request);await this.submitRemoval(ref);}
    else{Store.replace(Roster.remove(current,playerId,{ownerUid:owner(this,current),operationId:request.mutationId}));this.lastCell=null;this.refresh();wx.showToast({title:'球员已移出本组',icon:'success'});}
   }catch(e){if(this.boardVisible&&Account.user()?.uid===uid)wx.showToast({title:e.message,icon:'none'});}
  }});
 },
 async refreshBeforeRemove(playerId){
  if(this.opening||this.writing||!Account.user())return;
  const uid=Account.user().uid,rid=this.rid,ref=this.ref();
  const current=()=>this.boardVisible&&this.rid===rid&&Account.user()?.uid===uid;
  this.opening=true;this.setData({joiningBusy:true});let supported=false;
  try{
   // A page can remain open across a cloud deployment. Check the current
   // service instead of permanently rejecting a previously unknown capability.
   const board=await Account.call('readBoard',Shared.context(ref));
   if(!current())return;
   this.showSnapshot(board);supported=board.playerRemovalSupported===true;
   if(!supported)wx.showToast({title:'云端暂未启用移除球员，请稍后重试',icon:'none'});
  }catch(e){if(current())wx.showToast({title:e.message||'连接失败，请重试',icon:'none'});}
  finally{this.opening=false;if(current())this.setData({joiningBusy:false});}
  if(supported&&current())return this.removePlayer(playerId);
 },
 async submitRemoval(ref){
  if(this.opening||this.writing||!Account.user())return;
  const uid=Account.user().uid,key=this.removalKey(ref),request=wx.getStorageSync(key);if(!request)return;
  const current=()=>Account.user()?.uid===uid&&this.rid===request.roundId;
  this.opening=true;this.setData({joiningBusy:true});
  try{
   const board=await Account.call('removePlayer',{...Shared.context(ref),...request});
   if(Account.user()?.uid!==uid)return;
   if(current()&&this.boardVisible)this.showSnapshot(board);else Shared.adopt(board);
   wx.setStorageSync(key,null);
   if(current()){this.lastCell=null;if(this.boardVisible){this.refresh();this.setData({boardError:''});wx.showToast({title:'球员已移出本组',icon:'success'});}}
  }catch(e){
   if(Account.user()?.uid!==uid)return;
   const terminal=['INVALID','FORBIDDEN','CLOSED','CONFLICT','UNSUPPORTED'].includes(e.code)||/不支持此操作/.test(e.message||'');
   if(terminal)wx.setStorageSync(key,null);
   if(current()&&this.boardVisible)this.setData({boardError:terminal?e.message:'移除结果待确认，请联网后重试'});
  }finally{this.opening=false;if(current()&&this.boardVisible)this.setData({joiningBusy:false});}
 }
};
