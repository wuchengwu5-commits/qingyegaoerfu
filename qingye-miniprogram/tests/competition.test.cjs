const {test} = require('node:test');
const A = require('node:assert/strict');
const {createService} = require('../cloudfunctions/qingye/domain');
const Catalog = require('../miniprogram/services/catalog');
const course = require('../miniprogram/services/courses-data').courses.find(c=>c.id==='cn_bg_2525');

async function fixture() {
  let serial=0, sequence=Promise.resolve(), records={};
  const adapter = storage => ({
    async get(collection,id){return structuredClone(storage[collection+':'+id]);},
    async set(collection,id,value){storage[collection+':'+id]=structuredClone(value);}
  });
  const repo={
    get:(...args)=>adapter(records).get(...args),
    transaction(fn){
      const job=sequence.then(async()=>{
        const next=structuredClone(records), out=await fn(adapter(next));
        records=next;return out;
      });
      sequence=job.catch(()=>{});
      return job;
    }
  };
  const api=createService(repo,{now:()=>1000000,verifyPhone:async()=>({number:'13800000000',countryCode:'86',verifiedAt:1000000}),random:()=>String(++serial).padStart(24,'0')}).dispatch;
  for(const user of ['host','a1','a2','b1','b2','b3','c1','spectator','marker','stranger'])await api(user,'phoneLogin');
  const terms={requestId:'first',title:'周六球友赛',courseId:course.id,date:'2026-11-08',
    segmentIds:[Catalog.sections(course)[0].id],localRules:'球场当地规则'};
  const created=await api('host','competitionCreate',terms);
  A.deepEqual(await api('host','competitionCreate',terms),created);
  const activityId=created.activityId,tee=course.tees[0];
  const ctx=groupId=>({activityId,groupId});
  const invite=(groupId,role)=>api('host','competitionInvite',{...ctx(groupId),kind:'competition-'+role});
  const member=(groupId,uid,inv)=>api(uid,'join',{token:inv.token,name:uid,tee});
  const manual=(groupId,id)=>api('host','competitionManual',{...ctx(groupId),playerId:'manual-'+id,name:id,tee});
  const schedule=(groupId,startHole)=>api('host','competitionSchedule',{...ctx(groupId),time:'08:10',startHole});
  const get=uid=>api(uid,'competitionGet',{activityId});
  return {api,activityId,ctx,invite,member,manual,schedule,get,tee,records:()=>records};
}

test('event setup accepts small events, preserves independent groups, and three distinct invitation roles',async()=>{
  const f=await fixture(),{api,activityId,ctx,invite,member,manual,schedule,get,tee}=f;
  const a=await invite('a','player'),b=await invite('b','player'),watch=await invite('a','watch');
  await A.rejects(get('stranger'),{code:'FORBIDDEN'});
  await api('spectator','join',{token:watch.token});
  A.equal((await get('spectator')).groups[0].roster,undefined);
  A.equal((await api('a1','invitation',{token:a.token})).competition,true);
  await member('a','a1',a);
  await A.rejects(member('b','a1',b),{code:'ALREADY_JOINED'});
  await member('a','a2',a);
  A.deepEqual((await api('a2','friends')).map(p=>p.uid),['a1']);
  await manual('a','walk-in');await manual('a','second');
  A.equal((await get('host')).groups[0].capacity,16);
  await schedule('a',1);await schedule('b',2);
  A.equal((await get('host')).ready,true); // a populated group is sufficient; empty groups do not block
  // Establish an existing confirmed WeChat friend through the legacy same-group flow.
  const old=await api('host','create',{courseId:course.id,courseName:course.name});
  const oldCode=await api('host','invite',{...old,kind:'join'});
  await api('b1','join',{token:oldCode.token});
  const pending=await api('host','competitionFriend',{...ctx('b'),uid:'b1',tee});
  A.equal(pending.count,4);
  A.equal((await api('b1','competitionList')).find(item=>item.id===activityId).pending,true);
  await api('b1','competitionAcceptFriend',{...ctx('b'),name:'B 球员',tee});
  A.equal((await get('host')).ready,true); // the organizer is the default external marker for a single WeChat player
  const marker=await invite('b','scorer');
  await api('marker','join',{token:marker.token});
  await schedule('b',1);
  await A.rejects(api('host','competitionStart',{activityId}),/同一起始洞/);
  await schedule('b',2);
  const started=await api('host','competitionStart',{activityId});
  A.equal(started.status,'active');
  A.equal(started.rows.length,5);
  A.equal(started.groups[1].startHole,2);
  A.equal((await api('b1','readBoard',ctx('b'))).round.currentHole,2);
  await A.rejects(member('b','b2',b),{code:'CLOSED'});
  await A.rejects(api('host','createGroup',{...ctx('a'),groupId:'bypass'}),{code:'FORBIDDEN'});
  await A.rejects(api('host','saveRound',{...ctx('a'),round:{}}),{code:'FORBIDDEN'});
});

test('same-group editing, frozen submission, audit history, and final ranking are enforced on the server',async()=>{
  const f=await fixture(),{api,activityId,ctx,invite,member,manual,schedule,get}=f;
  const a=await invite('a','player'), b=await invite('b','player'), watch=await invite('a','watch');
  await member('a','a1',a);await member('a','a2',a);await manual('a','visitor');
  await member('b','b1',b);await member('b','b2',b);
  await api('spectator','join',{token:watch.token});
  await schedule('a',1);await schedule('b',2);
  await api('host','competitionStart',{activityId});
  const board=await api('a1','readBoard',ctx('a'));
  A.equal(board.round.players.length,3);
  A.equal((await api('host','readBoard',ctx('a'))).readOnly,true);
  await A.rejects(api('a1','readBoard',ctx('b')),{code:'FORBIDDEN'});
  await A.rejects(api('spectator','readBoard',ctx('a')),{code:'FORBIDDEN'});
  let mutation=0;
  async function score(actor,group,playerId,hole,strokes,cellVersion=0){
    return api(actor,'scoreCell',{...ctx(group),roundId:activityId+'-'+group,playerId,hole,cellVersion,
      score:{grossStrokes:strokes,completion:'holed_out'},mutationId:'m'+(++mutation)});
  }
  await A.rejects(score('a1','b','b1',1,4),{code:'FORBIDDEN'});
  await A.rejects(score('host','a','a1',1,4),{code:'FORBIDDEN'});
  const first=await score('a2','a','a1',1,4);
  await score('a1','a','a1',1,5,first.cells['a1:1'].version);
  A.equal(Object.values(f.records()).filter(x=>x.kind==='score-audit').length,1);
  A.equal((await get('a1')).groups[0].changes[0].actor,'a1');
  A.equal((await get('spectator')).groups[0].changes,undefined);
  for(let hole=2;hole<=9;hole++)await score('a2','a','a1',hole,4);
  for(let hole=1;hole<=9;hole++)await score('b2','b','b1',hole,hole===1?5:4);
  async function confirm(actor,group,playerId){
    const current=(await get(actor)).groups.find(g=>g.id===group);
    return api(actor,'competitionConfirm',{...ctx(group),playerId,version:current.version});
  }
  await A.rejects(confirm('a1','b','b1'),{code:'FORBIDDEN'});
  await confirm('a1','a','a1');await confirm('a2','a','a1');
  await confirm('a2','a','a1');
  const locked=await api('a1','readBoard',ctx('a'));
  A.deepEqual(locked.lockedPlayers,['a1']);
  await A.rejects(score('a2','a','a1',1,4,locked.cells['a1:1'].version),{code:'CLOSED'});
  await confirm('b1','b','b1');await confirm('b2','b','b1');
  await A.rejects(api('host','competitionPublish',{activityId}),{code:'INVALID'});
  for(let hole=1;hole<=9;hole++)await score('a1','a','manual-visitor',hole,5);
  const group=(await get('a1')).groups[0];
  await A.rejects(api('a2','competitionConfirm',{...ctx('a'),playerId:'manual-visitor',version:group.version,offline:true}),{code:'FORBIDDEN'});
  await api('a1','competitionConfirm',{...ctx('a'),playerId:'manual-visitor',version:group.version,offline:true});
  await confirm('a1','a','manual-visitor');
  for(const [groupId,playerId] of [['a','a2'],['b','b2']]){
    await api('host','competitionResolve',{...ctx(groupId),playerId,state:'incomplete',reason:'未完成全部球洞'});
  }
  const final=await api('host','competitionPublish',{activityId});
  A.equal(final.status,'published');
  A.deepEqual(final.rows.filter(p=>p.rank).map(p=>[p.id,p.rank,p.total]),[['a1',1,'37'],['b1',1,'37'],['manual-visitor',3,'45']]);
  A.equal(final.rows.filter(p=>p.state==='未完赛').length,2);
});

test('organizer can explicitly score several manual groups, start once, and save independent scores',async()=>{
  const f=await fixture(),{api,activityId,ctx,manual,schedule,get}=f;
  for(const [group,id] of [['a','one'],['a','two'],['a','three'],['b','four'],['b','five']])await manual(group,id);
  const initial=await get('host');
  A.equal(initial.ready,false);
  A.deepEqual(initial.issues.filter(i=>i.id.startsWith('schedule-')).map(i=>[i.groupId,i.step]),[['a','schedule'],['b','schedule']]);
  A.deepEqual(initial.issues.filter(i=>i.id.startsWith('scorer-')),[]);
  A.ok(initial.groups.every(g=>g.primaryScorer.mine&&g.primaryScorerId==='host'));
  A.ok(initial.groups.every(g=>g.scorerChoices.every(p=>!p.id.startsWith('manual-'))));
  await A.rejects(api('stranger','competitionSelfScorer',ctx('a')),{code:'FORBIDDEN'});
  await api('host','competitionSelfScorer',ctx('a'));
  await api('host','competitionSelfScorer',ctx('b'));
  await api('host','competitionSelfScorer',ctx('b'));
  await schedule('a',1);await schedule('b',2);
  const ready=await get('host');
  A.equal(ready.ready,true);A.deepEqual(ready.issues,[]);
  A.deepEqual(ready.groups.map(g=>[g.count,g.scorers.length,g.canEdit]),[[3,1,true],[2,1,true]]);
  await api('host','competitionStart',{activityId});
  const first=await api('host','readBoard',ctx('a'));
  A.equal(first.readOnly,false);
  await api('host','scoreCell',{...ctx('a'),roundId:first.round.id,playerId:'manual-one',hole:1,
    score:{grossStrokes:5,completion:'holed_out'},cellVersion:0,mutationId:'first-score'});
  await api('host','competitionStart',{activityId});
  const a=await api('host','readBoard',ctx('a')),b=await api('host','readBoard',ctx('b'));
  A.equal(a.round.scores['manual-one'][1].grossStrokes,5);
  A.equal(b.round.scores['manual-four'][1],undefined);
  A.equal(a.round.players.some(p=>p.accountUid==='host'),false);
  A.equal((await get('host')).rows.find(p=>p.id==='manual-one').played,1);
  await A.rejects(api('stranger','scoreCell',{...ctx('b'),roundId:b.round.id}),{code:'FORBIDDEN'});
});

test('competition page resolves start prerequisites and opens a writable scorecard after start',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),f=await fixture();
  const {api,activityId,manual,ctx}=f;
  for(const [group,id] of [['a','one'],['a','two'],['a','three'],['b','four'],['b','five']])await manual(group,id);
  let page,navigation;
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/packages/competition/index.js'),'utf8'),{
    Page:p=>page=p,setTimeout:()=>0,clearTimeout(){},wx:{showToast(){}},
    require(name){
      if(name.endsWith('/account'))return {user:()=>({uid:'host'}),needLogin:()=>true,call:(action,input)=>api('host',action,input)};
      if(name.endsWith('/catalog'))return Catalog;
      if(name.endsWith('/invite-code'))return {};
      if(name.endsWith('/ui'))return {S:{courses:require('../miniprogram/services/courses-data').courses},go:(...args)=>navigation=args};
      throw Error(name);
    }
  });
  page.data=structuredClone(page.data);page.setData=function(patch){Object.assign(this.data,patch);};
  page.activityId=activityId;page.visible=true;
  await page.refresh();
  page.resolveStartIssue({currentTarget:{dataset:{id:'schedule-b'}}});
  A.equal(page.data.step,'schedule');A.equal(page.data.group.id,'b');
  const playerId=page.data.group.roster[0].id;
  await page.setMemberTee({currentTarget:{dataset:{id:playerId}},detail:{value:2}});
  A.equal(page.data.group.roster[0].tee,page.data.group.route.tees[1]);
  A.equal(page.data.group.roster[0].teeIndex,2);
  page.data.scheduleHole=1;await page.saveSchedule();
  page.resolveStartIssue({currentTarget:{dataset:{id:'schedule-a'}}});await page.saveSchedule();
  A.equal(page.data.event.ready,true);
  page.input({currentTarget:{dataset:{field:'scheduleTime'}},detail:{value:'08:30'}});
  page.groupSecondSegment({detail:{value:1}});
  A.equal(page.data.scheduleDirty,true);
  await page.start();A.equal(page.data.step,'review');await page.start();
  A.equal(page.data.error,'');A.equal(page.data.event.status,'active');A.equal(page.data.step,'cards');
  A.equal(page.data.group.canContinue,true);A.equal(page.data.busy,false);
  page.board();A.deepEqual(navigation,['score','?activity='+activityId+'&group=a']);
  A.equal((await api('host','readBoard',ctx('a'))).readOnly,false);
  A.equal(page.data.group.time,'08:30');A.equal(page.data.group.route.holes.length,18);
});

test('accepting the displayed default departure saves it before moving to review',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),f=await fixture();
  await f.manual('a','default-player');
  let page;
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/packages/competition/index.js'),'utf8'),{
    Page:p=>page=p,setTimeout:()=>0,clearTimeout(){},wx:{showToast(){}},
    require(name){
      if(name.endsWith('/account'))return {user:()=>({uid:'host'}),needLogin:()=>true,call:(action,input)=>f.api('host',action,input)};
      if(name.endsWith('/catalog'))return Catalog;
      if(name.endsWith('/invite-code'))return {};
      if(name.endsWith('/ui'))return {S:{courses:require('../miniprogram/services/courses-data').courses},go(){}};
      throw Error(name);
    }
  });
  page.data=structuredClone(page.data);page.setData=function(patch){Object.assign(this.data,patch);};
  page.activityId=f.activityId;page.visible=true;
  await page.refresh();await page.nextStep();
  A.equal(page.data.step,'schedule');A.equal(page.data.scheduleDirty,false);
  A.equal(page.data.scheduleTime,'08:00');A.ok(!page.data.group.time);
  await page.nextStep();A.equal(page.data.step,'review');A.equal(page.data.error,'');
  const saved=await f.get('host');A.equal(saved.groups[0].time,'08:00');A.equal(saved.groups[0].startHole,1);A.equal(saved.ready,true);
});

test('each group inherits the default route, may select a different course, and opens its own scorecard',async()=>{
  const f=await fixture(),{api,activityId,ctx,manual,schedule,get}=f;
  for(const [g,p] of [['a','1'],['a','2'],['a','3'],['b','4'],['b','5']])await manual(g,p);
  const before=await get('host');A.ok(before.groups.every(g=>g.usesDefault));
  const other=require('../miniprogram/services/courses-data').courses.find(c=>c.id==='cn_bg_577');
  const segmentIds=Catalog.sections(other).slice(0,2).map(s=>s.id);
  const args={...ctx('b'),courseId:other.id,segmentIds,time:'08:10',startHole:1};
  await A.rejects(api('a1','competitionSchedule',args),{code:'FORBIDDEN'});
  let changed=await api('host','competitionSchedule',args);
  A.equal(changed.groups[0].route.courseId,course.id);A.equal(changed.groups[1].route.courseId,other.id);
  A.equal(changed.groups[1].usesDefault,false);A.equal(changed.groups[1].route.holes.length,18);
  for(const p of changed.groups[1].roster)await api('host','competitionTee',{...ctx('b'),playerId:p.id,tee:other.tees[0]});
  await schedule('a',1);A.equal((await get('host')).ready,true); // simultaneous start at different courses
  await api('host','competitionStart',{activityId});
  const a=await api('host','readBoard',ctx('a')),b=await api('host','readBoard',ctx('b'));
  A.equal(a.round.holes.length,9);A.equal(b.round.holes.length,18);A.equal(b.round.courseId,other.id);
  A.equal(a.readOnly,false);A.equal(b.readOnly,false); // all-manual groups default to organizer
  await A.rejects(api('a1','scoreCell',{...ctx('b'),roundId:b.round.id}),{code:'FORBIDDEN'});
  await A.rejects(api('host','competitionSchedule',args),{code:'CLOSED'});
  const view=await get('host');A.equal(view.leaderboards.length,2);A.equal(view.mixedRoutes,true);
  for(const [groupId,playerId] of [['a','manual-1'],['b','manual-4']]){
    const board=await api('host','readBoard',ctx(groupId));
    for(const hole of board.round.holes)await api('host','scoreCell',{...ctx(groupId),roundId:board.round.id,playerId,hole:hole.number,
      score:{grossStrokes:4,completion:'holed_out'},cellVersion:0,mutationId:groupId+'-'+hole.number});
    const group=(await get('host')).groups.find(g=>g.id===groupId);
    await api('host','competitionConfirm',{...ctx(groupId),playerId,version:group.version,offline:true});
    for(const player of group.roster.filter(p=>p.id!==playerId))await api('host','competitionResolve',{...ctx(groupId),playerId:player.id,state:'incomplete',reason:'未完成'});
  }
  const final=await api('host','competitionPublish',{activityId});
  A.deepEqual(final.rows.filter(r=>r.rank).map(r=>[r.rank,r.total]),[[1,'36'],[1,'72']]);
});

test('physical start holes detect collisions across reversed routes; automatic scheduling preserves valid arrangements',async()=>{
  const f=await fixture(),{api,activityId,ctx,manual,get}=f;
  for(const [g,p] of [['a','1'],['a','2'],['a','3'],['b','4'],['b','5']])await manual(g,p);
  const segments=Catalog.sections(course).map(s=>s.id);
  await api('host','competitionSchedule',{...ctx('a'),courseId:course.id,segmentIds:segments,time:'08:00',startHole:1});
  await api('host','competitionSchedule',{...ctx('b'),courseId:course.id,segmentIds:[...segments].reverse(),time:'08:00',startHole:10});
  A.ok((await get('host')).issues.some(i=>i.id==='slot-b'));
  await api('host','competitionAddGroup',{...ctx('empty')});
  await A.rejects(api('a1','competitionArrangeStarts',{activityId}),{code:'FORBIDDEN'});
  const arranged=await api('host','competitionArrangeStarts',{activityId,interval:10});
  A.equal(arranged.groups[0].time,'08:00');A.equal(arranged.groups[1].time,'08:10');
  A.equal(arranged.groups[1].startHole,10);A.equal(arranged.groups[2].time,'');A.equal(arranged.ready,true);
  await api('host','competitionStart',{activityId});
  for(const [g,p,n] of [['a','manual-1',1],['b','manual-4',10]]){
    const board=await api('host','readBoard',ctx(g));
    await api('host','scoreCell',{...ctx(g),roundId:board.round.id,playerId:p,hole:n,score:{grossStrokes:4,completion:'holed_out'},cellVersion:0,mutationId:g+'-route'});
  }
  const current=await get('host');A.equal(current.leaderboards.length,1);
  A.deepEqual(current.rows.filter(r=>r.played).map(r=>r.rank),[1,1]);
});

test('default scorer is a confirmed WeChat player or organizer; manual and pending players cannot be selected',async()=>{
  const f=await fixture(),{api,ctx,invite,member,manual,get}=f;
  await manual('a','offline');
  A.equal((await get('host')).groups[0].primaryScorerId,'host');
  const inv=await invite('a','player');await member('a','a1',inv);await member('a','a2',inv);
  let group=(await get('host')).groups[0];A.equal(group.primaryScorerId,'a1');
  A.ok(!group.scorerChoices.some(p=>p.id==='manual-offline'));
  await A.rejects(api('host','competitionPrimaryScorer',{...ctx('a'),scorerId:'manual-offline'}),{code:'INVALID'});
  await A.rejects(api('a1','competitionPrimaryScorer',{...ctx('a'),scorerId:'a2'}),{code:'FORBIDDEN'});
  await api('host','competitionPrimaryScorer',{...ctx('a'),scorerId:'a2'});
  A.equal((await get('host')).groups[0].primaryScorerId,'a2');
  await api('host','competitionRemove',{...ctx('a'),playerId:'a2'});
  A.equal((await get('host')).groups[0].primaryScorerId,'a1');
  const old=await api('host','create',{courseId:course.id,courseName:course.name});
  const oldCode=await api('host','invite',{...old,kind:'join'});
  await api('a2','join',{token:oldCode.token});
  await api('host','competitionFriend',{...ctx('b'),uid:'a2',tee:f.tee});
  const pending=(await get('host')).groups[1];
  A.equal(pending.primaryScorerId,'host');A.ok(!pending.scorerChoices.some(p=>p.id==='a2'));
});

test('one manual player can start; a second independent event does not change the first',async()=>{
 const {api,activityId,manual,schedule,get,tee}=await fixture();
 await manual('a','solo');await schedule('a',1);
 A.equal((await get('host')).ready,true);
 await api('host','competitionStart',{activityId});
 const second=await api('host','competitionCreate',{requestId:'second',title:'另一场',courseId:course.id,date:'2026-11-10',segmentIds:[Catalog.sections(course)[0].id]});
 A.notEqual(second.activityId,activityId);A.equal((await get('host')).status,'active');
 A.equal((await api('host','competitionGet',second)).count,0);
});

test('sixteen participants fit in each competition group and a seventeenth is rejected atomically',async()=>{
 const {manual,get,api,activityId,schedule}=await fixture();
 for(let n=0;n<16;n++)await manual('a','player'+n);
 await A.rejects(manual('a','overflow'),{code:'FULL'});
 await manual('b','second-group');await schedule('a',1);await schedule('b',2);
 const event=await api('host','competitionStart',{activityId});
 A.deepEqual(event.groups.map(g=>g.count),[16,1]);A.equal(event.rows.length,17);
 A.equal((await get('host')).groups[0].roster.length,16);
});

test('active manual seat claim preserves scores, Tee and card identity; competing claims cannot duplicate a golfer',async()=>{
 const f=await fixture(),{api,activityId,ctx,manual,schedule,invite,get}=f;
 await manual('a','first');await manual('a','second');await schedule('a',1);
 await api('host','competitionStart',{activityId});
 const board=await api('host','readBoard',ctx('a'));
 await api('host','scoreCell',{...ctx('a'),roundId:board.round.id,playerId:'manual-first',hole:1,score:{strokes:5},cellVersion:0,mutationId:'initial-score'});
 const inv=await invite('a','player'),preview=await api('a1','invitation',inv);
 A.equal(preview.active,true);A.equal(preview.canAdd,false);A.equal(preview.seats[0].played,1);
 await A.rejects(api('a1','join',{token:inv.token,seatId:'+',name:'new',tee:f.tee}),{code:'CLOSED'});
 const results=await Promise.allSettled(['a1','a2'].map(uid=>api(uid,'join',{token:inv.token,seatId:'manual-first',tee:'fake',name:'should not rename'})));
 A.equal(results.filter(r=>r.status==='fulfilled').length,1);A.equal(results.find(r=>r.status==='rejected').reason.code,'SEAT_TAKEN');
 const uid=results[0].status==='fulfilled'?'a1':'a2',now=await api(uid,'readBoard',ctx('a'));
 A.equal(now.round.players.length,2);A.equal(now.round.scores['manual-first'][1].grossStrokes,5);
 A.equal(now.round.players[0].name,'first');A.equal(now.round.players[0].tee,f.tee);A.equal(now.round.players[0].accountUid,uid);
 await api(uid,'scoreCell',{...ctx('a'),roundId:now.round.id,playerId:'manual-second',hole:2,score:{strokes:4},cellVersion:0,mutationId:'claim-edit'});
 A.equal((await get('host')).groups[0].cards[1].marker,'first');
});

test('a scorer can join after start without a playing seat; late players require owner and explicit ranking choice',async()=>{
 const f=await fixture(),{api,activityId,ctx,manual,schedule,invite,get,tee}=f;
 await manual('a','first');await schedule('a',1);await api('host','competitionStart',{activityId});
 const scorer=await invite('a','scorer');A.equal((await api('marker','invitation',scorer)).closed,false);
 await api('marker','join',scorer);let board=await api('marker','readBoard',ctx('a'));
 A.equal(board.round.players.length,1);
 await api('marker','scoreCell',{...ctx('a'),roundId:board.round.id,playerId:'manual-first',hole:1,score:{strokes:5},cellVersion:0,mutationId:'marker-score'});
 const fields={...ctx('a'),playerId:'manual-late',name:'迟到',tee,rankingEligible:false};
 await A.rejects(api('marker','competitionLatePlayer',fields),{code:'FORBIDDEN'});
 await A.rejects(api('host','competitionLatePlayer',{...fields,rankingEligible:undefined}),{code:'INVALID'});
 await api('host','competitionLatePlayer',fields);await api('host','competitionLatePlayer',fields);
 board=await api('host','readBoard',ctx('a'));A.equal(board.round.players.length,2);A.deepEqual(board.round.scores['manual-late'],{});A.equal(board.round.scores['manual-first'][1].grossStrokes,5);
 await api('marker','scoreCell',{...ctx('a'),roundId:board.round.id,playerId:'manual-late',hole:3,score:{strokes:3},cellVersion:0,mutationId:'late-score'});
 const event=await get('host');A.equal(event.rows.find(r=>r.id==='manual-late').rank,null);A.match(event.rows.find(r=>r.id==='manual-late').state,/不排名/);
 await api('host','competitionResolve',{...ctx('a'),playerId:'manual-first',state:'incomplete',reason:'提前结束'});
 await api('host','competitionPublish',{activityId});
 await A.rejects(api('host','competitionInvite',{...ctx('a'),kind:'competition-scorer'}),{code:'CLOSED'});
 await A.rejects(api('stranger','join',scorer),{code:'CLOSED'});
});
