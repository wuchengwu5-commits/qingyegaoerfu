const {test}=require('node:test'),A=require('node:assert/strict');
const {createService,uidFor}=require('../cloudfunctions/qingye/domain'),V=require('../miniprogram/services/service'),R=require('../miniprogram/services/rules'),S=require('../miniprogram/services/store');
function setup(){let db={},serial=0,time=1000,queue=Promise.resolve();const clone=x=>x==null?null:structuredClone(x);const access=o=>({get:async(c,id)=>clone(o[c+':'+id]),set:async(c,id,v)=>{o[c+':'+id]=clone(v);}});const repo={get:async(c,id)=>clone(db[c+':'+id]),transaction(fn){const next=queue.then(async()=>{const copy=clone(db),result=await fn(access(copy));db=copy;return result;});queue=next.catch(()=>{});return next;}};return {api:createService(repo,{now:()=>time,random:()=>String(++serial).padStart(24,'0'),verifyPhone:async()=>({number:'13800000000',countryCode:'86',verifiedAt:time})}).dispatch,advance(){time+=8*86400000;}};}
async function fixture(){const x=setup();for(const id of ['a','b','c','d','e','watch','outsider'])await x.api(id,'phoneLogin');const ctx=await x.api('a','create',{courseId:'cn_bg_585',courseName:'银涛'});return {...x,ctx};}
test('server identity never accepts a client supplied uid; a stranger cannot enumerate activity scores',async()=>{const {api,ctx}=await fixture();A.notEqual(uidFor('one','app'),uidFor('two','app'));A.equal((await api('a','profile',{uid:'b',name:'甲'})).uid,'a');await A.rejects(api('outsider','get',ctx),e=>e.code==='FORBIDDEN');await A.rejects(api('outsider','invite',{...ctx,kind:'watch'}),e=>e.code==='FORBIDDEN');});
test('the first sixteen distinct members can join, including concurrent scans for the final seat',async()=>{
 const {api,ctx}=await fixture(),inv=await api('a','invite',{...ctx,kind:'join'});
 const users=Array.from({length:16},(_,i)=>'player'+(i+1));
 for(const uid of users)await api(uid,'phoneLogin');
 const results=await Promise.allSettled(users.map(uid=>api(uid,'join',inv)));
 A.equal(results.filter(x=>x.status==='fulfilled').length,15);
 A.equal(results.find(x=>x.status==='rejected').reason.code,'FULL');
 await api(users[0],'join',inv);
 A.equal((await api('a','get',ctx)).groups[0].memberUids.length,16);
 A.equal((await api(users[0],'friends')).length,15);
});
test('a practice group stays independent and watch invitations grant read only',async()=>{
 const {api,ctx}=await fixture();
 await A.rejects(api('a','invite',{...ctx,kind:'group'}),{code:'INVALID'});
 const other=await api('b','create',{courseId:'cn_bg_585',courseName:'银涛'});
 A.notEqual(other.activityId,ctx.activityId);
 await A.rejects(api('b','get',ctx),{code:'FORBIDDEN'});
 await A.rejects(api('b','saveRound',{...ctx,expectedVersion:0,round:{}}),{code:'FORBIDDEN'});
 const view=await api('a','invite',{...ctx,kind:'watch'});
 await api('watch','join',{token:view.token});
 A.equal((await api('watch','get',ctx)).groups.some(g=>g.canScore),false);
 await A.rejects(api('watch','lock',ctx),{code:'FORBIDDEN'});
});
test('expired, revoked and locked invitations cannot add members',async()=>{const {api,ctx,advance}=await fixture();let inv=await api('a','invite',{...ctx,kind:'join'});await api('a','revoke',{token:inv.token});await A.rejects(api('b','join',{token:inv.token}),e=>e.code==='EXPIRED');inv=await api('a','invite',{...ctx,kind:'join'});advance();await A.rejects(api('b','join',{token:inv.token}),e=>e.code==='EXPIRED');inv=await api('a','invite',{...ctx,kind:'join'});await api('a','lock',ctx);await A.rejects(api('b','join',{token:inv.token}),e=>e.code==='STARTED');});
test('score versions reject stale devices and bind scores to real members; repeated saves preserve scores',async()=>{const {api,ctx}=await fixture(),course=S.courses.find(c=>c.id==='cn_bg_585');const r=V.newRound(course,[{id:'me',name:'伪造名字',tee:'Blue'}],{id:'round1',now:1000,date:'2026-10-27'});const first=await api('a','saveRound',{...ctx,expectedVersion:0,round:r});A.equal(first.version,1);await A.rejects(api('a','saveRound',{...ctx,expectedVersion:0,round:r}),e=>e.code==='CONFLICT');const next=R.applyOperation(r,{type:'score',playerId:'me',holeNumber:1,score:{strokes:5},operationId:'score-1',baseRevision:0,time:2000});A.equal((await api('a','saveRound',{...ctx,expectedVersion:1,round:next})).version,2);const saved=(await api('a','get',ctx)).groups[0];A.equal(saved.round.players[0].accountUid,'a');A.equal(saved.round.players[0].name,'高球爱好者');A.equal(saved.rows[0].total,'5');A.equal(saved.round.changeLog,undefined);const outsider=structuredClone(next);outsider.players[0].id='outsider';await A.rejects(api('a','saveRound',{...ctx,expectedVersion:2,round:outsider}),e=>e.code==='INVALID');});
test('manual handicap belongs only to the authenticated user and accepts zero and plus values',async()=>{const {api}=await fixture();await api('a','handicap',{uid:'b',setting:{mode:'manual',value:0}});A.equal((await api('a','login')).handicapSetting.value,0);A.equal((await api('b','login')).handicapSetting,undefined);await A.rejects(api('a','handicap',{setting:{mode:'manual',value:99}}),e=>e.code==='INVALID');});
test('a lost save response can be retried exactly once without a version conflict or private payload leakage',async()=>{
 const {api,ctx}=await fixture(),course=S.courses.find(c=>c.id==='cn_bg_585');
 const r=V.newRound(course,[{id:'me',name:'Test',tee:'Blue'}],{id:'retry',now:1,date:'2026-10-27'});r.gps={latitude:31,longitude:121};r.handicapInputs={me:{secret:true}};
 const request={...ctx,expectedVersion:0,round:r,mutationId:'device-unique-1'};
 A.equal((await api('a','saveRound',request)).version,1);A.equal((await api('a','saveRound',request)).version,1);
 const saved=(await api('a','get',ctx)).groups[0].round;A.equal(saved.gps,undefined);A.equal(saved.handicapInputs,undefined);
});
test('each registered member can submit only their own qualifying handicap metadata',async()=>{
 const {api,ctx}=await fixture(),inv=await api('a','invite',{...ctx,kind:'join'});await api('b','join',{token:inv.token});
 const r=V.newRound(S.courses.find(c=>c.id==='cn_bg_585'),[{id:'me',name:'A',tee:'Blue'},{id:'b',name:'B',tee:'White'}],{id:'finished',now:1,date:'2026-10-27'});
 for(const p of r.players)for(const h of r.holes)r.scores[p.id][h.number]=R.normalizeScore({strokes:h.par+1});r.status='finished_complete';
 await api('a','saveRound',{...ctx,expectedVersion:0,round:r});const values={confirmed:true,tee:'White',courseRating:70,slopeRating:113,adjustedGross:90,pcc:0};
 await api('b','rating',{roundId:r.id,values});A.equal((await api('b','login')).handicapInputs.finished.tee,'White');A.equal((await api('a','login')).handicapInputs,undefined);
 await A.rejects(api('watch','rating',{roundId:r.id,values}),e=>e.code==='FORBIDDEN');A.equal((await api('b','myRounds'))[0].playerId,'b');
});
