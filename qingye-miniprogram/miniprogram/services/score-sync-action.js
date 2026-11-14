const Account=require('./account'),Personal=require('./personal-sync'),Cloud=require('./cloud-sync');
const Dialog=require('./dialog'),{go}=require('./ui');

// Refresh the existing private/shared channel; this action never creates a group
// or assigns an unclaimed local round to the signed-in account.
module.exports=async function refreshScoreSync(){
 if(this.manualSyncing||this.data.editing||!this.boardVisible)return;
 if(this.data.conflictCellCount)return this.resolveCellConflict();
 if(this.data.boardConflict)return this.resolveBoard();
 if(this.pulling||this.writing)return wx.showToast({title:'正在同步，请稍候',icon:'none'});
 if(!Account.needLogin())return;
 const r=this.viewedRound(),uid=Account.user()?.uid,rid=this.rid;
 if(!r)return;
 if(!this.remoteRef&&!r.cloud&&!r.ownerUid){
  return Dialog.modal({title:'仅保存在本机',content:'这场球局尚未关联账号。请到球局历史确认归属后备份。',confirmText:'查看球局',success:result=>{if(result.confirm&&this.boardVisible&&Account.user()?.uid===uid)go('history');}});
 }
 if(!this.remoteRef&&!r.cloud&&r.ownerUid!==uid)return wx.showToast({title:'请使用本场球局所属账号同步',icon:'none'});
 const request={};this.manualSyncing=request;this.setData({manualSyncBusy:true});
 const current=()=>this.manualSyncing===request&&this.boardVisible&&this.rid===rid&&Account.user()?.uid===uid;
 try{
  let title;
  if(this.remoteRef||this.data.liveBoard){
   await this.pollBoard();if(!current())return;
   title=this.data.boardError||(this.data.conflictCellCount||this.data.boardConflict?'有成绩待核对':this.pendingCells().length?'本机已记，等待同步':'已刷新同组成绩');
  }else{
   let ok=true;
   if(r.cloud)await Cloud.flush();else ok=await Personal.sync();
   if(!current())return;
   this.refresh();
   const status=Personal.status(this.viewedRound());
   title=ok===false?(Personal.error()||'暂未完成同步，请重试'):(status==='已保存到账号'||status==='已同步'?'已备份到账号':status);
  }
  if(current())wx.showToast({title,icon:'none',duration:2500});
 }catch(error){if(current())wx.showToast({title:error.message||'暂未完成同步，请重试',icon:'none',duration:2500});}
 finally{if(this.manualSyncing===request){this.manualSyncing=null;if(this.boardVisible)this.setData({manualSyncBusy:false});}}
};
