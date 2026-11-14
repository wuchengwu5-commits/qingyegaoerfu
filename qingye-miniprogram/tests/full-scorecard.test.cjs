const {test}=require('node:test'),A=require('node:assert/strict');
const {round,op}=require('./helpers/closure.cjs'),Card=require('../miniprogram/services/full-scorecard');
test('one group is displayed as aligned player rows, with actual totals, not projected Par',()=>{
 let r=round(6,18);r.holes[1].par=5;r.players.forEach(p=>p.holePars[2]=5);for(const [index,values] of [[0,[4,4]],[1,[4,5]],[2,[4,6]],[3,[5,6]],[4,[5,4]],[5,[3,5]]])for(let i=0;i<values.length;i++)r=op(r,{type:'score',playerId:r.players[index].id,holeNumber:i+1,score:{strokes:values[i]}});
 const card=Card.build(r,'front','me');A.equal(card.cardHoles.length,9);A.equal(card.cardPlayers.length,6);A.deepEqual(card.cardPlayers.map(p=>p.totalText),['8','9','10','11','9','8']);A.ok(card.cardPlayers.every(p=>p.played===2&&p.cells.length===9&&p.cells[2].value==='—'));A.equal(card.cardPlayers[0].isMine,true);
 A.equal(card.cardPlayers[0].cells[1].kind,'birdie');A.equal(card.cardPlayers[2].cells[1].kind,'bogey');A.equal(Card.build(r,'back').cardHoles[0].number,10);
});
test('sixteen players, 9-hole rounds and empty totals render without invented scores',()=>{
 const r=round(16,9),c=Card.build(r,'back');A.equal(c.half,'front');A.equal(c.cardPlayers.length,16);A.equal(c.cardHoles.length,9);A.ok(c.cardPlayers.every(p=>p.played===0&&p.totalText==='—'&&p.diffText==='—'));
});
test('table halves follow actual C then A order, keep physical hole labels and support long section names',()=>{
 const r=round(2,18);r.holes.forEach((h,i)=>{h.sectionName=i<9?'A':'C';h.label=String(i%9+1);});r.playOrder=[...Array.from({length:9},(_,i)=>i+10),...Array.from({length:9},(_,i)=>i+1)];r.holeOrder=r.playOrder;
 const c=Card.build(r,'front');A.equal(c.cardHoles[0].cardLabel,'C1');A.equal(c.cardPlayers[0].cells[0].number,10);A.equal(Card.build(r,'back').cardHoles[0].cardLabel,'A1');
 r.holes[9].sectionName='OLD COURSE';r.holes[9].label='OLD1';const long=Card.build(r).cardHoles[0];A.equal(long.cardLabel,'1');A.equal(long.cardSection,'老场');
});
test('score marks distinguish eagle, birdie, Par, bogey and double; skipped/picked-up stay nonnumeric',()=>{
 let r=round(2,9);for(const [i,n] of [2,3,4,5,6].entries())r=op(r,{type:'score',playerId:'me',holeNumber:i+1,score:{strokes:n}});
 // Use a common Par only in this display fixture to exercise all five semantic marks.
 r.players[0].holePars=Object.fromEntries(r.holes.map(h=>[h.number,4]));
 r.scores.me[6]={completion:'picked_up'};r.scores.me[7]={completion:'skipped'};
 const c=Card.build(r).cardPlayers[0].cells;A.deepEqual(c.slice(0,5).map(x=>x.kind),['eagle','birdie','par','bogey','double']);A.equal(c[5].value,'捡');A.equal(c[6].value,'跳');A.equal(c[7].value,'—');
});
