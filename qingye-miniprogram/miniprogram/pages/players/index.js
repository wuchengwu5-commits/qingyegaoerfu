const {S,go}=require('../../services/ui'),A=require('../../services/account'),Source=require('../../services/round-source');
const Details=require('../../services/player-details'),Dialog=require('../../services/dialog'),Sync=require('../../services/cloud-sync');
const Shared=require('../../services/shared-round'),Queue=require('../../services/score-edit-queue');
Page({
 data:{rows:[],ready:false,loading:false,saving:false,error:'',editor:null,canManage:false,tees:[]},
 onLoad(o){this.options=o;this.requestId=0;},
 onShow(){this.visible=true;this.load();},
 onHide(){this.visible=false;this.requestId++;},onUnload(){this.onHide();},
 async load(){
  const request=++this.requestId,uid=A.user()?.uid;
  this.setData({loading:true,error:'',editor:null});
  try{
   let source;
   const local=this.options.id&&S.getRound(this.options.id);
   if(local&&!local.cloud||local&&S.isEditing(local.id))source={round:local,canEdit:true};
   else source=await Source.load(this.options);
   if(!this.visible||request!==this.requestId||uid!==A.user()?.uid)return;
   if(source.ref&&source.board?.ownerUid===uid)Shared.adopt(source.board);
   this.source=source;this.uid=uid;this.render();
  }catch(e){if(this.visible&&request===this.requestId)this.setData({error:e.message||'组员资料暂未载入，请重试',canManage:false});}
  finally{if(this.visible&&request===this.requestId)this.setData({loading:false});}
 },
 render(){
  const source=this.source,r=source.round,uid=A.user()?.uid;
  const profiles=[...(A.user()?[A.user()]:[]),...(source.board?.profiles||[]),...S.displayProfiles()];
  const canManage=source.canEdit&&r.status!=='cancelled'&&(!r.ownerUid||r.ownerUid===uid||source.board?.ownerUid===uid);
  this.setData({ready:true,courseName:r.courseName,rows:Details.labels(r,profiles).map(p=>({...p,isMine:source.ref?p.id===source.mineId:p.id==='me'})),canManage:!!canManage,
   tees:Details.tees(r,S.courses.find(c=>c.id===r.courseId)),finished:require('../../services/rules').isFinished(r)});
 },
 editPlayer(e){
  if(!this.data.canManage||this.data.saving)return;
  const row=this.data.rows.find(p=>p.id===e.currentTarget.dataset.id);if(!row)return;
  this.editBase={revision:this.source.round.revision,version:this.source.board?.version,name:row.actualName};
  this.setData({error:'',editor:{id:row.id,name:row.actualName,tee:row.tee,teeIndex:Math.max(0,this.data.tees.indexOf(row.tee))}});
 },
 editName(){
  const editor=this.data.editor,request=this.requestId;if(!editor||this.data.saving)return;
  Dialog.modal({title:'修改本轮称呼',message:'只修改这张记分卡中的称呼。',editable:true,value:editor.name,maxLength:20,confirmText:'确定',success:r=>{
   if(r.confirm&&this.visible&&request===this.requestId&&this.data.editor?.id===editor.id)this.setData({editor:{...this.data.editor,name:r.content.trim()}});
  }});
 },
 changeTee(e){
  const i=Number(e.detail.value);if(this.data.saving||!this.data.editor||!this.data.tees[i])return;
  this.setData({editor:{...this.data.editor,tee:this.data.tees[i],teeIndex:i}});
 },
 cancelEdit(){if(!this.data.saving)this.setData({editor:null,error:''});},
 async save(){
  if(this.data.saving||!this.visible||!this.data.editor||!this.data.canManage)return;
  const uid=A.user()?.uid,request=this.requestId,editor={...this.data.editor},source=this.source;
  if(uid!==this.uid)return this.setData({error:'账号已变化，请重新载入组员资料'});
  this.setData({saving:true,error:''});
  try{
   const id=source.round.id,local=S.getRound(id),ref=source.ref||local?.cloud;
   if(ref&&!S.isEditing(id)){
    if(!uid||source.board?.ownerUid!==uid&&local?.cloud?.ownerUid!==uid)throw Error('只有本组发起人可以调整组员资料');
    if(Sync.pending(id)||Queue.read(Shared.pendingKey(ref)).length)throw Error('请先完成当前记分同步，再保存组员资料');
    const latest=await Source.load(this.options);
    if(!this.visible||request!==this.requestId||A.user()?.uid!==uid)return;
    if(!latest.canEdit||latest.board.version!==this.editBase.version)throw Error('组内记录已有更新，请重新载入后修改');
   }
   const current=S.getRound(id)||source.round;
   if(current.ownerUid&&current.ownerUid!==uid&&current.cloud?.ownerUid!==uid)throw Error('当前账号不能修改这场球局');
   if(current.revision!==this.editBase.revision)throw Error('本轮记录已有更新，请重新载入后修改');
   const updated=Details.edit(current,S.courses.find(c=>c.id===current.courseId),editor.id,{...editor,name:editor.name===this.editBase.name?undefined:editor.name},{operationId:S.id(),baseRevision:this.editBase.revision});
   if(!this.visible||request!==this.requestId||A.user()?.uid!==uid)return;
   if(updated.revision!==current.revision){
    if(local)S.replace(updated);
    else{
     const saved={...updated,ownerUid:uid,cloud:{...ref,ownerUid:uid,live:true,serverVersion:source.board.version,cells:source.board.cells}};
     S.mutate(d=>{if(d.rounds.some(r=>r.id===id))throw Error('本轮记录已有更新，请重新载入');d.rounds.push(saved);});Sync.enqueue(saved);
    }
    this.source={...source,round:S.getRound(id)||updated};
   }
   this.setData({editor:null});this.render();
   wx.showToast({title:'组员资料已保存',icon:'success'});
   if(ref&&!S.isEditing(id)){await Sync.flush();if(this.visible&&request===this.requestId&&uid===A.user()?.uid){if(Sync.pending(id))this.setData({error:'本机修改已保留，请等待同步完成后再修改'});else await this.load();}}
  }catch(e){if(this.visible&&request===this.requestId)this.setData({error:e.message||'未能保存，请重试'});}
  finally{if(this.visible&&request===this.requestId)this.setData({saving:false});else if(this.visible)this.setData({saving:false});}
 },
 account(){if(!this.data.saving)go('account');}
});
