const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict');
const {round,op}=require('./helpers/closure.cjs'),View=require('../miniprogram/services/score-view');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),Patch=require('../miniprogram/services/view-patch'),Score=require('../miniprogram/services/score-page');
const label=p=>p.name,cell=(view,id,key)=>view.tablePlayers.find(p=>p.id===id).cells.find(c=>c.key===key);
function record(r,id,n,strokes){return op(r,{type:'score',playerId:id,holeNumber:n,score:{strokes}});}
let user,pages;
beforeEach(()=>{let memory={};pages=[];global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast(){},getWindowInfo:()=>({windowWidth:375})};S.init();user=Account.user;Account.user=()=>null;});
afterEach(()=>{pages.forEach(p=>p.onUnload());Account.user=user;});
function page(r){S.mutate(d=>d.rounds.unshift(r));const p={...Score,data:structuredClone(Score.data),setData(v){Patch.apply(this.data,v);}};pages.push(p);p.onLoad({id:r.id});p.refresh();return p;}
test('relative holes use each player’s Par; subtotals and final actual strokes agree',()=>{
 let r=round(2,18);r.players[0].holePars[1]=4;r.players[0].holePars[2]=5;r.players[0].holePars[10]=3;r.players[1].holePars[1]=5;
 for(const [id,n,v] of [['me',1,5],['me',2,4],['me',10,3],['manual-1',1,5]])r=record(r,id,n,v);
 const before=JSON.stringify(r),view=View.liveTable(r,label);
 A.deepEqual([1,2,10].map(n=>cell(view,'me','hole-'+n).value),['+1','-1','0']);A.equal(cell(view,'manual-1','hole-1').value,'0');
 A.equal(view.tablePlayers[0].relativeTotal,'0');A.deepEqual(['half-0','half-1','total'].map(k=>cell(view,'me',k).value),['0','0','12']);
 A.equal(cell(view,'me','half-0').detail,'9 杆');A.equal(cell(view,'me','half-1').detail,'3 杆');A.equal(cell(view,'me','total').detail,'3/18 洞');
 A.deepEqual(view.tableColumns.filter(c=>c.summary).map(c=>c.subtitle),['OUT','IN','实际']);A.equal(view.tableColumns.at(-1).key,'total');A.equal(JSON.stringify(r),before);
 A.equal(View.table(r,label).tablePlayers[0].cells[0].value,5,'full card keeps actual strokes');
});
test('avatar current total adds recorded differences to the full round Par without filling missing scores',()=>{
 let r=round(2,18);r.players[0].holePars=Object.fromEntries(r.holes.map(h=>[h.number,4]));r.players[1].holePars=Object.fromEntries(r.holes.map(h=>[h.number,5]));
 const blank=View.liveTable(r,label);A.equal(blank.tablePlayers[0].liveTotal,72);A.equal(blank.tablePlayers[1].liveTotal,90);A.equal(cell(blank,'me','total').value,'—');
 r=record(r,'me',1,5);r=record(r,'manual-1',1,4);const before=JSON.stringify(r),v=View.liveTable(r,label);
 A.equal(v.tablePlayers[0].liveTotal,73);A.equal(v.tablePlayers[1].liveTotal,89);A.equal(cell(v,'me','total').value,'5');A.equal(cell(v,'manual-1','total').value,'4');A.equal(Object.keys(r.scores.me).length,1);A.equal(JSON.stringify(r),before);
 let nine=round(1,9);nine.players[0].holePars=Object.fromEntries(nine.holes.map(h=>[h.number,4]));nine=record(nine,'me',1,6);A.equal(View.liveTable(nine,label).tablePlayers[0].liveTotal,38);
});
test('empty, skipped, picked-up and conceded holes never become Par or invented actual totals',()=>{
 const r=round(16,9);r.scores.me[1]={completion:'picked_up'};r.scores.me[2]={completion:'skipped'};r.scores.me[3]={completion:'conceded_next_stroke'};
 const view=View.liveTable(r,label);A.equal(view.tablePlayers.length,16);A.deepEqual(view.tablePlayers[0].cells.slice(0,4).map(c=>c.value),['捡','跳','认','—']);
 A.ok(view.tablePlayers.every(p=>p.relativeTotal==='—'&&p.cells.at(-1).value==='—'));A.equal(cell(view,'me','total').detail,'0/9 洞');A.equal(view.tableColumns.filter(c=>c.summary).length,2);
});
test('nine-hole subtotals follow playing order even when starting on the back nine',()=>{
 let r=round(1,18);r.players[0].holePars[1]=4;r.players[0].holePars[10]=4;r=record(r,'me',1,5);r=record(r,'me',10,3);
 r.playOrder=[...Array.from({length:9},(_,i)=>10+i),...Array.from({length:9},(_,i)=>1+i)];r.holeOrder=[...r.playOrder];r.currentHole=1;
 const view=View.liveTable(r,label);A.equal(view.tableColumns[0].number,10);A.equal(cell(view,'me','half-0').value,'-1');A.equal(cell(view,'me','half-1').value,'+1');A.equal(cell(view,'me','total').value,'8');A.equal(view.currentColumnLeft,465);
});
test('completed eighteen-hole card reconciles actual subtotals, final strokes and relative total',()=>{
 let r=round(1,18);r.players[0].holePars=Object.fromEntries(r.holes.map(h=>[h.number,4]));
 for(let n=1;n<=18;n++)r=record(r,'me',n,n<=9?5:3);
 const view=View.liveTable(r,label);A.equal(cell(view,'me','half-0').value,'+9');A.equal(cell(view,'me','half-0').detail,'45 杆');A.equal(cell(view,'me','half-1').value,'-9');A.equal(cell(view,'me','half-1').detail,'27 杆');A.equal(cell(view,'me','total').value,'72');A.equal(view.tablePlayers[0].relativeTotal,'0');
});
test('actual-stroke input starts at each Par while the table stays relative, and stops at one stroke',()=>{
 for(const par of [3,4,5]){
  const r=round(1,18);r.players[0].holePars[1]=par;const p=page(r);
  A.equal(p.data.displayScore,par);A.equal(p.data.s,null);A.equal(S.getRound(r.id).scores.me[1],undefined);
  p.input();A.equal(p.data.displayScore,par);A.equal(S.getRound(r.id).scores.me[1].grossStrokes,par);A.equal(cell(p.data,'me','hole-1').value,'0');
  const step=n=>p.step({currentTarget:{dataset:{delta:n}}});
  step(1);A.equal(p.data.displayScore,par+1);A.equal(cell(p.data,'me','hole-1').value,'+1');A.equal(S.getRound(r.id).scores.me[1].grossStrokes,par+1);
  step(-1);step(-1);A.equal(p.data.displayScore,par-1);A.equal(cell(p.data,'me','hole-1').value,'-1');A.equal(S.getRound(r.id).scores.me[1].grossStrokes,par-1);
  for(let i=0;i<5;i++)step(-1);A.equal(p.data.displayScore,1);A.equal(S.getRound(r.id).scores.me[1].grossStrokes,1);
 }
});
test('existing scores, player-specific Pars and player/hole switches show actual input without rewriting scores',()=>{
 let r=round(2,18);r.players.forEach(p=>p.holePars=Object.fromEntries(r.holes.map(h=>[h.number,4])));
 r.players[0].holePars[1]=5;r.players[0].holePars[2]=3;r.players[1].holePars[1]=3;
 r=record(r,'me',1,8);r=record(r,'manual-1',1,2);const p=page(r),scores=JSON.stringify(S.getRound(r.id).scores);
 A.equal(p.data.displayScore,8);A.equal(cell(p.data,'me','hole-1').value,'+3');A.equal(p.data.tablePlayers[0].liveTotal,75);A.equal(cell(p.data,'me','total').value,'8');
 p.selectPlayer({currentTarget:{dataset:{id:'manual-1'}}});A.equal(p.data.displayScore,2);A.equal(cell(p.data,'manual-1','hole-1').value,'-1');
 p.hole({currentTarget:{dataset:{number:2,pid:'me'}}});A.equal(p.data.displayScore,3);A.equal(p.data.s,null);
 p.hole({currentTarget:{dataset:{number:1,pid:'me'}}});p.onShow();
 A.equal(p.data.displayScore,8);A.equal(JSON.stringify(S.getRound(r.id).scores),scores);
 p.step({currentTarget:{dataset:{delta:-1}}});A.equal(p.data.displayScore,7);A.equal(cell(p.data,'me','hole-1').value,'+2');A.equal(S.getRound(r.id).scores.me[1].grossStrokes,7);
});
test('automatic scrolling includes the inserted subtotal and still selects the physical hole',()=>{
 const p=page(round(1,18));p.hole({currentTarget:{dataset:{number:10,pid:'me'}}});A.equal(p.data.h.number,10);A.equal(p.data.currentColumnLeft,465);A.equal(p.data.scoreScrollLeft,420);
 p.input();A.equal(p.data.tablePlayers[0].cells.find(c=>c.number===10).value,'0');A.equal(p.data.tablePlayers[0].cells.at(-1).value,String(p.data.currentPar));
});
