const {S,run,go}=require('../../services/ui'),R=require('../../services/rules'),C=require('../../services/catalog'),A=require('../../services/account');
const Policies=require('../../services/scoring-policies');
function fillTestPlayers(draft){
 for(let n=1;n<=3&&draft.players.length<4;n++){
  const id='local-test-'+n;
  if(!draft.players.some(p=>p.id===id))draft.players.push({id,name:'测试'+n,isTest:true,tee:draft.players[0].tee});
 }
 draft.testPlayersInitialized=true;
}
Page({data:{policies:Policies.options,maxPlayers:R.GROUP_MAX_PLAYERS,step:1,steps:[{id:1,name:'球场路线'},{id:2,name:'同组球员'},{id:3,name:'规则确认'}],showFriends:false},onLoad(o){this.testing=o.demo==='1'&&(!!wx.__preview||wx.getAccountInfoSync?.().miniProgram?.envVersion==='develop');this.courseId=o.course;this.activityId=o.activity;this.groupId=o.group;},onShow(){this.visible=true;run(()=>{
 const d=S.read(),c=S.courses.find(c=>c.id===this.courseId);
 if(!c)throw Error('球场不存在');
 const activityId=this.activityId||null,groupId=this.groupId||null;
 const changedGroup=d.draft&&((d.draft.activityId||null)!==activityId||(d.draft.groupId||null)!==groupId);
 const legacyGroup=d.draft&&!d.draft.selectedFriends&&!activityId&&d.draft.players.some(p=>p.id!=='me'&&p.accountUid);
 if(!d.draft||d.draft.courseId!==c.id||changedGroup||legacyGroup){
  S.mutate(x=>x.draft={courseId:c.id,activityId,groupId,distanceUnit:d.settings.unit==='m'?'m':'yd',segmentIds:C.sections(c).slice(0,2).map(s=>s.id),players:[{id:'me',name:d.profile.name,tee:c.tees[0]}],ruleSnapshot:R.defaultRules('record_only')});
 }else if(!['yd','m'].includes(d.draft.distanceUnit)||'start' in d.draft){
  S.mutate(x=>{
   if(!['yd','m'].includes(x.draft.distanceUnit))x.draft.distanceUnit=d.settings.unit==='m'?'m':'yd';
   // For unstarted drafts, the displayed first/second selections are authoritative.
   delete x.draft.start;
  });
 }
 if(!activityId)S.mutate(x=>{
  const draft=x.draft,me=draft.players.find(p=>p.id==='me');
  if(me)me.name=x.profile.name;
  if(this.testing){
   if(!draft.testPlayersInitialized)fillTestPlayers(draft);
  }else if(draft.players.some(p=>p.isTest)){
   draft.players=draft.players.filter(p=>!p.isTest);
   draft.ruleSnapshot=R.defaultRules();
   delete draft.testPlayersInitialized;
  }
 });
 this.refresh();
 if(!activityId&&A.user())this.loadFriends();
 if(activityId&&A.user()){this.groupReady=false;this.loadGroup();}
});},onHide(){this.visible=false;},onUnload(){this.visible=false;},
scrollTop(){if(wx.pageScrollTo)wx.pageScrollTo({scrollTop:0,duration:180});},
setStep(e){const step=Number(e.currentTarget.dataset.id);if(step>=1&&step<=3){this.change(d=>d.setupStep=step);this.scrollTop();}},
next(){if(this.data.step<3){this.change(d=>d.setupStep=Math.min(3,(d.setupStep||1)+1));this.scrollTop();}else this.start();},
previous(){this.change(d=>d.setupStep=Math.max(1,(d.setupStep||1)-1));this.scrollTop();},
inviteToggle(e){this.change(d=>d.inviteAfterStart=!!e.detail.value);},
addPlayer(){wx.showActionSheet({itemList:['手动填写球员','从常用球友选择'],success:r=>{if(r.tapIndex===0)this.temp();else{this.setData({showFriends:true});if(!A.user())this.loginForFriends();}}});},
templatePick(e){const item=this.data.templates[Number(e.detail.value)];if(item)this.template({currentTarget:{dataset:{id:item.id}}});},
unitPick(e){this.distanceUnit({currentTarget:{dataset:{unit:Number(e.detail.value)?'m':'yd'}}});},
async loadFriends(){
 const request=this.friendRequest=(this.friendRequest||0)+1;
 try {await A.friends();if(this.visible&&request===this.friendRequest){this.setData({friendError:''});this.refresh();}}
 catch(e){if(this.visible&&request===this.friendRequest)this.setData({friendError:e.message||'暂时无法更新球友列表'});}
},
loginForFriends(){A.needLogin();},
refresh(){const d=S.read(),draft=d.draft,c=S.courses.find(c=>c.id===draft.courseId),ss=C.sections(c);
 const options=ss.map(s=>({id:s.id,name:C.sectionTitle(s.name)}));
 const first=ss.findIndex(s=>s.id===draft.segmentIds[0]),firstSection=ss[first];
 const secondOptions=[{id:'',name:'只打 9 洞'},...options.filter(s=>s.id!==firstSection?.id)];
 const firstHole=firstSection?.holes[0];
 const openingHole=firstHole?C.courseHoleTitle({...firstHole,sectionName:firstSection.name,number:1}):'';
 this.setData({draft,teePlayers:draft.players.map(p=>({...p,teeIndex:Math.max(0,c.tees.indexOf(p.tee))})),course:c,segments:options,first,secondOptions,secondIndex:Math.max(0,secondOptions.findIndex(s=>s.id===draft.segmentIds[1])),openingHole,roundLength:draft.segmentIds.length*9,onlineGroup:!!this.activityId,testPlayersEnabled:!!this.testing,step:draft.setupStep||1,inviteAfterStart:!!draft.inviteAfterStart,preview:!!wx.__preview,signedIn:!!A.user(),friends:A.user()?d.friends.filter(f=>f.accountUid).map(f=>({...f,selected:draft.players.some(p=>p.accountUid===f.accountUid)})):[],policyText:draft.ruleSnapshot.penaltyPolicy.summary||(draft.ruleSnapshot.penaltyPolicy.mode==='official'?Policies.options[0].summary:'已保存的旧版约定可在详细设置中查看。'),rulesName:R.names[draft.ruleSnapshot.scoring.type],templateIndex:['record_only','stroke_play','match_play','four_ball','points'].indexOf(draft.ruleSnapshot.grouping.type==='four_ball'?'four_ball':draft.ruleSnapshot.scoring.type),selectedTemplate:draft.ruleSnapshot.grouping.type==='four_ball'?'four_ball':draft.ruleSnapshot.scoring.type,templates:[{id:'record_only',name:'仅记分'},{id:'stroke_play',name:'个人比杆'},{id:'match_play',name:'两人比洞'},{id:'four_ball',name:'四人两队比洞'},{id:'points',name:'8421'}]});},change(fn){run(()=>{S.mutate(d=>fn(d.draft));this.refresh();});},segment(e){
 const index=Number(e.detail.value),current=this.data.draft.segmentIds;
 const isFirst=e.currentTarget.dataset.which==='first';
 const option=(isFirst?this.data.segments:this.data.secondOptions)[index];
 if(!option)return;
 let next;
 if(isFirst){
  if(option.id===current[0])return;
  // Picking the existing second nine first is a swap, not a duplicate selection.
  const following=option.id===current[1]?current[0]:current[1];
  next=following?[option.id,following]:[option.id];
 }else{
  if(option.id===(current[1]||''))return;
  next=option.id?[current[0],option.id]:[current[0]];
 }
 const rules=this.data.draft.ruleSnapshot;
 const apply=()=>this.change(draft=>{
  draft.segmentIds=next;
  draft.ruleSnapshot.handicap={mode:'none'};
  draft.ruleSnapshot.sideGames=[];
 });
 if(rules.handicap.mode==='none'&&!rules.sideGames.length)return apply();
 wx.showModal({title:'更换打球顺序',content:'原让杆与附加玩法按洞设置，更换后需重新核对。',success:r=>{if(r.confirm)apply();}});
},
distanceUnit(e){const unit=e.currentTarget.dataset.unit;if(['yd','m'].includes(unit))this.change(d=>d.distanceUnit=unit);},tee(e){this.change(d=>d.players.find(p=>p.id===e.currentTarget.dataset.pid).tee=this.data.course.tees[Number(e.detail.value)]);},add(e){
 const friend=this.data.friends.find(p=>p.accountUid===e.currentTarget.dataset.id);
 if(this.activityId||!friend||!A.user())return;
 this.change(draft=>{
  if(draft.players.some(p=>p.accountUid===friend.accountUid))return;
  const test=draft.players.find(p=>p.isTest);
  if(!test&&draft.players.length>=R.GROUP_MAX_PLAYERS)throw Error('每组最多 16 人，请先移除一位球友');
  const player={id:test?.id||friend.accountUid,accountUid:friend.accountUid,name:friend.name,tee:test?.tee||draft.players[0].tee};
  if(test)draft.players.splice(draft.players.indexOf(test),1,player);else draft.players.push(player);
  draft.selectedFriends=true;
 });
},remove(e){this.change(d=>d.players=d.players.filter(p=>p.id!==e.currentTarget.dataset.id));},testPlayers(){if(this.activityId||!this.testing)return;this.change(fillTestPlayers);},temp(){wx.showModal({title:'手动球员姓名',editable:true,success:r=>{if(r.confirm)this.change(d=>{const name=(r.content||'').trim();if(!name||name.length>20)throw Error('昵称为1–20字');if(d.players.length>=R.GROUP_MAX_PLAYERS)throw Error('每组最多 16 人');d.players.push({id:S.id(),name,isVirtual:true,tee:d.players[0].tee});d.selectedFriends=true;});}});},selectPolicy(e){
 const mode=e.currentTarget.dataset.id;
 if(!Policies.options.some(item=>item.id===mode))return;
 const previous=this.data.draft.ruleSnapshot.penaltyPolicy;
 if(previous.mode===mode&&(mode==='official'||previous.preset))return;
 this.change(draft=>{draft.ruleSnapshot.penaltyPolicy=Policies.make(mode);});
},template(e){const type=e.currentTarget.dataset.id;wx.showModal({title:'应用玩法模板',content:'应用后将更新玩法、分队与让杆设置。',success:r=>{if(r.confirm)this.change(d=>{const selectedPolicy=d.ruleSnapshot.penaltyPolicy;d.ruleSnapshot=R.defaultRules(type==='four_ball'?'match_play':type);d.ruleSnapshot.penaltyPolicy=selectedPolicy;if(type==='four_ball')d.ruleSnapshot.grouping={type:'four_ball',teams:[{teamId:'A',name:'A队',playerIds:d.players.slice(0,2).map(p=>p.id)},{teamId:'B',name:'B队',playerIds:d.players.slice(2,4).map(p=>p.id)}]};});}});},rules(){go('rules');},start(){if(this.beginning)return;if(!Policies.options.some(p=>p.id===this.data.draft.ruleSnapshot.penaltyPolicy.mode))return wx.showToast({title:'请为新球局选择记分规则',icon:'none'});if(!wx.__preview&&!A.needLogin())return;if(this.activityId){if(!this.groupReady||this.starting)return;this.starting=true;A.call('lock',{activityId:this.activityId,groupId:this.groupId}).then(members=>{const ids=members.map(m=>m.uid===A.user().uid?'me':m.uid).sort(),old=S.read().draft.players.map(p=>p.id).sort();if(JSON.stringify(ids)!==JSON.stringify(old)){this.loadGroup();throw Error('组员已变化，请核对成员和规则后再次开始');}this.begin();}).catch(e=>wx.showToast({title:e.message,icon:'none'})).finally(()=>this.starting=false);}else this.begin();},begin(){if(this.beginning)return;this.beginning=true;const result=run(()=>{const d=S.read().draft,r=S.create(d);if(this.activityId){r.cloud={activityId:this.activityId,groupId:this.groupId,ownerUid:A.user().uid,serverVersion:0};S.replace(r);}wx.redirectTo({url:'/pages/score/index?id='+r.id+(d.inviteAfterStart?'&invite=1':'')});return r;});if(!result)this.beginning=false;},group(){this.change(d=>{d.inviteAfterStart=true;d.setupStep=3;});this.scrollTop();},async loadGroup(){try{const a=await A.call('get',{activityId:this.activityId}),g=a.groups.find(g=>g.id===this.groupId);if(!g||!g.canScore||g.round)throw Error('请从小组页继续已有记分');S.mutate(d=>{const old=d.draft.players;d.draft.players=g.members.map(m=>{const id=m.uid===A.user().uid?'me':m.uid;return {id,accountUid:m.uid,name:m.name,tee:old.find(p=>p.id===id)?.tee||old[0].tee};});});this.groupReady=true;this.refresh();}catch(e){wx.showToast({title:e.message,icon:'none'});}}});
