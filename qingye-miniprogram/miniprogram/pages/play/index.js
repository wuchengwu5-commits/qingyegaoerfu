const {S,go,tab,run}=require('../../services/ui');
const E=require('../../services/engine');
const Scene=require('../../services/scene');
const Catalog=require('../../services/catalog');
const Account=require('../../services/account');
const Entry=require('../../services/score-entry');

Page({
 data:{scoreTargets:[],activeRounds:[],activeEvents:[],draft:null,recent:[],topInset:32,endingId:''},
 onLoad(){this.offPersonal=require('../../services/personal-sync').subscribe(()=>{if(this.visible&&!this.data.scoreTargets.length)this.onShow();});this.offAccount=Account.subscribe(()=>{if(this.visible&&this.data.scoreTargets.length&&this.scoreUid!==(Account.user()?.uid||''))this.showHub();});this.setData({topInset:Scene.topInset(),liveTopInset:Math.max(0,Scene.topInset()-30)});},
 onUnload(){this.visible=false;this.offPersonal?.();this.offAccount?.();},
 onShow(){this.visible=true;if(this.data.scoreTargets.length&&this.scoreUid!==(Account.user()?.uid||''))this.showHub();
  Scene.selectTab(this,1);
  this.refreshHub();
  const first=!this.entered;this.entered=true;
  if(Entry.handleAppEntry())return;
  if(!this.handleEntry()&&first)this.activate(Entry.target());
  if(this.data.scoreTargets.length){const t=this.data.scoreTargets[0],local=t.options.id?S.getRound(t.options.id):null;if(local&&!Entry.active(local))this.showHub();}
 },
 refreshHub(){
  const data=S.read(),active=data.rounds.filter(item=>item.status==='active'&&!require('../../services/round-history').backup(item));
  const draft=data.draft,course=draft&&S.courses.find(item=>item.id===draft.courseId);
  this.setData({
   activeRounds:active.map((round,index)=>({
    id:round.id,
    name:round.courseName,
    label:'第 '+(index+1)+' 组',
    hole:Catalog.courseHoleTitle(round.holes.find(hole=>hole.number===round.currentHole)),
    holes:round.holes.length,
    players:round.players.length,
    canFinish:!round.cloud||round.cloud.ownerUid===Account.user()?.uid
   })),
   draft:course?{course:course.id,name:course.name,activity:draft.activityId,group:draft.groupId}:null,
   recent:data.rounds.filter(r=>r.status!=='active'&&!require('../../services/round-history').backup(r)).slice().sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)).slice(0,5).map(r=>{
    const summary=E.summary(r,'me');
    return {id:r.id,name:r.courseName,date:r.date?r.date.replace(/-/g,'.'):S.date(r.createdAt),holes:r.holes.length,played:summary.played,total:summary.totalText,scoreLabel:summary.complete?'总杆':'已记杆数',state:E.isFinished(r)?(summary.complete?'已完成':'部分完成'):(r.status==='paused'?'已暂存':'已结束')};
   })
  });
  this.loadEvents();
 },
 onHide(){this.visible=false;this.eventRequest=(this.eventRequest||0)+1;},
 async loadEvents(){
  const request=this.eventRequest=(this.eventRequest||0)+1,uid=Account.user()?.uid;
  if(!uid){this.setData({activeEvents:[]});return;}
  try{
   const [events,activities]=await Promise.allSettled([Account.call('competitionList'),Account.call('list')]);
   if(this.eventRequest!==request||Account.user()?.uid!==uid)return;
   if(events.status==='fulfilled')this.setData({activeEvents:events.value.filter(event=>['active','revising'].includes(event.status))});
   if(activities.status==='fulfilled'){
    const localIds=new Set(S.read().rounds.map(r=>r.id));
    const online=activities.value.flatMap(a=>(a.groups||[]).filter(g=>g.canScore&&g.roundId&&['active','paused'].includes(g.status)&&!localIds.has(g.roundId)).map(g=>({id:g.roundId,name:a.courseName,label:g.name||'同组球局',activityId:a.id,groupId:g.id,holes:g.holes,players:g.players,canFinish:g.canFinish})));
    this.setData({activeRounds:[...this.data.activeRounds.filter(r=>!r.activityId),...online]});
   }
  }catch(_){/* Local rounds remain available during cloud interruptions. */}
 },
 start(){
  const {activeRounds:[round],draft}=this.data;
  if(round)return go('score','?id='+encodeURIComponent(round.id));
  if(draft)return this.resumeDraft();
  this.choose();
 },
 resumeDraft(){
  const draft=this.data.draft;if(!draft)return;
  let query='?course='+encodeURIComponent(draft.course);
  if(draft.activity&&draft.group)query+='&activity='+encodeURIComponent(draft.activity)+'&group='+encodeURIComponent(draft.group);
  go('create',query);
 },
 handleEntry(){
  const cmd=Entry.consume();if(!cmd)return false;
  if(cmd.kind==='create'){this.showHub();go('create','?fresh=1'+(cmd.course?'&course='+encodeURIComponent(cmd.course):''));}
  else if(cmd.kind==='hub')this.showHub();
  else this.activate(cmd.kind==='score'?cmd.options:Entry.target());
  return true;
 },
 activate(options){
  if(!options)return this.showHub();
  const id=options.activity&&options.group?options.activity+':'+options.group:options.id;
  const key=id?(Account.user()?.uid||'local')+':'+id:null;
  if(!key)return this.showHub();
  // Returning from WeChat or a details page keeps the current scroll position.
  if(this.data.scoreTargets[0]?.key===key)return;
  this.scoreUid=Account.user()?.uid||'';this.setData({scoreTargets:[{key,options}]});
  wx.pageScrollTo?.({scrollTop:0,duration:0});
 },
 showHub(){const wasLive=this.data.scoreTargets.length;this.setData({scoreTargets:[]});if(wasLive&&this.visible)this.refreshHub();wx.pageScrollTo?.({scrollTop:0,duration:0});},
 boardClosed(){this.showHub();this.onShow();},
 onShareAppMessage(){return this.selectComponent?.('.live-score')?.onShareAppMessage?.()||{title:'青野高尔夫',path:'/pages/home/index'};},
 choose(){this.showHub();go('create','?fresh=1');},
 scan(){
  if(this.scanning)return;
  if(!wx.scanCode)return wx.showToast({title:'请在微信中扫码加入',icon:'none'});
  this.scanning=true;
  wx.scanCode({onlyFromCamera:false,success:result=>{
   const match=(result.path||result.result||'').match(/(?:scene|token)=([a-f0-9]{24})(?:&|$)/);
   if(!match)return wx.showToast({title:'请扫描青野的小程序邀请码',icon:'none'});
   go('groups','?token='+match[1]);
  },fail:error=>{
   if(!/cancel/i.test(error.errMsg||''))wx.showToast({title:'暂未完成扫码，请重试',icon:'none'});
  },complete:()=>{this.scanning=false;}});
 },
 continueRound(e){const r=this.data.activeRounds.find(r=>r.id===e.currentTarget.dataset.id);if(r)this.activate(r.activityId?{id:r.id,activity:r.activityId,group:r.groupId}:{id:r.id});},
 async endRound(e){
  const item=this.data.activeRounds.find(r=>r.id===e.currentTarget.dataset.id);
  if(!item?.canFinish||this.data.endingId)return;
  this.setData({endingId:item.id});
  try{
   if(await require('../../services/end-round')(item)){
    this.onShow();wx.showToast({title:'本组已结束',icon:'success'});
   }
  }catch(error){wx.showToast({title:error.message||'暂未结束，请重试',icon:'none',duration:3500});this.onShow();}
  finally{this.setData({endingId:''});}
 },
 groups(){go('history');},
 competition(){wx.navigateTo({url:'/packages/competition/index'});},
 competitionRank(e){
  wx.navigateTo({url:'/packages/competition/index?id='+encodeURIComponent(e.currentTarget.dataset.id)+'&view=rank'});
 },
 competitionBoard(e){
  const {id,group}=e.currentTarget.dataset;
  if(group)this.activate({activity:id,group});
 },
 recent(e){run(()=>{const r=S.getRound(e.currentTarget.dataset.id);if(!r)throw Error('这场记录已不存在，请刷新页面');go(r.status==='active'?'score':'result','?id='+encodeURIComponent(r.id));});},
 history(){go('history');}
});
