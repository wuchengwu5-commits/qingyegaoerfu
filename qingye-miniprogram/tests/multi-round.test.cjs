const Dialog = require('../miniprogram/services/dialog');
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const S=require('../miniprogram/services/store'),R=require('../miniprogram/services/rules'),Roster=require('../miniprogram/services/score-roster'),Patch=require('../miniprogram/services/view-patch');
let memory,routes,toasts;
beforeEach(()=>{require('../miniprogram/services/score-entry').consume();memory={};routes=[];toasts=[];Dialog.modal=o=>o.success({confirm:true,content:'新球友'});global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),navigateTo:o=>routes.push(o.url),switchTab:o=>routes.push(o.url),showToast:o=>toasts.push(o.title)};S.init();});
function create(){return S.create({courseId:'cn_bg_585',players:[{id:'me',name:'我',tee:'Blue'}]});}
function page(name,o={}){let def;global.Page=x=>def=x;const f=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[f];require(f);const p={...def,data:structuredClone(def.data||{}),setData(x){Patch.apply(this.data,x)}};p.onLoad?.(o);p.onShow?.();return p;}
test('multiple active groups, course start and history resume never pause or overwrite another group',()=>{
 const one=create(),two=create();S.saveScore(one.id,'me',1,{strokes:5});S.saveScore(two.id,'me',1,{strokes:7});
 const hub=page('play');
 assert.deepEqual(hub.data.activeRounds.map(({id,label,players})=>({id,label,players})),[
  {id:two.id,label:'第 1 组',players:1},
  {id:one.id,label:'第 2 组',players:1}
 ]);
 for(const group of hub.data.activeRounds){
  hub.continueRound({currentTarget:{dataset:{id:group.id}}});
  assert.equal(hub.data.scoreTargets[0].options.id,group.id);
 }
 const course=page('course',{id:'cn_bg_585'});course.start();assert.equal(routes.pop(),'/pages/play/index');assert.deepEqual(require('../miniprogram/services/score-entry').consume(),{kind:'create',course:'cn_bg_585'});
 const paused=S.getRound(one.id);paused.status='paused';S.replace(paused);page('history').resume(one.id);
 assert.equal(S.getRound(two.id).status,'active');assert.equal(S.getRound(one.id).scores.me[1].strokes,5);assert.equal(S.getRound(two.id).scores.me[1].strokes,7);
 S.finish(one.id);
 hub.onShow();
 assert.deepEqual(hub.data.activeRounds.map(r=>r.id),[two.id]);
 assert.ok(hub.data.recent.some(r=>r.id===one.id));
});
test('score page can repeatedly append virtual players through sixteen without losing scores or old undo restoring the roster',()=>{
 const r=create();S.saveScore(r.id,'me',1,{strokes:5});const p=page('score',{id:r.id});
 for(let i=1;i<16;i++)p.addVirtual();
 const final=S.getRound(r.id);assert.equal(final.players.length,16);assert.equal(final.scores.me[1].strokes,5);assert.equal(final.players[3].isVirtual,true);assert.deepEqual(final.scores[final.players[3].id],{});
 p.addVirtual();assert.equal(S.getRound(r.id).players.length,16);assert.match(toasts.at(-1),/16/);assert.equal(final.changeLog.length,0);
 p.hole({currentTarget:{dataset:{pid:final.players[3].id,number:2}}});p.step({currentTarget:{dataset:{delta:1}}});assert.equal(S.getRound(r.id).scores[final.players[3].id][2].strokes,p.data.h.par+1);
});
test('fixed-size match play rejects roster changes and late players get explicit zero handicap',()=>{
 const r=create();const match=Roster.append(r,{id:'other',name:'对手'});match.ruleSnapshot=R.defaultRules('match_play');assert.throws(()=>Roster.append(match,{id:'third',name:'第三人'}),/固定/);
 r.ruleSnapshot.scoring={type:'stroke_play',basis:'net'};r.ruleSnapshot.handicap={mode:'manual_hole',perHole:{me:Object.fromEntries(r.holes.map(h=>[h.number,1]))}};
 const next=Roster.append(r,{id:'late',name:'迟到球友'});assert.equal(Object.values(next.ruleSnapshot.handicap.perHole.late).every(n=>n===0),true);assert.equal(next.players[1].tee,'Blue');
});

test('existing six-player scorecards remain readable and editable after the sixteen-player limit',()=>{
 const course=S.courses.find(c=>c.id==='cn_bg_585');
 const players=Array.from({length:6},(_,i)=>({id:i?'old-'+i:'me',name:'球友'+i,tee:'Blue'}));
 const round=require('../miniprogram/services/service').newRound(course,players,{id:'legacy',now:1000,date:'2026-11-08'});
 S.mutate(data=>data.rounds.push(round));
 const old=S.getRound(round.id);
 assert.equal(old.players.length,6);
 S.saveScore(old.id,'old-5',1,{strokes:5});
 assert.equal(S.getRound(old.id).scores['old-5'][1].grossStrokes,5);
 assert.equal(S.create({courseId:course.id,players}).players.length,6);
 assert.throws(()=>S.create({courseId:course.id,players:Array.from({length:17},(_,i)=>({...players[0],id:'p-'+i}))}),/最多 16 名/);
});
