const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const S=require('../miniprogram/services/store'),R=require('../miniprogram/services/rules'),A=require('../miniprogram/services/account'),config=require('../miniprogram/config');
let memory,toasts;
function page(name,options={}){
 let definition;global.Page=p=>definition=p;
 const file=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[file];require(file);
 const p={...definition,data:structuredClone(definition.data||{}),setData(data){require('../miniprogram/services/view-patch').apply(this.data,data);}};
 p.onLoad?.(name==='create'?{demo:'1',...options}:options);p.onShow?.();return p;
}
const event=dataset=>({currentTarget:{dataset}});
beforeEach(()=>{
 memory={};toasts=[];config.testPlayersEnabled=true;
 global.wx={__preview:true,getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:o=>toasts.push(o.title),showModal:o=>o.success({confirm:true}),navigateTo(){},redirectTo(){},switchTab(){}};
 S.init();
});
test('local setup has four blank independent scorecards, restored on page reload',()=>{
 const setup=page('create',{course:'cn_bg_585'});setup.start();
 const round=S.active();assert.equal(round.players.length,4);assert.equal(round.cloud,undefined);
 assert.deepEqual(round.players.slice(1).map(p=>p.name),['测试1','测试2','测试3']);
 for(const player of round.players){assert.deepEqual(round.scores[player.id],{});assert.equal(player.accountUid,undefined);}
 const score=page('score',{id:round.id});
 round.players.forEach((player,i)=>{score.selectPlayer(event({id:player.id}));score.quick(event({value:4+i}));});
 let restored=page('score',{id:round.id});assert.deepEqual(restored.data.tablePlayers.map(p=>p.cells[0].value),[4,5,6,7]);
 restored.selectPlayer(event({id:round.players[1].id}));restored.step(event({delta:1}));restored.undo();
 restored.hole(event({pid:round.players[2].id,number:10}));restored.quick(event({value:3}));
 restored=page('score',{id:round.id});assert.equal(restored.data.h.number,10);assert.equal(restored.data.p.id,round.players[2].id);
 assert.equal(restored.data.s.grossStrokes,3);
 const saved=S.getRound(round.id);assert.deepEqual(saved.players.map(p=>saved.scores[p.id][1].grossStrokes),[4,5,6,7]);
 assert.equal(saved.scores.me[10],undefined);assert.deepEqual(S.read().friends,[]);
 const result=page('result',{id:round.id});assert.equal(result.data.players.length,4);
 assert.deepEqual(result.data.players.map(p=>R.rawSummary(saved,p.id).played),[1,1,2,1]);assert.deepEqual(toasts,[]);
});
test('returning from rules retains test players, per-player tee and four-ball teams',()=>{
 const setup=page('create',{course:'cn_bg_585'});
 setup.tee({currentTarget:{dataset:{pid:'local-test-2'}},detail:{value:2}});
 setup.template(event({id:'four_ball'}));const before=structuredClone(setup.data.draft);
 setup.onShow();assert.deepEqual(setup.data.draft,before);
 const reopened=page('create',{course:'cn_bg_585'});assert.deepEqual(reopened.data.draft,before);reopened.start();
 const r=S.active();assert.equal(r.players[2].tee,'White');assert.deepEqual(r.ruleSnapshot.grouping,before.ruleSnapshot.grouping);assert.deepEqual(toasts,[]);
});
test('removed test players stay removed until refill, and repeated refill never duplicates',()=>{
 const setup=page('create',{course:'cn_bg_585'});
 for(const p of setup.data.draft.players.slice(1))setup.remove(event({id:p.id}));
 setup.onShow();assert.deepEqual(setup.data.draft.players.map(p=>p.id),['me']);
 setup.testPlayers();setup.testPlayers();assert.equal(setup.data.draft.players.length,4);
 assert.equal(new Set(setup.data.draft.players.map(p=>p.id)).size,4);assert.deepEqual(toasts,[]);
});
test('real invited groups replace test roster; returning to local setup removes real member identities',async()=>{
 page('create',{course:'cn_bg_585'});
 const user=A.user,call=A.call;
 A.user=()=>({uid:'owner'});A.call=async()=>({groups:[{id:'group',canScore:true,members:[{uid:'owner',name:'我'},{uid:'friend',name:'真实球友'}]}]});
 try{
  const online=page('create',{course:'cn_bg_585',activity:'activity',group:'group'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(online.data.onlineGroup,true);assert.deepEqual(online.data.draft.players.map(p=>p.id),['me','friend']);
  online.testPlayers();assert.equal(S.read().draft.players.length,2);
  assert.equal(S.read().draft.players.some(p=>p.isTest),false);
  const local=page('create',{course:'cn_bg_585'});assert.equal(local.data.draft.players.length,4);
  assert.equal(local.data.draft.players.some(p=>p.accountUid),false);assert.deepEqual(toasts,[]);
 }finally{A.user=user;A.call=call;}
});
test('disabling the temporary roster restores single-player setup without changing existing scores',()=>{
 const setup=page('create',{course:'cn_bg_585'});setup.start();
 const original=S.active();S.saveScore(original.id,'local-test-1',1,{strokes:5});const saved=structuredClone(S.getRound(original.id));
 const next=page('create',{course:'cn_bg_585'});config.testPlayersEnabled=false;next.testing=false;next.onShow();
 assert.deepEqual(next.data.draft.players.map(p=>p.id),['me']);next.testPlayers();assert.equal(next.data.draft.players.length,1);
 assert.deepEqual(S.getRound(original.id),saved);assert.deepEqual(toasts,[]);
});

test('create from saved friends caps at sixteen distinct players and the last player can score',()=>{
 const setup=page('create',{course:'cn_bg_585'}), original=A.user;
 const friends=Array.from({length:16},(_,i)=>({id:'friend-'+i,accountUid:'friend-'+i,name:'球友'+i}));
 S.mutate(data=>data.friends=friends);
 try {
  A.user=()=>({uid:'host'});
  setup.refresh();
  for(const friend of friends)setup.add(event({id:friend.accountUid}));
  assert.match(toasts.pop(),/最多 16 人/);
  assert.equal(setup.data.draft.players.length,16);
  setup.start();
 } finally {A.user=original;}
 const r=S.active(),score=page('score',{id:r.id});
 const last=r.players[15];assert.equal(last.accountUid,friends[14].accountUid);
 score.selectPlayer(event({id:last.id}));score.quick(event({value:5}));
 assert.equal(S.getRound(r.id).scores[last.id][1].grossStrokes,5);
 assert.deepEqual(S.getRound(r.id).scores.me,{});
});
