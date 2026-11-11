const crypto = require('node:crypto');
const Rules = require('./lib/rules');
const Catalog = require('./lib/catalog');
const {newRound} = require('./lib/service');
const {publicRound} = require('./live-round');
const {makeRoute,routeFor,routeKey,slotKey,arrangeStarts,timePattern} = require('./competition-routes');

const EVENTS = 'qy_activities';
const USERS = 'qy_users';
const INVITES = 'qy_invites';
const CAPACITY = Rules.GROUP_MAX_PLAYERS;
const INVITE_ROLES = ['competition-player','competition-watch','competition-scorer'];
const statusText = {draft:'筹备中',active:'比赛中',published:'已公布'};
const courses = new Map(require('./lib/competition-courses.json').map(course => [course.id,course]));

function fail(code, message) {
  throw Object.assign(Error(message), {code});
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0,max) : '';
}

function roundGroup(event, groupId) {
  const group = event.groups.find(g => g.id === groupId);
  if (!group) fail('NOT_FOUND','小组不存在');
  return group;
}

const players = group => group.roster.filter(p => !p.pending);
const editGroup = (group, uid) => group.memberUids.includes(uid) || group.scorerUids.includes(uid);
const related = (event, uid) => event.ownerUid === uid || event.viewerUids.includes(uid) ||
  event.groups.some(group => editGroup(group,uid) || group.roster.some(p => p.accountUid === uid));
const userGroup = (event, uid) => event.groups.find(group =>
  editGroup(group,uid) || group.roster.some(p => p.accountUid === uid));

function owner(event, uid) {
  if (event.ownerUid !== uid) fail('FORBIDDEN','只有赛事发起人可以操作');
}

function draft(event) {
  if (event.status !== 'draft') fail('CLOSED','赛事已开赛，名单及赛制已锁定');
}

function tee(event, value) {
  if (!event.tees.includes(value)) fail('INVALID','请选择本赛事允许的发球台');
  return value;
}

function seat(group, player) {
  if (group.roster.length >= CAPACITY) fail('FULL','每组最多 16 名球员');
  group.roster.push(player);
}

function remember(user, eventId) {
  user.activityIds = Array.from(new Set([...(user.activityIds || []),eventId])).slice(-50);
}

async function linkTeammates(tx, user, group) {
  for (const uid of group.memberUids.filter(id => id !== user.uid)) {
    const other = await tx.get(USERS,uid);
    if(!other)continue;
    user.friendUids=Array.from(new Set([...(user.friendUids||[]),uid]));
    other.friendUids=Array.from(new Set([...(other.friendUids||[]),user.uid]));
    await tx.set(USERS,uid,other);
  }
}

function scorerChoices(event,group) {
  const choices=[...players(group).filter(p=>p.accountUid).map(p=>({id:p.accountUid,name:p.name,kind:'本组球员'})),
    ...group.scorerUids.map(id=>({id,name:group.scorerNames?.[id]||'记分员',kind:'受邀记分员'})),
    {id:event.ownerUid,name:event.ownerName||'赛事发起人',kind:'赛事发起人'}];
  return choices.filter((p,i)=>p.id&&choices.findIndex(v=>v.id===p.id)===i);
}
function designatedScorer(event,group) {
  const choices=scorerChoices(event,group);
  return choices.find(p=>p.id===group.primaryScorerUid)||choices[0];
}

function markerFor(event, group, player) {
  const roster = players(group);
  const index = roster.findIndex(p => p.id === player.id);
  // Pair players in the same group; a single player needs an approved walking marker.
  if (roster.length === 1) {
    const selected=designatedScorer(event,group);
    const marker=selected?.id!==player.accountUid?selected:scorerChoices(event,group).find(p=>p.id!==player.accountUid);
    return marker?{uid:marker.id,name:marker.name}:null;
  }
  const marker = roster[(index+1)%roster.length];
  return {uid:marker.accountUid || null,playerId:marker.id,name:marker.name};
}

function gate(event) {
  const populated = event.groups.filter(g => players(g).length);
  const count = populated.reduce((n,g) => n + players(g).length,0);
  const issues=[], slots=new Set();
  const add=(id,label,step,group)=>issues.push({id,label,step,groupId:group?.id||null});
  if (!count) add('players','请至少添加一位参赛球员','groups');
  for (const group of event.groups) {
    if(group.roster.some(p=>p.pending))add('pending-'+group.id,group.name+'：请先确认或移除尚未接受邀请的球友','groups',group);
  }
  for (const group of populated) {
    const route=routeFor(event,group);
    if(players(group).some(p=>!route.tees.includes(p.tee)))add('tee-'+group.id,group.name+'：请确认更换球场后的发球台','groups',group);
    if(!timePattern.test(group.time)||!route.holes.some(h=>h.number===group.startHole))add('schedule-'+group.id,group.name+'：请安排出发时间和起始洞','schedule',group);
    else {
      const slot=slotKey(route,group.time,group.startHole);
      if(slots.has(slot))add('slot-'+group.id,group.name+'：同一球场、同一时刻同一起始洞只能安排一个小组','schedule',group);
      slots.add(slot);
    }
    if(!designatedScorer(event,group))
      add('scorer-'+group.id,group.name+'：请指定记分员，发起人也可代记','groups',group);
    if(players(group).some(p=>!markerFor(event,group,p)))
      add('marker-'+group.id,group.name+'：单人组需要一位经发起人认可、全程随组的核分人','groups',group);
  }
  return {count,ready:!issues.length,reason:issues[0]?.label||'',issues};
}

function leaderboard(event) {
  const rows = event.groups.flatMap(group => {
    if (!group.round) return [];
    return players(group).map(player => {
      const summary = Rules.rawSummary(group.round,player.id), card = group.cards[player.id];
      const state = player.rankingEligible===false ? '仅记分 · 不排名' : card.state === 'withdrawn' ? '已退赛' : card.state === 'disqualified' ? '取消资格' : card.state === 'incomplete' ? '未完赛' :
        card.state === 'submitted' ? '已交卡' : summary.complete ? '待核分' : '比赛中';
      const route=routeFor(event,group);
      return {id:player.id,name:player.name,groupName:group.name,tee:player.tee,state,
        routeKey:routeKey(route),courseName:route.courseName,routeName:route.routeName,
        holes:group.round.holes.length,played:summary.played,strokes:summary.total,
        total:summary.totalText,diff:summary.diff,diffText:summary.diffText,
        eligible:player.rankingEligible!==false && (event.status==='published' ? card.state==='submitted' && summary.complete :
          card.state==='open'||card.state==='submitted')};
    });
  });
  const final = event.status === 'published';
  const routeOrder=[...new Set(rows.map(row=>row.routeKey))];
  rows.sort((a,b) => routeOrder.indexOf(a.routeKey)-routeOrder.indexOf(b.routeKey) || Number(b.eligible&&b.played>0)-Number(a.eligible&&a.played>0) ||
    (final ? a.strokes-b.strokes : a.diff-b.diff) || b.played-a.played);
  let seen=0,previous=null,rank=0,previousRoute=null;
  return rows.map(({eligible,strokes,diff,...row}) => {
    if(row.routeKey!==previousRoute){seen=0;previous=null;rank=0;previousRoute=row.routeKey;}
    if (!eligible || !row.played) return {...row,rank:null};
    const key=final?strokes:diff;
    seen++;
    if(key!==previous)rank=seen;
    previous=key;
    return {...row,rank};
  });
}

function view(event, uid) {
  if (!related(event,uid)) fail('FORBIDDEN','请通过赛事邀请加入');
  const isOwner=event.ownerUid===uid, mine=userGroup(event,uid);
  const rows=leaderboard(event),buckets=new Map();
  for(const row of rows){
    if(!buckets.has(row.routeKey))buckets.set(row.routeKey,{id:row.routeKey,courseName:row.courseName,routeName:row.routeName,holes:row.holes,rows:[]});
    buckets.get(row.routeKey).rows.push(row);
  }
  return {
    id:event.id,title:event.title,courseId:event.courseId,courseName:event.courseName,
    date:event.date,status:event.status,statusText:statusText[event.status],isOwner,
    myGroupId:mine?.id||null,terms:event.terms,holes:event.holes,tees:event.tees,defaultRoute:routeFor(event),
    mixedRoutes:new Set(event.groups.filter(g=>players(g).length).map(g=>routeKey(routeFor(event,g)))).size>1,
    ...(isOwner?gate(event):{}),publishedAt:event.publishedAt||null,
    groups:event.groups.map(group => {
      const primary=designatedScorer(event,group),canEdit=editGroup(group,uid)||primary?.id===uid, canSee=isOwner||editGroup(group,uid)||group===mine,route=routeFor(event,group);
      return {id:group.id,name:group.name,count:players(group).length,capacity:CAPACITY,
        route,usesDefault:!group.route,time:group.time,startHole:group.startHole,canEdit,started:!!group.round,version:group.version,
        ...(canSee?{
          primaryScorer:{name:primary?.name||'待指定',kind:primary?.kind,mine:primary?.id===uid},
          ...(isOwner?{scorerChoices:scorerChoices(event,group),primaryScorerId:primary?.id}:{}),
          roster:group.roster.map(({id,name,tee,pending,accountUid,rankingEligible,late}) => ({id,name,tee,pending:!!pending,manual:!accountUid,mine:accountUid===uid,rankingEligible:rankingEligible!==false,late:!!late})),
          scorers:group.scorerUids.map(id=>({id:isOwner?id:undefined,name:group.scorerNames?.[id]||'记分员',mine:id===uid})),
          changes:(group.recentChanges||[]).slice().reverse().map(c=>({
            hole:route.holes.find(h=>h.number===c.hole)?.name, player:group.roster.find(p=>p.id===c.playerId)?.name,
            actor:group.roster.find(p=>p.accountUid===c.actor)?.name||group.scorerNames[c.actor]||'记分员',
            before:c.before,after:c.after
          })),
          cards:group.round?players(group).map(p=>{
            const card=group.cards[p.id], summary=Rules.rawSummary(group.round,p.id);
            return {playerId:p.id,name:p.name,state:card.state,played:summary.played,marker:card.marker.name,
              playerConfirmed:!!card.playerConfirmed,markerConfirmed:!!card.markerConfirmed,
              canConfirm:canEdit&&event.status==='active'&&card.state==='open'&&summary.complete&&
                (p.accountUid===uid||card.marker.uid===uid),
              canRecordOffline:canEdit&&event.status==='active'&&card.state==='open'&&summary.complete&&
                (!card.marker.uid||!p.accountUid&&(card.marker.uid===uid||group.scorerUids.includes(uid))),
              scores:group.round.holes.map(h=>({id:h.id,name:Catalog.courseHoleTitle(h),strokes:group.round.scores[p.id][h.number]?.grossStrokes??'—'})),
              reason:card.reason||''};
          }):[]
        }:{})};
    }), rows,leaderboards:[...buckets.values()]
  };
}

async function load(tx, id) {
  const event=await tx.get(EVENTS,id);
  if(event?.kind!=='competition')fail('NOT_FOUND','比赛不存在');
  if(!event.ownerName)event.ownerName=(await tx.get(USERS,event.ownerUid))?.name||'赛事发起人';
  return event;
}

async function list(repo, me, uid) {
  const items=await Promise.all((me.activityIds||[]).slice(-50).map(id=>repo.get(EVENTS,id)));
  return items.filter(event=>event?.kind==='competition'&&related(event,uid)).reverse().map(event=>{
    const group=userGroup(event,uid);
    return {id:event.id,title:event.title,courseName:event.courseName,date:event.date,status:event.status,
      updatedAt:event.updatedAt,statusText:statusText[event.status],groupCount:event.groups.filter(g=>players(g).length).length,
      pending:!!group?.roster.some(p=>p.accountUid===uid&&p.pending),
      myGroupId:group&&editGroup(group,uid)&&group.round?group.id:null,groupName:group?.name||''};
  });
}

function claimableSeats(event,group){
  return group.roster.filter(p=>!p.accountUid&&(event.status==='draft'||event.status==='active'&&group.cards?.[p.id]?.state==='open'))
    .map(p=>({id:p.id,name:p.name,tee:p.tee,played:group.round?Rules.rawSummary(group.round,p.id).played:0}));
}
async function invitation(repo, inv, uid) {
  const event=await load(repo,inv.activityId), group=roundGroup(event,inv.groupId);
  const joined=inv.kind==='competition-watch'?related(event,uid):inv.kind==='competition-player'?group.memberUids.includes(uid):editGroup(group,uid);
  const seats=claimableSeats(event,group);
  const canAdd=event.status==='draft'&&group.roster.length<CAPACITY;
  return {competition:true,kind:inv.kind,title:event.title,courseName:routeFor(event,group).courseName,routeName:routeFor(event,group).routeName,
    groupName:group.name,tees:routeFor(event,group).tees,joined,seats,canAdd,active:event.status==='active',
    closed:!joined&&(event.status==='published'&&inv.kind!=='competition-watch'||inv.kind==='competition-player'&&!canAdd&&!seats.length)};
}

async function join(tx, inv, user, input, now) {
  const event=await load(tx,inv.activityId), group=roundGroup(event,inv.groupId);
  if(inv.kind==='competition-watch') {
    if(!related(event,user.uid)){
      if(event.viewerUids.length>=80)fail('FULL','观看人数已达上限');
      event.viewerUids.push(user.uid);
    }
  } else if(inv.kind==='competition-scorer') {
    if(!editGroup(group,user.uid)){
      if(event.status==='published')fail('CLOSED','赛事已公布，不能新增记分员');
      if(event.status==='active'&&!group.round)fail('CLOSED','该组没有开赛');
      if(group.scorerUids.length>=4)fail('FULL','本组记分员人数已满');
      group.scorerUids.push(user.uid);
      group.scorerNames[user.uid]=user.name;
      group.version++;
    }
  } else if(inv.kind==='competition-player') {
    if(!group.memberUids.includes(user.uid)){
      if(event.status==='published')fail('CLOSED','赛事已公布');
      const assigned=event.groups.find(g=>g.roster.some(p=>p.accountUid===user.uid));
      if(assigned&&assigned!==group)fail('ALREADY_JOINED','你已在本赛事其他小组参赛');
      const reserved=group.roster.find(p=>p.accountUid===user.uid);
      const claim=input.seatId&&input.seatId!=='+'?group.roster.find(p=>p.id===input.seatId&&!p.accountUid):null;
      if(input.seatId&&input.seatId!=='+'&&!claim)fail('SEAT_TAKEN','该球位已被认领，请刷新选择');
      if(event.status==='active'&&(!claim||group.cards?.[claim.id]?.state!=='open'))fail('CLOSED','开赛后请认领已有球位；新增参赛者需由发起人添加');
      const name=claim?.name||clean(input.name,20);
      if(!name)fail('INVALID','请填写参赛姓名或昵称');
      const entry={id:claim?.id||reserved?.id||user.uid,accountUid:user.uid,name,
        tee:claim?.tee||tee(routeFor(event,group),input.tee)};
      if(claim||reserved)Object.assign(claim||reserved,entry,{pending:false});
      else seat(group,entry);
      if(group.round){
        const player=group.round.players.find(p=>p.id===entry.id);
        Object.assign(player,{accountUid:user.uid,avatarUrl:user.avatarUrl||'',name});
        delete player.isVirtual;delete player.isTest;
        for(const card of Object.values(group.cards))if(card.state==='open'&&card.marker?.playerId===entry.id){
          card.marker.uid=user.uid;card.marker.name=name;card.markerConfirmed=null;
        }
        group.cards[entry.id].playerConfirmed=null;
        group.round.revision++;group.round.updatedAt=now();group.version++;
        Rules.validateRound(group.round);
      }
      await linkTeammates(tx,user,group);
      group.memberUids.push(user.uid);
    }
  }
  remember(user,event.id);
  event.updatedAt=now();
  await tx.set(USERS,user.uid,user);
  await tx.set(EVENTS,event.id,event);
  return {competition:true,activityId:event.id,groupId:inv.kind==='competition-watch'?null:group.id,active:event.status==='active'};
}

function newGroup(id, index) {
  return {id,name:String.fromCharCode(65+index)+' 组',roster:[],memberUids:[],scorerUids:[],scorerNames:{},
    time:'',startHole:0,version:0,round:null};
}

function start(event, now) {
  const check=gate(event);
  if(!check.ready)fail('INVALID',check.reason);
  for(const group of event.groups.filter(g=>players(g).length)){
    const route=routeFor(event,group),course=courses.get(route.courseId);
    const scorer=designatedScorer(event,group);
    const assigned=[scorer,...players(group).map(p=>markerFor(event,group,p)).filter(p=>p?.uid).map(p=>({id:p.uid,name:p.name}))];
    for(const person of assigned)if(person&&!editGroup(group,person.id)){group.scorerUids.push(person.id);group.scorerNames[person.id]=person.name;}
    group.primaryScorerUid=scorer?.id;
    const round=newRound(course,players(group).map(({pending,...p})=>p),{
      id:event.id+'-'+group.id,date:event.date,time:group.time,now:now(),segmentIds:route.segmentIds,
      ruleSnapshot:{...Rules.defaultRules('stroke_play'),penaltyPolicy:{mode:'official',localRules:event.terms.localRules}}
    });
    const pivot=round.playOrder.indexOf(group.startHole);
    round.playOrder=[...round.playOrder.slice(pivot),...round.playOrder.slice(0,pivot)];
    round.holeOrder=round.playOrder;
    round.currentHole=round.playOrder[0];
    group.round=publicRound(round);
    group.live=true;
    group.locked=true;
    group.version++;
    group.cells={};
    group.cards=Object.fromEntries(players(group).map(p=>[p.id,{state:'open',marker:markerFor(event,group,p)}]));
  }
  event.status='active';
  event.startedAt=now();
}

function addLatePlayer(event, group, input, now){
  if(event.status!=='active'||!group.round)fail('CLOSED','请在已开赛的小组添加球员');
  const id=clean(input.playerId,60),name=clean(input.name,20);
  if(!name||!/^manual-[\w-]{1,50}$/.test(id)||typeof input.rankingEligible!=='boolean')fail('INVALID','请填写姓名，并确认是否参与排名');
  if(group.roster.some(p=>p.id===id))return;
  const route=routeFor(event,group),player={id,name,tee:tee(route,input.tee),rankingEligible:input.rankingEligible,late:true};
  seat(group,player);
  const template=newRound(courses.get(route.courseId),[player],{id:'late-template',segmentIds:route.segmentIds,
    ruleSnapshot:Rules.defaultRules('stroke_play'),now:now()});
  group.round.players.push(template.players[0]);group.round.scores[id]={};
  const scorer=designatedScorer(event,group);
  group.cards[id]={state:'open',marker:{uid:scorer.id,name:scorer.name}};
  // Ensure the default organizer can confirm a manual player's card after joining mid-round.
  if(!editGroup(group,scorer.id)){group.scorerUids.push(scorer.id);group.scorerNames[scorer.id]=scorer.name;}
  group.round.revision++;group.round.updatedAt=now();group.version++;
  Rules.validateRound(group.round);
}

async function dispatch(repo, uid, me, action, input, now, random) {
  if(action==='competitionList')return list(repo,me,uid);
  if(action==='competitionGet')return view(await load(repo,input.activityId),uid);
  return repo.transaction(async tx=>{
    if(action==='competitionCreate'){
      const title=clean(input.title,40), date=clean(input.date,10), course=courses.get(input.courseId);
      if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!course?.tees.length)fail('INVALID','请填写赛事名称、日期及有发球台数据的球场');
      const parsedDate=Date.parse(date+'T00:00:00Z');
      if(!Number.isFinite(parsedDate)||new Date(parsedDate).toISOString().slice(0,10)!==date)fail('INVALID','请选择有效的比赛日期');
      const selected=input.segmentIds;
      makeRoute(course.id,selected);
      const key=clean(input.requestId,60);
      if(!/^[\w-]{1,60}$/.test(key))fail('INVALID','请重新提交赛事');
      const id='comp-'+crypto.createHash('sha256').update(uid+':'+key).digest('hex').slice(0,24);
      const existing=await tx.get(EVENTS,id);
      if(existing)return {activityId:id};
      const {holes}=Catalog.selectedHoles(course,selected);
      const event={id,kind:'competition',status:'draft',title,date,courseId:course.id,courseName:course.name,
        ownerUid:uid,ownerName:me.name,tees:course.tees,holes:holes.map(h=>({number:h.number,id:h.id,name:Catalog.courseHoleTitle(h)})),
        terms:{segmentIds:selected,format:'个人比杆',basis:'总杆',tie:'同杆并列',localRules:clean(input.localRules,300).split('\n').map(s=>s.trim()).filter(Boolean)},
        groups:[newGroup('a',0),newGroup('b',1)],viewerUids:[],createdAt:now(),updatedAt:now()};
      const user=await tx.get(USERS,uid);remember(user,id);
      await tx.set(EVENTS,id,event);
      await tx.set(USERS,uid,user);
      return {activityId:id};
    }
    const event=await load(tx,input.activityId);
    if(action==='competitionAcceptFriend'){
      const g=roundGroup(event,input.groupId), p=g.roster.find(p=>p.accountUid===uid);
      if(!p)fail('FORBIDDEN','没有此小组的邀请');
      if(!p.pending)return view(event,uid);
      const name=clean(input.name,20)||p.name;
      await join(tx,{activityId:event.id,groupId:g.id,kind:'competition-player'},await tx.get(USERS,uid),{name,tee:input.tee},now);
      return view(await load(tx,event.id),uid);
    }
    if(action==='competitionConfirm'){
      const g=roundGroup(event,input.groupId);
      if(!editGroup(g,uid))fail('FORBIDDEN','只能确认本组记分卡');
      if(event.status!=='active')fail('CLOSED','赛事不在交卡阶段');
      const p=players(g).find(p=>p.id===input.playerId),card=p&&g.cards[p.id];
      if(card?.state==='submitted'&&(card.playerConfirmed?.uid===uid||card.markerConfirmed?.uid===uid))return view(event,uid);
      if(!card||card.state!=='open'||!Rules.rawSummary(g.round,p.id).complete)fail('INVALID','请先填完该球员的逐洞成绩');
      if(input.version!==g.version)fail('CONFLICT','本组成绩有更新，请刷新核对再确认');
      let allowed=false;
      if(input.offline===true){
        const scorer=g.scorerUids.includes(uid), marker=card.marker.uid===uid;
        if(!p.accountUid&&(scorer||marker||!card.marker.uid)){card.playerConfirmed={uid,at:now(),offline:true};allowed=true;}
        if(!card.marker.uid){card.markerConfirmed={uid,at:now(),offline:true};allowed=true;}
      } else {
        if(p.accountUid===uid){card.playerConfirmed={uid,at:now()};allowed=true;}
        if(card.marker.uid===uid){card.markerConfirmed={uid,at:now()};allowed=true;}
      }
      if(!allowed)fail('FORBIDDEN','需要球员或指定核分人确认');
      if(card.playerConfirmed&&card.markerConfirmed){card.state='submitted';card.submittedAt=now();}
      g.version++;
    } else {
      owner(event,uid);
      if(action==='competitionStart'){
        if(event.status==='draft')start(event,now);
      }else if(action==='competitionPublish'){
        if(event.status==='published')return view(event,uid);
        if(event.status!=='active')fail('INVALID','请先开始比赛');
        if(event.groups.some(g=>Object.entries(g.cards||{}).some(([id,c])=>c.state==='open'&&g.roster.find(p=>p.id===id)?.rankingEligible!==false)))fail('INVALID','还有球员未交卡，请核对或标记未完赛');
        for(const g of event.groups.filter(g=>g.round)){
          for(const p of g.roster.filter(p=>p.rankingEligible===false))if(g.cards[p.id]?.state==='open'){g.cards[p.id].state='incomplete';g.cards[p.id].reason='仅记分，不参与正式排名';}
          g.round.status=Object.values(g.cards).every(c=>c.state==='submitted')?'finished_complete':'finished_incomplete';
          g.round.completedAt=g.round.finishedAt=now();g.version++;
        }
        event.status='published';event.publishedAt=now();
      }else if(action==='competitionResolve'){
        const g=roundGroup(event,input.groupId), card=g.cards?.[input.playerId], reason=clean(input.reason,100);
        if(event.status!=='active'||!card||!reason)fail('INVALID','请填写处理原因');
        if(!['open','withdrawn','disqualified','incomplete'].includes(input.state))fail('INVALID','成绩状态无效');
        if(card.state==='submitted'&&input.state!=='open')fail('INVALID','请先将该记分卡退回核对');
        card.state=input.state;card.reason=reason;
        card.playerConfirmed=null;card.markerConfirmed=null;g.version++;
      }else if(action==='competitionLatePlayer'){
        addLatePlayer(event,roundGroup(event,input.groupId),input,now);
      }else if(action==='competitionPrimaryScorer'&&event.status==='active'){
        const g=roundGroup(event,input.groupId),selected=scorerChoices(event,g).find(p=>p.id===input.scorerId);
        if(!selected)fail('INVALID','请选择已确认的微信球员、记分员或发起人');
        g.primaryScorerUid=selected.id;
        if(!editGroup(g,selected.id)){g.scorerUids.push(selected.id);g.scorerNames[selected.id]=selected.name;}
        g.version++;
      }else if(action==='competitionInvite'){
        if(!INVITE_ROLES.includes(input.kind))fail('INVALID','邀请身份无效');
        if(input.kind!=='competition-watch'&&event.status==='published')fail('CLOSED','赛事已公布');
        const g=roundGroup(event,input.groupId||event.groups[0].id);
        if(event.status==='active'&&input.kind!=='competition-watch'&&!g.round)fail('CLOSED','该组没有开赛');
        const token=random(),expiresAt=now()+7*86400000;
        await tx.set(INVITES,token,{token,activityId:event.id,groupId:g.id,kind:input.kind,issuerUid:uid,expiresAt,revoked:false});
        return {token,expiresAt,kind:input.kind};
      }else {
        draft(event);
        if(action==='competitionArrangeStarts'){
          arrangeStarts(event,input);
        }else if(action==='competitionAddGroup'){
          const id=clean(input.groupId,30);
          if(!/^[\w-]{1,30}$/.test(id))fail('INVALID','小组编号无效');
          if(!event.groups.some(g=>g.id===id)){
            if(event.groups.length>=20)fail('FULL','一个赛事最多 20 组');
            event.groups.push(newGroup(id,event.groups.length));
          }
        }else {
          const g=roundGroup(event,input.groupId);
          if(action==='competitionSchedule'){
            let route=routeFor(event,g);
            if(input.useDefault===true)route=routeFor(event);
            else if(input.courseId||input.segmentIds)route=makeRoute(input.courseId,input.segmentIds);
            if(!timePattern.test(input.time)||!route.holes.some(h=>h.number===input.startHole))fail('INVALID','请选择出发时间和起始洞');
            if(input.useDefault===true)delete g.route;
            else if(input.courseId||input.segmentIds)g.route=route;
            for(const player of g.roster)if(!route.tees.includes(player.tee))player.tee='';
            g.time=input.time;g.startHole=input.startHole;
          }else if(action==='competitionPrimaryScorer'){
            if(!scorerChoices(event,g).some(p=>p.id===input.scorerId))fail('INVALID','请选择已确认的微信球员、受邀记分员或赛事发起人');
            g.primaryScorerUid=input.scorerId;
          }else if(action==='competitionManual'){
            const name=clean(input.name,20), id=clean(input.playerId,60);
            if(!name||!/^manual-[\w-]{1,50}$/.test(id))fail('INVALID','请填写球员姓名');
            if(!g.roster.some(p=>p.id===id))seat(g,{id,name,tee:tee(routeFor(event,g),input.tee)});
          }else if(action==='competitionFriend'){
            const friend=await tx.get(USERS,input.uid);
            if(!friend||!me.friendUids.includes(friend.uid))fail('FORBIDDEN','只能邀请已关联微信的球友');
            if(!g.roster.some(p=>p.accountUid===friend.uid)){
              if(userGroup(event,friend.uid))fail('ALREADY_JOINED','该球友已在本赛事其他小组');
              seat(g,{id:friend.uid,accountUid:friend.uid,name:friend.name,tee:tee(routeFor(event,g),input.tee),pending:true});
              remember(friend,event.id);
              await tx.set(USERS,friend.uid,friend);
            }
          }else if(action==='competitionSelf'){
            if(!g.memberUids.includes(uid)){
              if(userGroup(event,uid))fail('ALREADY_JOINED','请先退出本赛事的其他身份或小组');
              seat(g,{id:uid,accountUid:uid,name:me.name,tee:tee(routeFor(event,g),input.tee)});
              const user=await tx.get(USERS,uid);
              await linkTeammates(tx,user,g);
              await tx.set(USERS,uid,user);
              g.memberUids.push(uid);
            }
          }else if(action==='competitionSelfScorer'){
            if(!g.scorerUids.includes(uid)){
              // The organizer may explicitly take scoring duties for several groups.
              // This grants no player seat and does not change any card's marker.
              if(g.memberUids.includes(uid))fail('ALREADY_JOINED','你已是本组球员，可以直接为本组记分');
              if(g.scorerUids.length>=4)fail('FULL','本组记分员人数已满');
              g.scorerUids.push(uid);
              g.scorerNames[uid]=me.name;
            }
          }else if(action==='competitionRemoveScorer'){
            g.scorerUids=g.scorerUids.filter(id=>id!==input.scorerId);
            if(Object.prototype.hasOwnProperty.call(g.scorerNames,input.scorerId))delete g.scorerNames[input.scorerId];
          }else if(action==='competitionTee'){
            const p=g.roster.find(p=>p.id===input.playerId);
            if(!p)fail('NOT_FOUND','球员不存在');
            p.tee=tee(routeFor(event,g),input.tee);
          }else if(action==='competitionRemove'){
            const p=g.roster.find(p=>p.id===input.playerId);
            if(p){
              g.roster=g.roster.filter(row=>row.id!==p.id);
              g.memberUids=g.memberUids.filter(id=>id!==p.accountUid);
            }
          }else fail('INVALID','不支持此比赛操作');
        }
      }
    }
    event.updatedAt=now();
    await tx.set(EVENTS,event.id,event);
    return view(event,uid);
  });
}

module.exports={dispatch,invitation,join,INVITE_ROLES};
