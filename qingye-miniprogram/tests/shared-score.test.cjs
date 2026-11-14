const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('../cloudfunctions/qingye/domain');
const Store=require('../miniprogram/services/store');
const Service=require('../miniprogram/services/service');
const Rules=require('../miniprogram/services/rules');
const course=Store.courses.find(c=>c.id==='cn_bg_585');
function makeRound(id='round1',others=[]){
  return Service.newRound(course,[{id:'me',name:'我',tee:'Blue'},...others],{id,now:100,date:'2026-11-05'});
}
async function setup(){
  let db={},counter=0,time=1000,serial=Promise.resolve();
  const adapter=data=>({get:async(c,id)=>structuredClone(data[c+':'+id]||null),set:async(c,id,v)=>{data[c+':'+id]=structuredClone(v);}});
  const repo={get:(c,id)=>adapter(db).get(c,id),transaction(fn){
    const job=serial.then(async()=>{const next=structuredClone(db),out=await fn(adapter(next));db=next;return structuredClone(out);});
    serial=job.catch(()=>{});return job;
  }};
  const api=createService(repo,{now:()=>time,verifyPhone:async()=>({number:'13800000000',countryCode:'86',verifiedAt:time}),random:()=>(++counter).toString(16).padStart(24,'0'),avatarRoot:'cloud://test/profiles/'}).dispatch;
  for(const uid of ['host','guest','third','fourth','fifth','watcher']){
    await api(uid,'phoneLogin');await api(uid,'profile',{name:uid});
  }
  return {api,advance:()=>time+=8*86400000};
}
async function open(api,r=makeRound()){
  const b=await api('host','enableBoard',{round:r}),ref={activityId:b.activityId,groupId:b.groupId};
  const {token}=await api('host','invite',{...ref,kind:'live'});return {b,ref,token};
}
function edit(api,uid,ref,playerId,hole,strokes,cellVersion=0,mutationId='edit-'+uid+'-'+hole){
  return api(uid,'scoreCell',{...ref,roundId:'round1',playerId,hole,score:strokes==null?null:{strokes},cellVersion,mutationId});
}
test('opening a local round twice creates one shared board and preserves the existing scores, seats and Tee',async()=>{
 const {api}=await setup();
 const r=makeRound('round1',[{id:'test-1',name:'测试1',tee:'White',isTest:true}]);
 r.scores['test-1'][1]=Rules.normalizeScore({strokes:6});r.players[1].privateNote='do not share';r.gps={latitude:31};
 const {b,ref,token}=await open(api,r),again=await api('host','enableBoard',{round:r});assert.equal(again.activityId,b.activityId);assert.equal((await api('host','list')).length,1);
 assert.equal(b.round.gps,undefined);assert.equal(b.round.players[1].privateNote,undefined);
 const invitation=await api('guest','invitation',{token});assert.equal(invitation.seats[0].played,1);
 await api('guest','join',{token,seatId:'test-1'});await api('guest','join',{token,seatId:'test-1'});
 const board=await api('guest','readBoard',ref);assert.equal(board.round.id,r.id);assert.equal(board.round.scores['test-1'][1].grossStrokes,6);assert.equal(board.round.players[1].tee,'White');assert.equal(board.round.players[1].accountUid,'guest');assert.equal(board.round.players[1].isTest,undefined);
 assert.deepEqual((await api('host','friends')).map(f=>f.uid),['guest']);assert.deepEqual((await api('guest','friends')).map(f=>f.uid),['host']);
});
test('independent cell edits survive concurrent writes, repeated delivery is idempotent, and a stale edit cannot overwrite the same cell',async()=>{
 const {api}=await setup(),{ref,token}=await open(api);await api('guest','join',{token,seatId:'+'});
 const [first]=await Promise.all([edit(api,'host',ref,'me',1,4),edit(api,'guest',ref,'guest',1,5)]);
 const again=await edit(api,'host',ref,'me',1,4);assert.equal(again.round.scores.guest[1].grossStrokes,5);
 const stamp=first.cells['me:1'].version;await edit(api,'guest',ref,'me',1,3,stamp,'revise');
 await assert.rejects(edit(api,'host',ref,'me',1,6,stamp,'stale'),{code:'CELL_CONFLICT'});
 const board=await api('host','readBoard',ref);assert.equal(board.round.scores.me[1].grossStrokes,3);assert.equal(board.round.scores.guest[1].grossStrokes,5);
 const unchanged=await api('guest','readBoard',{...ref,version:board.version,includeProfiles:true});assert.equal(unchanged.version,board.version);assert.equal(unchanged.round,undefined);assert.equal(unchanged.routeEditingSupported,true);assert.deepEqual(unchanged.profiles.map(p=>p.uid),['host','guest']);
 await edit(api,'host',ref,'me',1,null,board.cells['me:1'].version,'clear');assert.equal((await api('guest','readBoard',ref)).round.scores.me[1],undefined);
});
test('sixteen-player limit, seat races, read-only viewers, other groups, revoked/expired invitations and finished rounds',async()=>{
 const {api,advance}=await setup(),{ref,token}=await open(api,makeRound('round1',[{id:'slot',name:'球友',tee:'Blue'}]));
 const race=await Promise.allSettled(['guest','third'].map(uid=>api(uid,'join',{token,seatId:'slot'})));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.code,'SEAT_TAKEN');
 await api('fourth','join',{token,seatId:'+'});
 await edit(api,'host',ref,'me',1,4);
 const users=Array.from({length:15},(_,i)=>'late-'+i);
 for (const uid of users) await api(uid,'phoneLogin');
 const joins=await Promise.allSettled(users.map(uid=>api(uid,'join',{token,seatId:'+'})));
 assert.equal(joins.filter(r=>r.status==='fulfilled').length,13);
 assert.equal(joins.find(r=>r.status==='rejected').reason.code,'FULL');
 const last=users[joins.findIndex(r=>r.status==='fulfilled')];
 await api(last,'join',{token,seatId:'+'});
 const full=await edit(api,last,ref,last,2,5);
 assert.equal(full.round.players.length,16);
 assert.equal(full.round.scores.me[1].grossStrokes,4);
 assert.deepEqual(Object.keys(full.round.scores[last]),['2']);
 assert.equal((await api('fifth','invitation',{token})).seats.length,0);

 const view=await api('host','invite',{...ref,kind:'watch'});await api('watcher','join',{token:view.token});
 await assert.rejects(edit(api,'watcher',ref,'me',1,5),{code:'FORBIDDEN'});await assert.rejects(api('watcher','readBoard',ref),{code:'FORBIDDEN'});
 await api('fifth','create',{courseId:course.id,courseName:course.name});
 await assert.rejects(edit(api,'fifth',ref,'me',1,5),{code:'FORBIDDEN'});
 await api('host','revoke',{token});await assert.rejects(api('fifth','join',{token,seatId:'+'}),{code:'EXPIRED'});
 const next=await api('host','invite',{...ref,kind:'live'});advance();await assert.rejects(api('fifth','invitation',next),{code:'EXPIRED'});
 const b=await api('guest','readBoard',ref);b.round.status='finished_incomplete';b.round.revision++;
 await api('host','saveRound',{...ref,expectedVersion:b.version,round:b.round});
 await assert.rejects(edit(api,'guest',ref,'slot',2,4),{code:'CLOSED'});
});
test('a new round can enroll a previously confirmed friend directly, but cannot grant an unrelated account access',async()=>{
 const {api}=await setup(),first=await open(api);await api('guest','join',{token:first.token,seatId:'+'});
 const r=makeRound('next-round',[{id:'slot',name:'旧名',accountUid:'guest',tee:'Red'}]);
 const b=await api('host','enableBoard',{round:r}),ref={activityId:b.activityId,groupId:b.groupId};
 assert.equal((await api('guest','readBoard',ref)).round.players[1].name,'guest');
 assert.ok((await api('guest','list')).some(a=>a.id===b.activityId));assert.equal(b.round.players.length,2);
 r.id='forged-round';r.players[1].accountUid='fifth';await assert.rejects(api('host','enableBoard',{round:r}),{code:'FORBIDDEN'});
});
test('existing group rounds upgrade in place, old snapshots cannot overwrite a newer member edit',async()=>{
 const {api}=await setup(),ref=await api('host','create',{courseId:course.id,courseName:course.name});
 const inv=await api('host','invite',{...ref,kind:'join'});await api('guest','join',inv);
 const r=makeRound('round1',[{id:'guest',name:'guest',tee:'White'}]);await api('host','saveRound',{...ref,expectedVersion:0,round:r});
 const b=await api('host','enableBoard',{...ref,round:r});await edit(api,'guest',ref,'me',1,4);
 const late=await api('third','invitation',inv);assert.equal(late.kind,'live');
 assert.ok(late.seats.some(s=>s.id==='+'));
 await api('third','join',{token:inv.token,seatId:'+'});
 assert.equal((await api('third','readBoard',ref)).round.scores.me[1].grossStrokes,4);
 await assert.rejects(api('host','saveRound',{...ref,expectedVersion:b.version,round:b.round}),{code:'CONFLICT'});
});


test('shared route changes invalidate every old cell and preserve archived physical scores',async()=>{
 const Route=require('../miniprogram/services/score-route');
 const c=Store.courses.find(c=>c.id==='cn_bg_519'),ids=c.segments.map(s=>s.id);
 let r=Service.newRound(c,[{id:'me',name:'我',tee:'Blue'}],{id:'round1',now:100,date:'2026-11-07'});
 r=Route.change(r,c,[ids[0],ids[2]]);
 const {api}=await setup(),{ref,token}=await open(api,r);await api('guest','join',{token,seatId:'+'});
 const original=await api('guest','readBoard',ref);const changed=Route.change(original.round,c,[ids[2],ids[0]]);
 await api('host','saveRound',{...ref,expectedVersion:original.version,round:changed});
 await assert.rejects(edit(api,'guest',ref,'guest',1,5,0,'stale-route'),{code:'CELL_CONFLICT'});
 const current=await api('guest','readBoard',ref);assert(current.cells['guest:1'].version>0);assert.equal(current.round.holes[0].label,'C1');
 const out=await edit(api,'guest',ref,'guest',1,6,current.cells['guest:1'].version,'new-route');assert.equal(out.round.scores.guest[1].grossStrokes,6);
 const swapped=Route.change(out.round,c,[ids[0],ids[2]]);await api('host','saveRound',{...ref,expectedVersion:out.version,round:swapped});
 const after=await api('guest','readBoard',ref);assert.equal(after.round.scores.guest[10].grossStrokes,6);
 await assert.rejects(api('guest','scoreCell',{...ref,roundId:'round1',playerId:'guest',hole:1,score:{strokes:4},cellVersion:after.cells['guest:1'].version,routeRevision:0,mutationId:'stale-context'}),{code:'CELL_CONFLICT'});
});

test('shared scorecards expose only group member avatars, including updates without a score change',async()=>{
 const {api}=await setup(),{ref,token}=await open(api);
 await api('guest','profile',{name:'球友',avatarUrl:'cloud://test/profiles/guest/avatar-one.png'});
 await api('guest','join',{token,seatId:'+'});
 const b=await api('host','readBoard',ref);assert.equal(b.round.players.find(p=>p.accountUid==='guest').avatarUrl,'cloud://test/profiles/guest/avatar-one.png');
 await api('guest','profile',{name:'更新后的球友',avatarUrl:'cloud://test/profiles/guest/avatar-two.png'});
 const refreshed=await api('host','readBoard',{...ref,version:b.version,includeProfiles:true});assert.equal(refreshed.round,undefined);assert.equal(refreshed.profiles.find(p=>p.uid==='guest').avatarUrl,'cloud://test/profiles/guest/avatar-two.png');
 assert.equal(refreshed.profiles.find(p=>p.uid==='guest').name,'更新后的球友');assert.equal(refreshed.version,b.version);
 assert.equal((await api('host','readBoard',{...ref,version:b.version})).profiles,undefined);
 await assert.rejects(api('watcher','readBoard',{...ref,includeProfiles:true}),{code:'FORBIDDEN'});
});

test('non-playing scorers can edit a full group without occupying seats, rankings, friends or personal rounds',async()=>{
 const {api}=await setup(),r=makeRound('round1',Array.from({length:3},(_,i)=>({id:'v'+i,name:'球友'+i,tee:'Blue'}))),{ref}=await open(api,r);
 const invite=await api('host','invite',{...ref,kind:'scorer'}),info=await api('guest','invitation',invite);assert.equal(info.kind,'scorer');assert.equal(info.seats,undefined);
 const joined=await api('guest','join',invite);assert.equal(joined.live,true);await api('guest','join',invite);
 const group=(await api('guest','get',ref)).groups[0];assert.equal(group.round.players.length,4);assert.equal(group.rows.length,4);assert.deepEqual(group.scorerUids,['guest']);assert.equal(group.myRole,'scorer');assert.equal(group.canScore,true);assert.equal(group.members.length,1);
 assert.deepEqual(await api('guest','myRounds'),[]);assert.deepEqual(await api('guest','friends'),[]);
 const saved=await edit(api,'guest',ref,'v0',1,6);assert.equal(saved.round.scores.v0[1].strokes,6);
 await assert.rejects(api('guest','addVirtualPlayer',{...ref,playerId:'bad',name:'越权'}),e=>e.code==='FORBIDDEN');
 await assert.rejects(api('guest','saveRound',{...ref,expectedVersion:saved.version,round:saved.round}),e=>e.code==='FORBIDDEN');
 await assert.rejects(api('guest','invite',{...ref,kind:'scorer'}),e=>e.code==='FORBIDDEN');
 await api('host','removeScorer',{...ref,uid:'guest'});await assert.rejects(api('guest','readBoard',ref),e=>e.code==='FORBIDDEN');await assert.rejects(edit(api,'guest',ref,'v0',1,4),e=>e.code==='FORBIDDEN');
});
test('virtual players append atomically during scoring, retry safely and do not reset old scores',async()=>{
 const {api}=await setup(),{ref}=await open(api);
 await edit(api,'host',ref,'me',1,5);
 const request={...ref,playerId:'virtual-one',name:'临时球友'};const board=await api('host','addVirtualPlayer',request);
 assert.equal(board.round.players.length,2);assert.equal(board.round.scores.me[1].strokes,5);assert.deepEqual(board.round.scores['virtual-one'],{});assert.equal(board.round.players[1].accountUid,undefined);
 const repeated=await api('host','addVirtualPlayer',request);assert.equal(repeated.version,board.version);
 const result=await Promise.all([api('host','addVirtualPlayer',{...ref,playerId:'virtual-two',name:'另一位'}),edit(api,'host',ref,'virtual-one',2,4)]);
 const final=await api('host','readBoard',ref);assert.equal(final.round.players.length,3);assert.equal(final.round.scores['virtual-one'][2].strokes,4);
 for(let i=3;i<16;i++)await api('host','addVirtualPlayer',{...ref,playerId:'v-'+i,name:'球友'+i});
 await assert.rejects(api('host','addVirtualPlayer',{...ref,playerId:'overflow',name:'第17人'}),e=>e.code==='INVALID');
 const invite=await api('host','invite',{...ref,kind:'live'});await api('guest','join',{token:invite.token,seatId:'virtual-one'});
 const taken=await api('guest','readBoard',ref);assert.equal(taken.round.scores['virtual-one'][2].strokes,4);assert.equal(taken.round.players[1].isVirtual,undefined);
});
test('scorer invitations are distinct from read-only viewing, expire, and close with the round',async()=>{
 const {api,advance}=await setup(),{ref}=await open(api);
 const watch=await api('host','invite',{...ref,kind:'watch'});await api('watcher','join',{...watch,kind:'scorer'});await assert.rejects(edit(api,'watcher',ref,'me',1,4),e=>e.code==='FORBIDDEN');
 const invite=await api('host','invite',{...ref,kind:'scorer'});await api('host','revoke',invite);await assert.rejects(api('guest','join',invite),e=>e.code==='EXPIRED');
 const expired=await api('host','invite',{...ref,kind:'scorer'});advance();await assert.rejects(api('guest','join',expired),e=>e.code==='EXPIRED');
 const code=await api('host','invite',{...ref,kind:'scorer'}),b=await api('host','readBoard',ref);b.round.status='finished_incomplete';await api('host','saveRound',{...ref,expectedVersion:b.version,round:b.round});await assert.rejects(api('guest','join',code),e=>e.code==='CLOSED');
});
test('new practice groups stay separate and scorers can only access their assigned board',async()=>{
 const {api}=await setup(),{ref}=await open(api);
 await assert.rejects(api('host','createGroup',{activityId:ref.activityId,groupId:'group-two'}),{code:'INVALID'});
 const second=(await open(api,makeRound('round-two'))).ref;
 assert.notEqual(second.activityId,ref.activityId);
 const code=await api('host','invite',{...ref,kind:'scorer'});
 await api('guest','join',code);
 await assert.rejects(api('guest','readBoard',second),{code:'FORBIDDEN'});
 await assert.rejects(api('guest','createGroup',{activityId:ref.activityId,groupId:'bad'}),{code:'FORBIDDEN'});
 assert.equal((await api('host','get',ref)).groups.length,1);
});

test('default scorer can be changed only to a joined account, and only the owner ends a version-checked board',async()=>{
 const {api}=await setup(),{ref,token}=await open(api,makeRound('round1',[{id:'manual',name:'手动',tee:'Blue'}]));
 await api('guest','join',{token,seatId:'+'});
 let board=await api('host','readBoard',ref);assert.equal(board.primaryScorerUid,'host');
 await assert.rejects(api('host','primaryScorer',{...ref,scorerId:'manual'}),{code:'INVALID'});
 await assert.rejects(api('guest','primaryScorer',{...ref,scorerId:'guest'}),{code:'FORBIDDEN'});
 board=await api('host','primaryScorer',{...ref,scorerId:'guest'});assert.equal(board.primaryScorerUid,'guest');
 await edit(api,'guest',ref,'me',1,5);
 await assert.rejects(api('guest','finishBoard',{...ref,version:board.version}),{code:'FORBIDDEN'});
 await assert.rejects(api('host','finishBoard',{...ref,version:board.version}),{code:'CONFLICT'});
 board=await api('host','readBoard',ref);const finished=await api('host','finishBoard',{...ref,version:board.version});
 assert.equal(finished.round.status,'finished_incomplete');assert.equal(finished.round.scores.me[1].grossStrokes,5);
 await assert.rejects(edit(api,'guest',ref,'me',2,4),{code:'CLOSED'});
});

test('an owner can explicitly end an accidental empty group; other groups, scores and invitation permissions stay isolated',async()=>{
 const {api}=await setup(),{ref,token}=await open(api),other=await open(api,makeRound('keep-playing'));
 await api('guest','join',{token,seatId:'+'});
 const hostList=await api('host','list'),guestList=await api('guest','list');
 assert.ok(hostList.every(a=>a.groups.every(g=>g.canFinish)));
 assert.equal(guestList[0].groups[0].canFinish,false);
 const b=await api('host','readBoard',ref);
 await assert.rejects(api('guest','finishBoard',{...ref,version:b.version,allowEmpty:true}),{code:'FORBIDDEN'});
 const finished=await api('host','finishBoard',{...ref,version:b.version,allowEmpty:true});
 assert.equal(finished.round.status,'cancelled');assert.deepEqual(finished.round.scores.me,{});
 assert.equal((await api('host','finishBoard',{...ref,version:b.version,allowEmpty:true})).version,finished.version);
 assert.equal((await api('host','readBoard',other.ref)).round.status,'active');
 await assert.rejects(api('third','join',{token,seatId:'+'}),{code:'CLOSED'});
});
