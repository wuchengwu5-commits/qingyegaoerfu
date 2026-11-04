const {test}=require('node:test');
const assert=require('node:assert/strict');
const totals=require('../dist/score-totals.js');
const R=require('../dist/rules.js');
function round(size=18){return {holes:Array.from({length:size},(_,i)=>({number:i+1,par:[4,3,5][i%3]})),players:[{id:'me'},{id:'friend'}],scores:{me:{},friend:{}}};}
function score(r,n,delta=0,pid='me'){r.scores[pid][n]={completion:'holed_out',grossStrokes:R.par(r,pid,n)+delta};}
test('72杆整轮，前九36杆打40杆，显示76且实际累计仍为40',()=>{
  const r=round();for(let n=1;n<=9;n++)score(r,n,n<=4?1:0);
  const before=JSON.stringify(r),s=totals.summary(r,'me');
  assert.equal(s.roundPar,72);assert.equal(s.total,40);assert.equal(s.diff,4);assert.equal(s.liveTotal,76);assert.equal(s.complete,false);
  assert.equal(JSON.stringify(r),before);assert.equal(Object.keys(r.scores.me).length,9);
  assert.equal(totals.summary(r,'friend').liveTotal,72);
});
test('开局从实际所选洞数的Par起算，空洞仍无记录',()=>{
  for(const [size,par] of [[9,36],[18,72]]){const r=round(size),s=totals.summary(r,'me');assert.equal(s.liveTotal,par);assert.equal(s.played,0);assert.equal(s.totalText,'—');assert.deepEqual(r.scores.me,{});}
});
test('不同Par球洞按杆差累加，回洞改分、清空和恢复不会重复计算',()=>{
  const r=round();score(r,1,1);assert.equal(totals.summary(r,'me').liveTotal,73);
  score(r,2,0);assert.equal(totals.summary(r,'me').liveTotal,73);
  score(r,3,-1);assert.equal(totals.summary(r,'me').liveTotal,72);
  score(r,1,-2);assert.equal(totals.summary(r,'me').liveTotal,69);
  const saved=r.scores.me[1];delete r.scores.me[1];assert.equal(totals.summary(r,'me').liveTotal,71);
  r.scores.me[1]=saved;assert.equal(totals.summary(r,'me').liveTotal,69);
});
test('全部完洞后总杆与实际累计一致；末洞10杆可正常计算',()=>{
  const r=round();for(let n=1;n<=18;n++)score(r,n,n%2?1:-1);
  r.scores.me[18].grossStrokes=10;const s=totals.summary(r,'me');
  assert.equal(s.liveTotal,s.total);assert.equal(s.liveTotal,78);assert.equal(s.complete,true);
});
test('捡球跳洞和认可完成不伪造实际杆差，仍是未完洞状态',()=>{
  const r=round();score(r,1,1);
  r.scores.me[2]={completion:'picked_up',grossStrokes:null};
  r.scores.me[3]={completion:'skipped',grossStrokes:null};
  r.scores.me[4]={completion:'conceded_next_stroke',grossStrokes:6};
  const s=totals.summary(r,'me');assert.equal(s.liveTotal,73);assert.equal(s.played,1);assert.equal(s.complete,false);
});
test('按球友自己的Par快照起算，修订Par时重新计算',()=>{
  const r=round(9);r.players[0].holePars={1:5};score(r,1,1);
  assert.equal(totals.summary(r,'me').roundPar,37);assert.equal(totals.summary(r,'me').liveTotal,38);
  r.players[0].holePars[2]=4;assert.equal(totals.summary(r,'me').liveTotal,39);
  r.players[0].holePars[1]=4;assert.equal(totals.summary(r,'me').liveTotal,39);
});
