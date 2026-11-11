const Account = require('../../services/account');
const Catalog = require('../../services/catalog');
const Code = require('../../services/invite-code');
const {S, go} = require('../../services/ui');

const byId = (items,id) => items.find(item => item.id === id);
const value = event => event.detail.value;
const data = event => event.currentTarget.dataset;
const cardLabels = {open:'待交卡',submitted:'已交卡',incomplete:'未完赛',withdrawn:'已退赛',disqualified:'取消资格'};
const resolutions = [
  {id:'open',name:'退回核对'}, {id:'incomplete',name:'标记未完赛'},
  {id:'withdrawn',name:'标记退赛'}, {id:'disqualified',name:'取消资格'}
];
const codeLabels = {'competition-player':'邀请参赛球员','competition-watch':'邀请围观','competition-scorer':'邀请记分员 / 球童'};

Page({
  data:{
    flowSteps:[{id:'groups',n:1,name:'分组加人'},{id:'schedule',n:2,name:'出发安排'},{id:'review',n:3,name:'确认开赛'}],peopleOpen:false,signedIn:false,events:[],event:null,invitation:null,busy:false,error:'',
    setup:false,course:null,sections:[],first:0,second:0,
    title:'',date:'',localRules:'',step:'groups',group:null,entry:null,invite:null,code:'',codeOpen:false,codeBusy:false
  },
  onLoad(options={}){
    this.activityId=options.id||null;this.requestedGroup=options.group||null;
    this.requestedStep=options.view==='rank'?'rank':null;
    this.token=/^[a-f0-9]{24}$/.test(options.token||'')?options.token:null;
    const now=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    this.setData({date:now,hasToken:!!options.token});
    if(options.token&&!this.token)this.setData({error:'邀请码无效，请重新扫码'});
  },
  onShow(){
    this.visible=true;
    if(wx.setNavigationBarTitle)wx.setNavigationBarTitle({title:'比赛记分'});
    this.openingCoursePicker=false;
    this.setData({signedIn:!!Account.user()});
    if(this.returningGroupPicker){this.returningGroupPicker=false;return;}
    if(Account.user())this.refresh();
  },
  onHide(){this.visible=false;clearTimeout(this.poll);this.closeCode();},
  onUnload(){this.visible=false;this.destroyed=true;clearTimeout(this.poll);this.closeCode();},
  login(){Account.needLogin();},
  async task(fn){
    if(this.data.busy||!Account.needLogin())return;
    this.setData({busy:true,error:''});
    try{await fn();}catch(error){this.setData({error:error.message||'操作失败，请重试'});}
    finally{this.setData({busy:false});}
  },
  async refresh(){
    const request=this.request=(this.request||0)+1;
    clearTimeout(this.poll);
    try{
      if(this.token){
        const invitation=await Account.call('invitation',{token:this.token});
        if(request!==this.request||!this.visible)return;
        if(!invitation.competition){wx.redirectTo({url:'/pages/groups/index?token='+this.token});return;}
        this.setData({invitation,joinName:Account.user().name,joinTee:0,joinSeat:invitation.canAdd?'+':''});
      }else if(this.activityId){
        const event=await Account.call('competitionGet',{activityId:this.activityId});
        if(request!==this.request||!this.visible)return;
        this.showEvent(event);
        if(this.visible&&!this.data.entry&&event.status==='active')this.poll=setTimeout(()=>this.refresh(),10000);
      }else{
        const events=await Account.call('competitionList');
        if(request===this.request&&this.visible)this.setData({events});
      }
    }catch(error){if(request===this.request&&this.visible)this.setData({error:error.message});}
  },
  showEvent(event){
    const same=this.data.event?.id===event.id;
    const group=byId(event.groups,same?this.data.group?.id:this.requestedGroup||event.myGroupId)||
      (event.isOwner?event.groups[0]:null);
    const defaultRoute=event.defaultRoute||{courseId:event.courseId,courseName:event.courseName,segmentIds:event.terms.segmentIds,tees:event.tees,holes:event.holes};
    const initialStep=event.status==='draft'?'groups':this.requestedStep||(group?'cards':'rank');
    this.requestedStep=null;
    const groups=event.groups.map(g=>{
      const route=g.route||defaultRoute;
      return {...g,rosterCount:g.roster?.length||0,holeCount:route.holes.length,route,teeOptions:['请选择发球台',...route.tees],
        roster:g.roster?.map(p=>({...p,teeIndex:Math.max(0,route.tees.indexOf(p.tee)+1)})),
        scorerIndex:Math.max(0,(g.scorerChoices||[]).findIndex(p=>p.id===g.primaryScorerId)),canContinue:g.canEdit&&event.status==='active',
        startName:route.holes.find(h=>h.number===g.startHole)?.name||'待选起始洞'};
    });
    const selected=byId(groups,group?.id)||null;
    const cards=(selected?.cards||[]).map(c=>({...c,statusLabel:cardLabels[c.state]}));
    this.setData({event:{...event,holeCount:event.holes.length,issueCount:(event.issues||[]).length,defaultRoute,groups,leaderboards:event.leaderboards||[{id:'default',courseName:event.courseName,routeName:defaultRoute.routeName,holes:event.holes.length,rows:event.rows||[]}]},group:selected,cards,
      playingCount:groups.filter(g=>g.count||g.roster?.length).length,playingGroups:groups.filter(g=>g.count||g.roster?.length),groupLabels:groups.map(g=>g.name+' · '+g.count+'/'+g.capacity+' 人'),groupIndex:Math.max(0,groups.findIndex(g=>g.id===selected?.id)),
      hasScheduleIssues:(event.issues||[]).some(i=>/^(schedule|slot)-/.test(i.id)),
      step:same&&this.data.event.status===event.status?this.data.step:initialStep,
      scheduleTime:selected?.time||'08:00'});
    if(selected&&event.status==='draft')this.setGroupRoute(selected.route,selected.usesDefault!==false,selected.startHole);
  },
  open(event){
    this.activityId=data(event).id;
    this.setData({setup:false,event:null,step:'groups',error:''});
    this.refresh();
  },
  list(){
    this.activityId=null;this.token=null;
    this.setData({event:null,group:null,invitation:null,setup:false,hasToken:false,error:''});
    this.refresh();
  },
  beginSetup(){
    if(!Account.needLogin())return;
    this.createId=S.id();
    this.setData({setup:true,course:null,sections:[],first:0,second:0,title:'',localRules:'',error:''});
  },
  openCoursePicker(){
    if(this.openingCoursePicker||this.data.busy||!this.data.setup)return;
    this.openingCoursePicker=true;
    if(wx.hideKeyboard)wx.hideKeyboard();
    const draftId=this.createId;
    wx.navigateTo({
      url:'/packages/competition/course-picker?selected='+encodeURIComponent(this.data.course?.id||''),
      events:{courseSelected:selection=>{
        if(!this.destroyed&&this.data.setup&&this.createId===draftId)
          this.chooseCourse({currentTarget:{dataset:{id:selection.id}}});
      }},
      fail:()=>{this.openingCoursePicker=false;wx.showToast({title:'球场页暂未打开，请重试',icon:'none'});}
    });
  },
  chooseCourse(event){
    const course=byId(S.courses,data(event).id);
    if(!course?.tees?.length||!Catalog.canScore(course))return;
    if(wx.hideKeyboard)wx.hideKeyboard();
    if(course.id===this.data.course?.id)return;
    const autoTitle=!this.data.title||this.data.title===this.data.course?.name+' · 球友赛';
    const sections=Catalog.sections(course).filter(s=>s.holes.length===9&&s.holes.every(h=>[3,4,5,6].includes(h.par)))
      .map(s=>({id:s.id,name:Catalog.sectionTitle(s.name)}));
    this.setData({course:{id:course.id,name:course.name,tees:course.tees,city:course.city||course.province,holes:course.holes||Catalog.sections(course).reduce((n,s)=>n+s.holes.length,0)},sections,first:0,
      secondOptions:[{id:'',name:'只打 9 洞'},...sections.slice(1)],second:sections.length>1?1:0,
      title:autoTitle?course.name+' · 球友赛':this.data.title});
  },
  firstSegment(event){
    const first=Number(value(event));
    this.setData({first,secondOptions:[{id:'',name:'只打 9 洞'},...this.data.sections.filter((_,i)=>i!==first)],second:0});
  },
  secondSegment(event){this.setData({second:Number(value(event))});},
  input(event){const field=data(event).field;this.setData({[field]:value(event),...(field==='scheduleTime'?{scheduleDirty:true}:{})});},
  create(){return this.task(async()=>{
    const {course,sections,first,secondOptions,second,title,date,localRules}=this.data;
    if(!course||!title.trim())throw Error('请填写名称并选择球场');
    const ids=[sections[first].id,secondOptions[second].id].filter(Boolean);
    const created=await Account.call('competitionCreate',{requestId:this.createId,courseId:course.id,segmentIds:ids,title,date,localRules});
    this.activityId=created.activityId;this.setData({setup:false});await this.refresh();
  });},
  pickGroup(event){return this.selectGroup({currentTarget:{dataset:{id:this.data.event.groups[Number(value(event))]?.id}}});},
  nextStep(){if(this.data.step==='review')return this.start();return this.switchStep({currentTarget:{dataset:{id:this.data.step==='groups'?'schedule':'review'}}});},
  previousStep(){return this.switchStep({currentTarget:{dataset:{id:this.data.step==='review'?'schedule':'groups'}}});},
  people(){this.setData({peopleOpen:!this.data.peopleOpen,entry:null});},
  addPlayerMenu(){
    wx.showActionSheet({itemList:['手动填写球员','从常用球友选择','邀请球员扫码加入','我也参赛'],success:res=>{
      if(res.tapIndex===2)return this.inviteCode({currentTarget:{dataset:{kind:'competition-player'}}});
      this.openEntry({currentTarget:{dataset:{type:['manual','friend',null,'self'][res.tapIndex]}}});
    }});
  },
  selectJoinSeat(event){this.setData({joinSeat:data(event).id});},
  lateEligible(event){this.setData({'entry.rankingEligible':!!value(event)});},
  scheduleNeedsSave(){return this.data.scheduleDirty||!this.data.group?.time||!this.data.group?.startHole;},
  async switchStep(event){if(this.data.step==='schedule'&&this.scheduleNeedsSave()){await this.saveSchedule();if(this.data.error)return;}this.setData({step:data(event).id,entry:null});this.scrollToSection();},
  scrollToSection(){if(wx.pageScrollTo)wx.pageScrollTo({selector:'#competition-workspace',duration:200});},
  resolveStartIssue(event){
    const issue=byId(this.data.event.issues||[],data(event).id);
    if(!issue)return;
    if(issue.groupId)this.selectGroup({currentTarget:{dataset:{id:issue.groupId}}});
    this.setData({step:issue.step,entry:null,error:''});this.scrollToSection();
  },
  editGroupSchedule(event){this.selectGroup(event);this.setData({step:'schedule'});this.scrollToSection();},
  async selectGroup(event){
    if(this.data.step==='schedule'&&this.scheduleNeedsSave()&&this.data.group?.id!==data(event).id){await this.saveSchedule();if(this.data.error)return;}
    const group=byId(this.data.event.groups,data(event).id);
    if(!group?.roster)return;
    this.setData({group,cards:(group.cards||[]).map(c=>({...c,statusLabel:cardLabels[c.state]})),reviewId:null,
      groupIndex:this.data.event.groups.findIndex(g=>g.id===group.id),entry:null,peopleOpen:false,scheduleTime:group.time||'08:00'});
    if(this.data.event.status==='draft')this.setGroupRoute(group.route,group.usesDefault!==false,group.startHole);
  },
  async change(action, fields={}){
    this.request=(this.request||0)+1;
    clearTimeout(this.poll);
    const event=await Account.call(action,{activityId:this.activityId,groupId:this.data.group?.id,...fields});
    this.showEvent(event);
    if(this.visible&&event.status==='active')this.poll=setTimeout(()=>this.refresh(),10000);
  },
  addGroup(){return this.task(async()=>{
    this.groupRequest ||= S.id();
    await this.change('competitionAddGroup',{groupId:this.groupRequest});
    this.selectGroup({currentTarget:{dataset:{id:this.groupRequest}}});
    this.groupRequest=null;
  });},
  async openEntry(event){
    const type=data(event).type;
    this.setData({entry:{type,tee:0,name:'',rankingEligible:false,playerId:'manual-'+S.id()},friends:[],friendBusy:type==='friend'});
    if(type!=='friend')return;
    try{
      const friends=await Account.friends();
      if(this.data.entry?.type==='friend')this.setData({friends});
    }catch(error){this.setData({error:error.message});}
    finally{this.setData({friendBusy:false});}
  },
  editEntry(event){this.setData({['entry.'+data(event).field]:data(event).field==='tee'?Number(value(event)):value(event)});},
  closeEntry(){this.setData({entry:null});},
  addMember(event){return this.task(async()=>{
    const e=this.data.entry;
    if(!e)return;
    const tee=this.data.group.route.tees[e.tee];
    const action={late:'competitionLatePlayer',manual:'competitionManual',friend:'competitionFriend',self:'competitionSelf'}[e.type];
    await this.change(action,{tee,name:e.name,playerId:e.playerId,rankingEligible:e.rankingEligible,uid:data(event).uid});
    this.closeEntry();
  });},
  setMemberTee(event){
    const index=Number(value(event))-1;if(index<0)return;
    return this.task(()=>this.change('competitionTee',{playerId:data(event).id,tee:this.data.group.route.tees[index]}));
  },
  changeScorer(event){return this.task(()=>this.change('competitionPrimaryScorer',{scorerId:this.data.group.scorerChoices[Number(value(event))]?.id}));},
  removeScorer(event){return this.task(()=>this.change('competitionRemoveScorer',{scorerId:data(event).id}));},
  selfScorer(){return this.task(async()=>{
    await this.change('competitionSelfScorer');
    wx.showToast({title:'已可为本组记分',icon:'success'});
  });},
  removeMember(event){
    const playerId=data(event).id;
    wx.showModal({title:'移除球员',content:'释放该组的一个球位。',success:r=>{
      if(r.confirm)this.task(()=>this.change('competitionRemove',{playerId}));
    }});
  },
  setGroupRoute(route,useDefault,startHole=1,dirty=false){
    const course=S.courses?.find(c=>c.id===route.courseId);
    if(!course)return;
    const sections=Catalog.sections(course).filter(s=>s.holes.length===9&&s.holes.every(h=>[3,4,5,6].includes(h.par)))
      .map(s=>({id:s.id,name:Catalog.sectionTitle(s.name)}));
    const ids=route.segmentIds||sections.slice(0,2).map(s=>s.id);
    const first=Math.max(0,sections.findIndex(s=>s.id===ids[0]));
    const options=[{id:'',name:'只打 9 洞'},...sections.filter((_,i)=>i!==first)];
    const holes=Catalog.selectedHoles(course,ids).holes.map(h=>({number:h.number,id:h.id,name:Catalog.courseHoleTitle(h)}));
    this.setData({routeCourse:{id:course.id,name:course.name},routeSections:sections,routeFirst:first,
      routeSecondOptions:options,routeSecond:Math.max(0,options.findIndex(s=>s.id===ids[1])),
      routeUseDefault:useDefault,scheduleDirty:dirty,scheduleHoles:holes,scheduleHole:Math.max(0,holes.findIndex(h=>h.number===startHole))});
  },
  groupFirstSegment(event){
    const first=Number(value(event)),{routeSections,routeSecondOptions,routeSecond,routeCourse}=this.data;
    const next=routeSecondOptions[routeSecond]?.id;
    this.setGroupRoute({courseId:routeCourse.id,segmentIds:[routeSections[first].id,next].filter((id,i,a)=>id&&a.indexOf(id)===i)},false,1,true);
  },
  groupSecondSegment(event){
    const {routeSections,routeFirst,routeSecondOptions,routeCourse}=this.data;
    this.setGroupRoute({courseId:routeCourse.id,segmentIds:[routeSections[routeFirst].id,routeSecondOptions[Number(value(event))].id].filter(Boolean)},false,1,true);
  },
  defaultGroupRoute(){this.setGroupRoute(this.data.event.defaultRoute,true,1,true);},
  openGroupCoursePicker(){
    if(this.openingCoursePicker||this.data.busy)return;
    this.openingCoursePicker=true;this.returningGroupPicker=true;
    const groupId=this.data.group.id,activityId=this.activityId;
    if(wx.hideKeyboard)wx.hideKeyboard();
    wx.navigateTo({url:'/packages/competition/course-picker?selected='+encodeURIComponent(this.data.routeCourse.id),
      events:{courseSelected:selection=>{
        if(this.destroyed||this.activityId!==activityId||this.data.group?.id!==groupId)return;
        if(selection.id===this.data.routeCourse.id)return;
        const course=S.courses.find(c=>c.id===selection.id);
        if(course)this.setGroupRoute({courseId:course.id,segmentIds:Catalog.sections(course).filter(s=>s.holes.length===9&&s.holes.every(h=>[3,4,5,6].includes(h.par))).slice(0,2).map(s=>s.id)},false,1,true);
      }},fail:()=>{this.openingCoursePicker=false;this.returningGroupPicker=false;wx.showToast({title:'球场页暂未打开，请重试',icon:'none'});}});
  },
  pickScheduleHole(event){this.setData({scheduleHole:Number(value(event)),scheduleDirty:true});},
  saveSchedule(){return this.task(async()=>{
    const d=this.data;
    await this.change('competitionSchedule',{time:d.scheduleTime,startHole:d.scheduleHoles[d.scheduleHole].number,
      useDefault:d.routeUseDefault,courseId:d.routeCourse.id,segmentIds:[d.routeSections[d.routeFirst].id,d.routeSecondOptions[d.routeSecond].id].filter(Boolean)});
    wx.showToast({title:'出发安排已保存',icon:'success'});
  });},
  autoArrange(){
    wx.showModal({title:'辅助安排出发时间',content:'保留无冲突的安排；未安排或冲突的小组，从 08:00 或已有时间起，按 10 分钟间隔错开。请按球场实际预约时间核对。',success:r=>{
      if(r.confirm)this.task(()=>this.change('competitionArrangeStarts',{startTime:'08:00',interval:10}));
    }});
  },
  async start(){
    if(this.data.busy)return;
    if(this.data.step==='schedule'&&this.scheduleNeedsSave()){await this.saveSchedule();if(this.data.error)return;}
    if(this.data.step!=='review'){this.setData({step:'review',entry:null});this.scrollToSection();return;}
    if(!this.data.event.ready){
      if(wx.pageScrollTo)wx.pageScrollTo({selector:'#competition-start-checks',duration:200});
      return wx.showToast({title:'请先处理标出的开赛事项',icon:'none'});
    }
    return this.task(async()=>{await this.change('competitionStart');this.setData({step:'cards'});this.scrollToSection();});
  },
  publish(){
    wx.showModal({title:'公布正式成绩',content:'公布后赛事记分卡锁定。',success:r=>{
      if(r.confirm)this.task(async()=>{await this.change('competitionPublish');this.setData({step:'rank'});});
    }});
  },
  board(){
    const group=this.data.group;
    if(group?.started)go('score','?activity='+encodeURIComponent(this.activityId)+'&group='+encodeURIComponent(group.id));
  },
  review(event){
    const id=data(event).id;
    this.setData({reviewId:this.data.reviewId===id?null:id});
  },
  confirmCard(event){
    const playerId=data(event).id,offline=!!data(event).offline;
    const {id:groupId,version}=this.data.group;
    wx.showModal({title:offline?'记录现场确认':'确认逐洞成绩',content:offline?'请先当面核对已列出的逐洞成绩，再记录无微信球友的确认。':'请确认以上逐洞成绩准确。球员和核分人均确认后交卡并锁定。',success:r=>{
      if(r.confirm)this.task(()=>this.change('competitionConfirm',{groupId,playerId,offline,version}));
    }});
  },
  resolveCard(event){
    const playerId=data(event).id,card=byId(this.data.cards.map(c=>({...c,id:c.playerId})),playerId);
    const choices=card?.state==='submitted'?resolutions.slice(0,1):resolutions;
    wx.showActionSheet({itemList:choices.map(x=>x.name),success:result=>{
      const chosen=choices[result.tapIndex];
      wx.showModal({title:chosen.name,editable:true,placeholderText:'填写处理原因',success:r=>{
        if(r.confirm)this.task(()=>this.change('competitionResolve',{playerId,state:chosen.id,reason:r.content}));
      }});
    }});
  },
  acceptFriend(event){
    const player=byId(this.data.group.roster,data(event).id);
    if(!player?.pending||!player.mine)return;
    this.setData({entry:{type:'accept',tee:Math.max(0,this.data.group.route.tees.indexOf(player.tee)),name:player.name}});
  },
  confirmFriend(){return this.task(async()=>{
    const {entry,event}=this.data;
    await this.change('competitionAcceptFriend',{tee:this.data.group.route.tees[entry.tee],name:entry.name});
    this.closeEntry();
  });},
  pickJoinTee(event){this.setData({joinTee:Number(value(event))});},
  join(){return this.task(async()=>{
    const {invitation,joinName,joinTee,joinSeat}=this.data;
    const result=await Account.call('join',{token:this.token,name:joinName,tee:invitation.tees[joinTee],seatId:joinSeat});
    this.activityId=result.activityId;this.requestedGroup=result.groupId;this.token=null;
    this.setData({invitation:null,hasToken:false});
    await this.refresh();
    if(result.active&&result.groupId)this.board();
  });},
  scan(){
    if(!wx.scanCode)return wx.showToast({title:'请在微信里扫码',icon:'none'});
    wx.scanCode({success:res=>{
      const token=(res.path||res.result||'').match(/(?:scene|token)=([a-f0-9]{24})(?:&|$)/)?.[1];
      if(!token)return this.setData({error:'请扫描青野小程序码'});
      this.token=token;this.activityId=null;this.setData({hasToken:true,event:null,setup:false,error:''});
      if(Account.needLogin())this.refresh();
    }});
  },
  inviteCode(event){
    const kind=data(event).kind;
    const request=this.codeRequest=(this.codeRequest||0)+1;
    this.setData({codeOpen:true,codeKind:kind,codeLabel:codeLabels[kind],codeBusy:true,code:'',invite:null,codeError:''});
    return this.loadCode(request,kind);
  },
  async loadCode(request,kind){
    try{
      const invite=this.data.invite||await Account.call('competitionInvite',{activityId:this.activityId,groupId:this.data.group?.id,kind});
      if(request!==this.codeRequest)return;
      this.setData({invite});
      const code=await Code.generate(invite.token);
      if(request===this.codeRequest)this.setData({code});
    }catch(error){if(request===this.codeRequest)this.setData({codeError:error.message,invite:error.code==='EXPIRED'?null:this.data.invite});}
    finally{if(request===this.codeRequest)this.setData({codeBusy:false});}
  },
  retryCode(){
    this.setData({codeBusy:true,codeError:'',code:''});
    return this.loadCode(++this.codeRequest,this.data.codeKind);
  },
  closeCode(){this.codeRequest=(this.codeRequest||0)+1;this.setData({codeOpen:false,invite:null,code:''});},
  codeNoop(){},
  codeError(){this.setData({code:'',codeError:'小程序码图片加载失败，请重试'});},
  previewCode(){if(this.data.code)wx.previewImage({urls:[this.data.code]});},
  revokeCode(){return this.task(async()=>{await Account.call('revoke',{token:this.data.invite.token});this.closeCode();});},
  onShareAppMessage(){
    const invite=this.data.invite;
    return invite?{title:this.data.event.title+' · '+this.data.codeLabel,path:'/pages/groups/index?token='+invite.token}
      :{title:'青野高尔夫 · 比赛记分',path:'/packages/competition/index'};
  }
});
