const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../miniprogram/services/store'),V=require('../miniprogram/services/service'),R=require('../miniprogram/services/rules'),Route=require('../miniprogram/services/score-route'),View=require('../miniprogram/services/score-view'),Totals=require('../miniprogram/services/score-totals');
const course=S.courses.find(c=>c.id==='cn_bg_519'),ids=course.segments.map(s=>s.id);
function round(n=4){const r=V.newRound(course,Array.from({length:n},(_,i)=>({id:i?'p'+i:'me',name:'球友'+i,tee:i?'White':'Blue'})),{id:'route-test',now:1,date:'2026-11-07'});return Route.change(r,course,[ids[0],ids[2]],2);}
function score(r,p,n,strokes){return R.applyOperation(r,{type:'score',operationId:'edit-'+r.revision,baseRevision:r.revision,time:r.revision+3,playerId:p,holeNumber:n,score:{strokes}});}
test('route swap keeps physical hole scores, per-player tee distances and cursor together',()=>{
 let r=round();r=score(r,'me',2,6);r=score(r,'p1',11,7);r.currentHole=2;
 const d=r.players[0].holeDistances[2],s=r.scores.me[2],before=JSON.stringify(r);
 const next=Route.change(r,course,[ids[2],ids[0]]);
 assert.equal(JSON.stringify(r),before);assert.deepEqual(next.scores.me[11],s);assert.equal(next.scores.p1[2].grossStrokes,7);assert.equal(next.players[0].holeDistances[11],d);assert.equal(next.currentHole,11);assert.equal(next.holes[10].id,r.holes[1].id);assert.equal(next.changeLog.length,0);R.validateRound(next);
});
test('removed sections are parked outside totals and restored, including later corrections and clears',()=>{
 let r=round();r=score(r,'me',2,8);const total=Totals.summary(r,'me').diff;
 r=Route.change(r,course,[ids[1],ids[2]]);assert.equal(Totals.summary(r,'me').diff,0);assert.equal(Object.keys(r.scores.me).length,0);
 r=Route.change(r,course,[ids[0],ids[2]]);assert.equal(Totals.summary(r,'me').diff,total);r=score(r,'me',2,5);
 r=Route.change(r,course,[ids[1],ids[2]]);r=Route.change(r,course,[ids[0],ids[2]]);assert.equal(r.scores.me[2].grossStrokes,5);
 r=R.applyOperation(r,{type:'score',operationId:'clear',baseRevision:r.revision,time:50,playerId:'me',holeNumber:2,score:null});
 r=Route.change(r,course,[ids[1],ids[2]]);r=Route.change(r,course,[ids[0],ids[2]]);assert.equal(r.scores.me[2],undefined);
});
test('all sixteen rows show 18 physical labels, real per-tee distances, units and profile avatars',()=>{
 const r=round(16);r.players[1].accountUid='wx-friend';const t=View.table(r,p=>p.name,[{uid:'wx-friend',avatarUrl:'cloud://example/profile.png'}]);
 assert.equal(t.tablePlayers.length,16);assert.equal(t.tablePlayers[15].cells.length,18);assert.equal(t.tableHoles[9].shortLabel,'C1');assert.equal(t.tablePlayers[1].avatarUrl,'cloud://example/profile.png');
 assert.equal(t.tablePlayers[0].cells[0].distance,398);assert.equal(t.tablePlayers[0].cells[0].recorded,false);assert.equal(Object.keys(r.scores.me).length,0);
 r.distanceUnit='m';assert.equal(View.table(r,p=>p.name).tablePlayers[0].cells[0].distance,364);
 r.players[0].holeDistances[1]=null;assert.equal(View.table(r,p=>p.name).tablePlayers[0].cells[0].distance,'');
 assert.equal(Route.shortLabel({sectionName:'A Course',label:'1'}),'A1');assert.equal(Route.shortLabel({sectionName:'IN',label:'1'}),'10');assert.equal(Route.shortLabel({sectionName:'OLD COURSE',label:'18'}),'18');
});
test('invalid duplicate routes and removed award scopes leave original round untouched',()=>{
 const r=round(),before=JSON.stringify(r);assert.throws(()=>Route.change(r,course,[ids[0],ids[0]]),/不同/);assert.equal(JSON.stringify(r),before);
 r.ruleSnapshot.sideGames=[{id:'nearest-a',type:'nearest',holeNumbers:[2],unit:'yd'}];
 assert.throws(()=>Route.change(r,course,[ids[1],ids[2]]),/奖项/);assert.deepEqual(r.ruleSnapshot.sideGames[0].holeNumbers,[2]);
});
test('physical awards, events and manual allowances follow the same hole when order changes',()=>{
 let r=round();r.ruleSnapshot.scoring={type:'stroke_play',basis:'net'};r.ruleSnapshot.handicap={mode:'manual_hole',perHole:Object.fromEntries(r.players.map(p=>[p.id,Object.fromEntries(r.holes.map(h=>[h.number,h.number===2?1:0]))]))};
 r.ruleSnapshot.sideGames=[{id:'nearest',type:'nearest',holeNumbers:[2],unit:'yd'}];r.awards=[{sideGameId:'nearest',holeNumber:2,status:'none'}];
 r=Route.change(r,course,[ids[2],ids[0]]);assert.equal(r.ruleSnapshot.handicap.perHole.me[11],1);assert.deepEqual(r.ruleSnapshot.sideGames[0].holeNumbers,[11]);assert.equal(r.awards[0].holeNumber,11);R.validateRound(r);
 assert.throws(()=>Route.change(r,course,[ids[1],ids[0]]),/逐洞让杆/);
});
