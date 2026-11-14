const Dialog = require('./dialog');
const {S,run,go,confirm}=require('./ui'),R=require('./rules'),T=require('./score-totals'),A=require('./appearance');
const Account=require('./account');
const Catalog=require('./catalog');
const Policies=require('./scoring-policies');
const Route=require('./score-route');
const ScoreView=require('./score-view');
const ViewPatch=require('./view-patch');
module.exports={...require('./score-board-page'),data:{technical:false,operations:false,routeEditing:false,scoreScrollLeft:0},
 onLoad(o){this.offPersonal=require('./personal-sync').subscribe(()=>{if(this.boardVisible&&!this.remoteRef)this.refresh();});this.rid=o.id;this.setupBoard(o);this.inviteOnOpen=o.invite==='1';},
 onShow(){this.openingCourseMap=false;this.displayProfiles=null;this.setData({manualSyncBusy:!!this.manualSyncing});this.refresh();if(this.inviteOnOpen){this.inviteOnOpen=false;this.boardVisible=true;this.enableSharing();}else this.showBoard();},
 onHide(){this.hideBoard();},onUnload(){this.hideBoard();this.offPersonal?.();},
 refreshScoreSync:require('./score-sync-action'),
 showRoundList(){require('./score-entry').hub();},
 refresh(round){run(()=>{
  const r=round||this.viewedRound();if(!r&&this.remoteRef)return;if(!r)throw Error('球局不存在');
  if((R.isFinished(r)||r.status==='cancelled')&&!this.remoteRef){wx.redirectTo({url:'/pages/result/index?id='+r.id});return;}
  if(!this.boardReadOnly)require('./score-entry').remember(this.remoteRef?{activity:this.remoteRef.activityId,group:this.remoteRef.groupId}:{id:r.id},r);
  const n=r.currentHole,h=r.holes.find(h=>h.number===n)||r.holes[0],p=r.players.find(p=>p.id===r.currentPlayer)||r.players[0],s=r.scores[p.id][h.number];
  this.displayProfiles ||= S.displayProfiles();
  const profiles=[...(Account.user()?[Account.user()]:[]),...(this.boardProfiles||[]),...this.displayProfiles];
  const displayPlayers=require('./player-details').labels(r,profiles);
  const label=player=>(this.remoteRef?player.accountUid===Account.user()?.uid:player.id==='me')?'我':(displayPlayers.find(p=>p.id===player.id)?.name||player.name);
  const view=ScoreView.liveTable(r,label,profiles),course=S.courses.find(c=>c.id===r.courseId),sections=Route.sections(r,course);
  const routeIds=Route.selected(r);
  const cursorKey=JSON.stringify([h.id,h.number,r.courseSnapshot?.routeRevision]);
  const scroll={};if(this.visibleCursor!==cursorKey){
   const width=wx.getWindowInfo?.().windowWidth||wx.getSystemInfoSync?.().windowWidth||375;
   const available=Math.max(135,width-132),left=this.actualScoreScroll||0,x=view.currentColumnLeft;
   if(x<left||x+45>left+available)scroll.scoreScrollLeft=Math.max(0,x-45);
   this.visibleCursor=cursorKey;
  }
  const {changeLog,operations,corrections,...boundRound}=r;
  if(boundRound.courseSnapshot){const {routeArchive,rosterArchive,...snapshot}=boundRound.courseSnapshot;boundRound.courseSnapshot=snapshot;}
  const scorerChoices=[...r.players.filter(p=>p.accountUid||p.id==='me').map(p=>({id:p.accountUid||Account.user()?.uid,name:label(p)})),...(this.boardScorerUids||[]).map(id=>({id,name:profiles.find(p=>p.uid===id)?.name||'记分员'}))].filter((p,i,a)=>p.id&&a.findIndex(x=>x.id===p.id)===i);
  const scorerIndex=Math.max(0,scorerChoices.findIndex(p=>p.id===(this.primaryScorerUid||this.boardOwnerUid||r.cloud?.ownerUid||Account.user()?.uid)));
  const next={scorerChoices,scorerIndex,primaryScorerName:scorerChoices[scorerIndex]?.name||'我',canFinishRemote:!!this.remoteRef&&!this.competitionBoard&&this.boardOwnerUid===Account.user()?.uid,...view,...scroll,r:boundRound,h,p,s:s||null,courseHole:Catalog.courseHoleTitle(h),
   scorers:(this.boardScorerUids||[]).map(uid=>({uid,name:profiles.find(p=>p.uid===uid)?.name||'记分员'})),
   policyName:Policies.name(r.ruleSnapshot.penaltyPolicy.mode),liveBoard:!!(this.remoteRef||r.cloud?.live),boardFinished:(R.isFinished(r)||r.status==='cancelled')&&!this.correctionOpen,
   canInvite:!this.competitionBoard&&(!this.remoteRef||r.players.find(player=>player.id==='me')?.accountUid===Account.user()?.uid),
   competitionBoard:!!this.competitionBoard,scoreLocked:!!this.boardReadOnly||!!this.lockedPlayers?.includes(p.id),
   routeLabel:routeIds.map(id=>Catalog.sectionTitle(sections.find(s=>s.id===id)?.name||r.holes.find(h=>h.sectionId===id)?.sectionName)).join(' → '),
   canAdjustRoute:!this.remoteRef&&!S.isEditing(r.id)&&!R.isFinished(r)&&sections.length>1,
   playerLabel:label(p),syncText:require('./personal-sync').status(r),editing:!this.remoteRef&&S.isEditing(r.id),
   currentTee:view.players.find(player=>player.id===p.id)?.tee||p.tee,currentDistance:ScoreView.distance(r,p,h),
   currentPar:R.par(r,p.id,h.number),summary:T.summary(r,p.id),displayScore:s?ScoreView.value(s):R.par(r,p.id,h.number),appearance:A.appearance(s?.grossStrokes,R.par(r,p.id,h.number),s?.completion),
   explanation:R.derivePlayerHole(r,p.id,h.number,undefined,r.ruleSnapshot.scoring.type==='match_play'?'main':undefined).explanation,
   statusText:s?({holed_out:'实际完洞',picked_up:'已捡球',skipped:'已跳洞',conceded_next_stroke:'认可完成'})[s.completion]:'尚未记录'};
  const patch=ViewPatch.diff(this.data,next);if(Object.keys(patch).length)this.setData(patch);
 });},
 playerDetails(){go('players',require('./round-source').query(this.remoteRef?{activity:this.remoteRef.activityId,group:this.remoteRef.groupId}:{id:this.rid}));},
 scoreScrolled(e){this.actualScoreScroll=e.detail.scrollLeft;},
 editRoute(){
  if(!this.data.canAdjustRoute||!this.boardSettled())return;
  if(this.data.liveBoard&&!this.routeEditingSupported)return wx.showToast({title:'共同记分服务更新后可调整路线',icon:'none'});
  const r=this.viewedRound();this.routeBase=JSON.stringify([r.revision,r.courseSnapshot?.routeRevision]);
  this.routeSections=Route.sections(r,S.courses.find(c=>c.id===r.courseId));this.routeDraft=Route.selected(r);
  this.setData({routeEditing:true});this.refreshRouteDraft();
 },
 refreshRouteDraft(){
  const options=this.routeSections.map(s=>({id:s.id,name:Catalog.sectionTitle(s.name)}));
  const first=options.filter(s=>s.id!==this.routeDraft[1]),second=options.filter(s=>s.id!==this.routeDraft[0]);
  const title=id=>options.find(s=>s.id===id)?.name||'';
  this.setData({routeFirstOptions:first,routeSecondOptions:second,routeFirstIndex:first.findIndex(s=>s.id===this.routeDraft[0]),
   routeSecondIndex:second.findIndex(s=>s.id===this.routeDraft[1]),routeFirstName:title(this.routeDraft[0]),routeSecondName:title(this.routeDraft[1]),
   routeTwo:this.routeDraft.length===2,routeDraftLabel:this.routeDraft.map(title).join(' → ')});
 },
 routePick(e){const which=Number(e.currentTarget.dataset.which),list=which?this.data.routeSecondOptions:this.data.routeFirstOptions;this.routeDraft[which]=list[Number(e.detail.value)].id;this.refreshRouteDraft();},
 swapRoute(){this.routeDraft.reverse();this.refreshRouteDraft();},
 cancelRoute(){this.setData({routeEditing:false});},
 applyRoute(){run(()=>{
  if(!this.data.canAdjustRoute||!this.boardSettled())return;
  const r=this.viewedRound();
  if(this.routeBase!==JSON.stringify([r.revision,r.courseSnapshot?.routeRevision])){this.setData({routeEditing:false});throw Error('记分牌已有更新，请重新选择路线');}
  if(JSON.stringify(Route.selected(r))!==JSON.stringify(this.routeDraft)){
   const next=Route.change(r,S.courses.find(c=>c.id===r.courseId),this.routeDraft);S.replace(next);this.lastCell=null;
  }
  this.actualScoreScroll=0;this.visibleCursor=null;this.setData({routeEditing:false,scoreScrollLeft:0});this.refresh();
  wx.showToast({title:'路线已调整',icon:'success'});
 });},
 avatarError(e){const id=e.currentTarget.dataset.id;this.setData({tablePlayers:this.data.tablePlayers.map(p=>p.id===id?{...p,avatarUrl:''}:p),players:this.data.players.map(p=>p.id===id?{...p,avatarUrl:''}:p)});},
 viewPolicy(){
 const policy=this.data.r?.ruleSnapshot?.penaltyPolicy;
 if(!policy)return;
 const terms=policy.summary || (policy.mode==='official'?Policies.options[0].summary:(policy.topics||[]).map((row,i)=>R.topics[i]+'：'+row.action+'，'+row.outcome).join('\n'));
 Dialog.modal({title:Policies.name(policy.mode),content:[terms,...(policy.localRules||[])].filter(Boolean).join('\n'),showCancel:false});
},save(s,target){if(this.opening||this.data.boardFinished||this.data.scoreLocked)return;if(this.data.liveBoard&&!this.data.editing)return this.writeCell(s,target||this.cellTarget());run(()=>{this.refresh(S.saveScore(this.rid,this.data.p.id,this.data.h.number,s));});},quick(e){const n=Number(e.currentTarget.dataset.value);this.save({...this.data.s,completion:'holed_out',strokes:n,grossStrokes:n,putts:this.data.s?.putts??null,penalties:this.data.s?.penalties??0,fairway:this.data.s?.fairway??null,green:this.data.s?.green??null});},step(e){const n=Math.max(1,(this.data.s?.grossStrokes??this.data.currentPar??this.data.h.par)+Number(e.currentTarget.dataset.delta));this.quick({currentTarget:{dataset:{value:n}}});},input(){if(!this.data.s)this.quick({currentTarget:{dataset:{value:this.data.currentPar??this.data.h.par}}});},tech(e){if(!this.data.s)return wx.showToast({title:'先填本洞总杆',icon:'none'});const k=e.currentTarget.dataset.key,original=this.data.s,target=this.data.liveBoard?this.cellTarget():null;Dialog.modal({title:k==='putts'?'推杆数，留空未记录':'罚杆分项（不会再加总杆）',editable:true,content:this.data.s[k]==null?'':String(this.data.s[k]),success:r=>{if(r.confirm)this.save({...original,strokes:original.grossStrokes,[k]:r.content===''?(k==='putts'?null:0):Number(r.content)},target);}});},hit(e){if(!this.data.s)return;const k=e.currentTarget.dataset.key;if(k==='fairway'&&this.data.h.par===3)return;const old=this.data.s[k];this.save({...this.data.s,strokes:this.data.s.grossStrokes,[k]:old===null?true:old===true?false:null});},clear(){const target=this.data.liveBoard?this.cellTarget():null;confirm('清空本洞','可撤销；只影响当前球友。',()=>this.save(null,target));},selectPlayer(e){run(()=>{this.moveCursor({currentPlayer:e.currentTarget.dataset.id});this.refresh();});},hole(e){run(()=>{const {pid,number}=e.currentTarget.dataset;this.moveCursor({currentHole:Number(number),...(pid?{currentPlayer:pid}:{})});this.refresh();});},technical(){this.setData({technical:!this.data.technical});},operations(){this.setData({operations:!this.data.operations});},groups(){go('groups',this.data.r.cloud?'?activity='+this.data.r.cloud.activityId:'?course='+this.data.r.courseId);},guide(){const r=this.viewedRound();if(r)require('./course-map-route').openFromPage(this,r.courseId,r.id,this.data.h.number,r);},pause(){require('./score-entry').hub();},jump(n){run(()=>{this.moveCursor({currentHole:n});this.refresh();});},adjust(e){if(!this.boardSettled())return;go('adjust','?id='+this.rid+'&mode='+e.currentTarget.dataset.mode);},undo(){if(this.data.liveBoard&&!this.data.editing)return this.undoCell();if(this.remoteRef)return this.undoCell();run(()=>{const r=S.getRound(this.rid),l=r.changeLog[r.changeLog.length-1];if(!l||l.kind==='undo'||l.newRevision!==r.revision)throw Error('没有可撤销的最近操作');if(l.kind==='event'){Dialog.modal({title:'仅更正录入错误',message:'实际让步不可反悔。请写明录入错误：',editable:true,success:x=>{if(x.confirm)run(()=>{S.operate(r.id,{type:'undo',targetId:l.operationId,entryError:true,reason:x.content});this.refresh();});}});}else{this.refresh(S.operate(r.id,{type:'undo',targetId:l.operationId,reason:'撤销上次录入'}));}});},rules(){go('rules','?id='+this.rid+'&view=1');},result(){go('result',require('./round-source').query(this.remoteRef?{activity:this.remoteRef.activityId,group:this.remoteRef.groupId}:{id:this.rid}));},async finish(){if(this.finishing||!this.boardSettled())return;this.finishing=true;try{if(await require('./end-round')({id:this.rid,...(this.remoteRef||{})}))wx.redirectTo({url:'/pages/result/index?id='+this.rid});}catch(e){wx.showToast({title:e.message,icon:'none'});}finally{this.finishing=false;}},commit(){const old=S.read().rounds.find(r=>r.id===this.rid),now=S.getRound(this.rid),V=require('./service'),diff=now.players.map(p=>p.name+' 实际 '+R.rawSummary(old,p.id).totalText+' → '+R.rawSummary(now,p.id).totalText).join('；');Dialog.modal({title:'确认更正并填写原因',message:diff+'。主赛：'+V.describeResult(old)+' → '+V.describeResult(now)+'。附加玩法与统计同步重算。',editable:true,success:r=>{if(r.confirm)run(()=>{S.commitEdit(r.content);wx.redirectTo({url:'/pages/result/index?id='+this.rid});});}});},cancel(){confirm('放弃更正','原成绩保持不变。',()=>{S.cancelEdit();wx.redirectTo({url:'/pages/result/index?id='+this.rid});});}};
