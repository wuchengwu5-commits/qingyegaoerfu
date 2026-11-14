const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createService}=require('../cloudfunctions/qingye/domain');
const Store=require('../miniprogram/services/store'),V=require('../miniprogram/services/service'),R=require('../miniprogram/services/rules');
const clone=x=>x==null?null:structuredClone(x);
async function server(){
  const db={};let serial=0,tail=Promise.resolve();
  const adapter=data=>({get:async(c,id)=>clone(data[c+':'+id]),set:async(c,id,v)=>data[c+':'+id]=clone(v)});
  const repo={...adapter(db),transaction(fn){const p=tail.then(async()=>{const next=clone(db),out=await fn(adapter(next));Object.assign(db,next);return out;});tail=p.catch(()=>{});return p;}};
  const api=createService(repo,{random:()=>String(++serial).padStart(24,'0'),verifyPhone:async()=>({number:'13800000000',verifiedAt:1})}).dispatch;
  for(const uid of ['a','b'])await api(uid,'phoneLogin');return {api,db};
}
function round(id='r1'){const c=Store.courses.find(c=>c.id==='cn_bg_585');return V.newRound(c,[{id:'me',name:'本人',tee:'Blue'}],{id,now:1,date:'2026-11-11'});}
function score(r,strokes){return R.applyOperation(r,{type:'score',playerId:'me',holeNumber:1,score:{strokes},operationId:'op'+strokes,baseRevision:r.revision,time:2});}
function device(server,disk={}){
  let uid='a',online=true,lose=false;const calls=[],cache={};
  const account={configured:()=>true,user:()=>uid?{uid}:null,async call(action,input){calls.push({action,input:clone(input)});if(!online)throw Error('offline');const as=uid,out=await server.api(as,action,clone(input));if(lose&&action==='savePersonalRound'){lose=false;throw Error('reply lost');}return out;}};
  const context=vm.createContext({console,Date,Math,Promise,JSON,setTimeout:()=>({unref(){}}),clearTimeout(){},wx:{getStorageSync:k=>clone(disk[k]),setStorageSync:(k,v)=>disk[k]=clone(v)}});
  const root=path.resolve(__dirname,'../miniprogram/services');
  function load(file){file=path.resolve(file);if(!path.extname(file))file+='.js';if(file===path.join(root,'account.js'))return account;if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;if(file.endsWith('.json'))mod.exports=JSON.parse(fs.readFileSync(file));else vm.runInContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',context,{filename:file})(id=>load(path.resolve(path.dirname(file),id)),mod,mod.exports);return mod.exports;}
  const S=load(path.join(root,'store')),P=load(path.join(root,'personal-sync'));
  S.mutate(d=>d.profile.accountUid='a');
  return {S,P,disk,calls,uid:v=>uid=v,offline:v=>online=!v,lose:()=>lose=true,account};
}
test('private personal saves preserve scores, ownership, revisions and full history beyond fifty',async()=>{
  const x=await server();
  for(let i=0;i<73;i++)await x.api('a','savePersonalRound',{round:score(round('r'+i),4),mutationId:'m'+i,expectedVersion:0});
  let cursor=null,items=[];do{const p=await x.api('a','personalRounds',{paged:true,cursor});items.push(...p.items);cursor=p.nextCursor;}while(cursor);
  assert.equal(items.length,73);assert.equal(new Set(items.map(x=>x.round.id)).size,73);assert.equal(items.at(-1).round.id,'r0');
  assert.equal((await x.api('b','personalRounds',{})).items.length,0);
  await assert.rejects(x.api('b','getPersonalRound',{roundId:'r0'}),{code:'NOT_FOUND'});
  await assert.rejects(x.api('a','savePersonalRound',{round:{...round('other'),ownerUid:'b'},mutationId:'bad',expectedVersion:0}),{code:'FORBIDDEN'});
  assert.equal(x.db['qy_users:a'].activityIds.length,0); // No shared activity or invitation is created.
});
test('all group and competition history keeps stable pages when new activities are inserted',async()=>{
  const x=await server();for(let i=0;i<75;i++)await x.api('a','create',{courseId:'cn_bg_585',courseName:'测试'});
  const first=await x.api('a','list',{paged:true});assert.equal(first.items.length,20);
  await x.api('a','create',{courseId:'cn_bg_585',courseName:'新球局'});
  const ids=first.items.map(x=>x.id);let cursor=first.nextCursor;
  while(cursor){const p=await x.api('a','list',{paged:true,cursor});ids.push(...p.items.map(x=>x.id));cursor=p.nextCursor;}
  assert.equal(ids.length,75);assert.equal(new Set(ids).size,75);assert.equal(x.db['qy_users:a'].activityIds.length,76);
  assert.equal((await x.api('a','list')).length,50);
});
test('solo creation, offline scores and finished rounds back up and restore on a clean device',async()=>{
  const x=await server(),a=device(x);a.offline(true);
  const r=a.S.create({courseId:'cn_bg_585',players:[{id:'me',name:'本人',tee:'Blue'}]});a.S.saveScore(r.id,'me',1,{strokes:5});a.S.finish(r.id);
  await a.P.flush();assert.ok(a.P.pending(r.id));assert.equal(x.db['qy_users:a'].personalRoundIds,undefined);
  a.offline(false);await a.P.sync();assert.equal(a.P.pending(r.id),undefined);
  const b=device(x);await b.P.sync();const restored=b.S.getRound(r.id);
  assert.equal(restored.scores.me[1].strokes,5);assert.equal(restored.status,'finished_incomplete');assert.equal(restored.personalCloud.version,1);
  assert.equal(restored.cloud,undefined);assert.equal(a.P.status(a.S.getRound(r.id)),'已保存到账号');
});
test('lost replies are idempotent across restart and later edits use the acknowledged version',async()=>{
  const x=await server(),a=device(x),r=a.S.create({courseId:'cn_bg_585',players:[{id:'me',name:'本人',tee:'Blue'}]});
  a.lose();await a.P.flush();assert.ok(a.P.pending(r.id));
  const b=device(x,a.disk);b.S.saveScore(r.id,'me',1,{strokes:7});await b.P.flush();
  const result=await x.api('a','getPersonalRound',{roundId:r.id});assert.equal(result.version,2);assert.equal(result.round.scores.me[1].strokes,7);assert.equal(b.P.pending(r.id),undefined);
  assert.equal(x.db['qy_users:a'].personalRoundIds.length,1);
});
test('conflicting devices retain both scorecards, and one failed round does not block another',async()=>{
  const x=await server(),a=device(x),r=a.S.create({courseId:'cn_bg_585',players:[{id:'me',name:'本人',tee:'Blue'}]});await a.P.flush();
  const b=device(x);await b.P.sync();a.S.saveScore(r.id,'me',1,{strokes:4});await a.P.flush();
  b.S.saveScore(r.id,'me',1,{strokes:8});const another=b.S.create({courseId:'cn_bg_585',players:[{id:'me',name:'本人',tee:'Blue'}]});await b.P.flush();await b.P.flush();
  const backup=b.S.read().rounds.find(v=>v.conflictSourceId===r.id);
  assert.ok(backup);assert.equal(backup.scores.me[1].strokes,8);assert.equal(b.S.getRound(r.id).scores.me[1].strokes,4);
  assert.equal((await x.api('a','getPersonalRound',{roundId:backup.id})).round.scores.me[1].strokes,8);
  assert.equal((await x.api('a','getPersonalRound',{roundId:another.id})).round.id,another.id);
});
test('unknown legacy rounds wait for ownership confirmation, other-account queues cannot upload',async()=>{
  const x=await server(),a=device(x);a.S.mutate(d=>d.rounds.push(round()));await a.P.sync();
  assert.equal(x.db['qy_users:a'].personalRoundIds,undefined);await a.P.claim();assert.equal(x.db['qy_users:a'].personalRoundIds.length,1);
  a.offline(true);a.S.saveScore('r1','me',1,{strokes:6});await a.P.flush();a.uid('b');a.offline(false);await a.P.flush();
  assert.equal(x.db['qy_users:b'].personalRoundIds,undefined);assert.ok(a.disk['qingye.personalPending.a'].r1);
});
test('logout during a save keeps the retry entry and cannot mutate the next session',async()=>{
  const x=await server(),a=device(x),r=a.S.create({courseId:'cn_bg_585',players:[{id:'me',name:'本人',tee:'Blue'}]});
  const original=a.account.call;let release;a.account.call=async(...args)=>{const out=await original(...args);await new Promise(resolve=>release=resolve);return out;};
  const writing=a.P.flush();while(!release)await new Promise(resolve=>setImmediate(resolve));a.uid(null);release();await writing;
  assert.ok(a.disk['qingye.personalPending.a'][r.id]);assert.equal(a.S.getRound(r.id).personalCloud,undefined);
});
test('a full four-player round stays small while audit deltas and last-operation undo survive reload',async()=>{
  const x=await server(),a=device(x);a.offline(true);
  const r=a.S.create({courseId:'cn_bg_585',players:Array.from({length:4},(_,i)=>({id:i?'p'+i:'me',name:'球友'+i,tee:'Blue'}))});
  for(const p of r.players)for(const hole of r.holes)a.S.saveScore(r.id,p.id,hole.number,{strokes:5});
  const saved=a.S.getRound(r.id),last=saved.changeLog.at(-1);
  assert.equal(saved.changeLog.length,72);assert.ok(saved.changeLog[0].changes.length);assert.equal(saved.changeLog[0].before,undefined);assert.ok(last.before);
  assert.ok(JSON.stringify(saved).length<350000);
  a.S.operate(r.id,{type:'undo',targetId:last.operationId});assert.equal(a.S.getRound(r.id).scores.p3[18],undefined);
  a.S.saveScore(r.id,'p3',18,{strokes:4});a.S.finish(r.id);a.offline(false);await a.P.sync();
  assert.equal(a.P.pending(r.id),undefined);const remote=await x.api('a','getPersonalRound',{roundId:r.id});
  assert.equal(remote.round.status,'finished_complete');assert.equal(remote.round.scores.p3[18].strokes,4);assert.ok(JSON.stringify(remote.round).length<350000);
});
test('personal rating inputs persist in the account and cannot be changed by another user',async()=>{
  const x=await server();let r=round();for(const h of r.holes)r=R.applyOperation(r,{type:'score',playerId:'me',holeNumber:h.number,score:{strokes:4},operationId:'hole'+h.number,baseRevision:r.revision,time:2});
  r=V.finishRound(r,3);r=require('../miniprogram/services/round-archive').compact(r);
  await x.api('a','savePersonalRound',{round:r,expectedVersion:0,mutationId:'finished'});
  const values={tee:'Blue',courseRating:72,slopeRating:113,adjustedGross:72,pcc:0,confirmed:true};
  await x.api('a','rating',{roundId:r.id,values});assert.equal(x.db['qy_users:a'].handicapInputs[r.id].courseRating,72);
  await assert.rejects(x.api('b','rating',{roundId:r.id,values}),{code:'FORBIDDEN'});
});

test('sixteen-player full round and all 864 edits synchronize in bounded parts and restore on another device',async()=>{
 const x=await server(),a=device(x);a.offline(true);
 const r=a.S.create({courseId:'cn_bg_585',players:Array.from({length:16},(_,i)=>({id:i?'p'+i:'me',name:'球友'+i,tee:'Blue'}))});
 // Build actual engine operations, compacting at the same boundary as Store.write.
 let full=a.S.getRound(r.id),n=0;const Archive=require('../miniprogram/services/round-archive');
 for(const h of full.holes)for(const p of full.players)for(const delta of [0,1,2])full=Archive.compact(R.applyOperation(full,{type:'score',operationId:'large-'+(++n),baseRevision:full.revision,time:n,playerId:p.id,holeNumber:h.number,score:{strokes:h.par+delta}}));
 a.S.replace(full);a.S.finish(r.id);a.offline(false);await a.P.sync();assert.equal(a.P.pending(r.id),undefined);
 const writes=a.calls.filter(c=>c.action==='savePersonalRound'||c.action==='putPersonalHistory');for(const write of writes)assert.ok(JSON.stringify(write.input).length<350000);
 const b=device(x);await b.P.sync();const restored=b.S.getRound(r.id);assert.equal(restored.changeLog.length,864);assert.equal(restored.scores.p15[18].grossStrokes,full.holes[17].par+2);assert.equal(restored.status,'finished_complete');
 const remote=await x.api('a','getPersonalRound',{roundId:r.id});assert.ok(remote.historyRefs.length>1);
 await assert.rejects(x.api('b','getPersonalHistory',{roundId:r.id,historyId:remote.historyRefs[0]}),{code:'FORBIDDEN'});
 await assert.rejects(x.api('a','savePersonalRound',{round:remote.round,expectedVersion:remote.version,mutationId:'legacy-client'}),{code:'UPDATE_REQUIRED'});
 assert.equal((await x.api('a','getPersonalRound',{roundId:r.id})).historyRefs.length,remote.historyRefs.length);
});
