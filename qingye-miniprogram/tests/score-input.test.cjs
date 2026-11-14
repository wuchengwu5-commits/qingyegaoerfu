const {test}=require('node:test');
const assert=require('node:assert/strict');
const Patch=require('../miniprogram/services/view-patch');
const root='../miniprogram/services/';
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 let db={},uid='u1',calls=[],waiting=[],failStorage=false;
 global.wx={getStorageSync:k=>structuredClone(db[k]),setStorageSync:(k,v)=>{if(failStorage)throw Error('storage full');db[k]=structuredClone(v)},showToast(){}};
 const account={user:()=>uid?{uid}:null,needLogin:()=>!!uid,call:(action,req)=>new Promise((resolve,reject)=>{calls.push({action,req:structuredClone(req)});waiting.push({resolve,reject,req});})};
 const cache=(name,value)=>{const f=require.resolve(root+name);require.cache[f]={id:f,filename:f,loaded:true,exports:value};};
 let next=0;
 cache('account',account);cache('store',{getRound(){return null},isEditing:()=>false,id:()=>String(++next)});cache('cloud-sync',{pending:()=>null});
 const shared={context:r=>({activityId:r.activityId,groupId:r.groupId}),pendingKey:r=>'pending.'+uid+'.'+r.groupId};cache('shared-round',shared);
 const path=require.resolve(root+'score-board-page');delete require.cache[path];const mixin=require(path);
 const initial={id:'r',currentPlayer:'me',currentHole:1,courseSnapshot:{routeRevision:0},players:[{id:'me',accountUid:'u1'},{id:'friend'}],holes:[{id:'A1',number:1},{id:'A2',number:2}],scores:{me:{},friend:{}}};
 const p={...mixin,remoteRef:{activityId:'a',groupId:'g'},remoteRound:structuredClone(initial),rid:'r',boardVisible:true,cellStamps:{},data:{p:{id:'me'},h:{number:1}},setData(v){Patch.apply(this.data,v)},refresh(r){r=r||this.viewedRound();this.data.r=r;this.data.s=r.scores[this.data.p.id][this.data.h.number]||null;}};
 let version=0,server=structuredClone(initial),cells={};
 function reply(){const job=waiting.shift(),q=job.req;assert.equal(cells[q.playerId+':'+q.hole]?.version||0,q.cellVersion,'uses the acknowledged version');if(q.score)server.scores[q.playerId][q.hole]=q.score;else delete server.scores[q.playerId][q.hole];cells[q.playerId+':'+q.hole]={version:++version,id:q.mutationId,actor:uid};job.resolve({round:structuredClone(server),cells:structuredClone(cells),version});}
 const change=(n,pid='me',hole=1)=>{p.data.p={id:pid};p.data.h={number:hole};p.remoteRound.currentPlayer=pid;p.remoteRound.currentHole=hole;return p.writeCell(n===null?null:{strokes:n},p.cellTarget());};
 return {p,change,reply,calls,waiting,db,login:x=>uid=x,storageFail:x=>failStorage=x,account,shared};
}
test('incremental bindings preserve arrays, deletions and numeric score keys',()=>{
 const before={players:[{id:'me',total:72,cells:[{value:4}]}],scores:{me:{1:{strokes:4},2:{strokes:5}}}};
 const after={players:[{id:'me',total:73,cells:[{value:5}]}],scores:{me:{1:{strokes:5}}}};
 const patch=Patch.diff(before,after);assert.equal(patch['players[0].total'],73);assert.equal(patch['players[0].cells[0].value'],5);assert.deepEqual(Patch.apply(before,patch),after);
});
test('selected player bindings never alias the roster when nested updates are applied',()=>{
 const me={id:'me',name:'我'},friend={id:'friend',name:'球友'},roster=[me,friend],data={};
 Patch.apply(data,Patch.diff(data,{r:{players:roster},p:me}));
 assert.notEqual(data.p,data.r.players[0]);
 Patch.apply(data,Patch.diff(data,{r:{players:roster},p:friend}));
 assert.equal(data.r.players[0].id,'me');assert.equal(data.p.id,'friend');
 Patch.apply(data,Patch.diff(data,{r:{players:roster},p:friend,score:5}));
 assert.equal(data.p.id,'friend');assert.equal(me.id,'me');
});
test('rapid score taps display immediately, survive cursor changes and drain in order',async()=>{
 const x=setup(),pending=x.change(5);x.change(6);x.change(7);x.change(3,'friend',2);
 assert.equal(x.calls.length,1);assert.equal(x.p.viewedRound().scores.me[1].strokes,7);assert.equal(x.p.data.s.strokes,3);assert.equal(x.p.pendingCells().length,4);
 x.reply();await tick();assert.equal(x.calls[1].req.score.strokes,6);assert.equal(x.calls[1].req.cellVersion,1);
 x.reply();await tick();x.reply();await tick();x.reply();await pending;
 assert.equal(x.p.remoteRound.scores.me[1].strokes,7);assert.equal(x.p.remoteRound.scores.friend[2].strokes,3);assert.equal(x.p.pendingCells().length,0);
});
test('network failure retains persisted scores and retries same mutation after page recreation',async()=>{
 const x=setup(),pending=x.change(5);x.change(6);x.waiting.shift().reject(Error('offline'));await pending;
 assert.equal(x.p.viewedRound().scores.me[1].strokes,6);assert.match(x.p.data.boardError,/本机已记/);
 const recreated={...x.p,data:structuredClone(x.p.data),writing:false};const retry=recreated.submitCell(recreated.remoteRef);
 assert.equal(x.calls[1].req.mutationId,x.calls[0].req.mutationId);x.reply();await tick();x.reply();await retry;assert.equal(recreated.pendingCells().length,0);
});
test('conflicting cell is not automatically overwritten; other cell intents remain',async()=>{
 const x=setup(),pending=x.change(5);x.change(6);x.change(3,'friend',2);
 x.waiting.shift().reject(Object.assign(Error('请核对最新成绩'),{code:'CELL_CONFLICT'}));await tick();
 assert.equal(x.calls.at(-1).action,'readBoard');const latest=structuredClone(x.p.remoteRound);latest.scores.me[1]={strokes:8,grossStrokes:8};
 x.waiting.shift().resolve({round:latest,version:10,cells:{'me:1':{version:10}}});await pending;
 assert.equal(x.p.viewedRound().scores.me[1].strokes,8);assert.equal(x.p.pendingCells().length,1);assert.equal(x.p.pendingCells()[0].request.playerId,'friend');assert.match(x.p.data.boardError,/核对/);
});
test('undo removes unsent edit, and compensates an in-flight edit after its acknowledgement',async()=>{
 const x=setup(),pending=x.change(5);x.change(6);x.p.undoCell();assert.equal(x.p.viewedRound().scores.me[1].strokes,5);
 x.p.undoCell();assert.equal(x.p.viewedRound().scores.me[1],undefined);x.reply();await tick();assert.equal(x.calls[1].req.score,null);x.reply();await pending;assert.equal(x.p.remoteRound.scores.me[1],undefined);
});
test('storage failure and invalid scores do not pretend to save or send an update',async()=>{
 const x=setup();await x.change(31);assert.equal(x.calls.length,0);assert.equal(x.p.pendingCells().length,0);
 x.storageFail(true);await x.change(5);assert.equal(x.calls.length,0);assert.equal(x.p.remoteRound.scores.me[1],undefined);assert.match(x.p.data.boardError,/storage/);
});
test('logout during a request never drains another account’s edits or accepts its response',async()=>{
 const x=setup(),pending=x.change(5);x.change(6);x.login('u2');x.reply();await pending;
 assert.equal(x.calls.length,1);assert.equal(x.db['pending.u1.g'].length,2);assert.equal(x.p.remoteRound.scores.me[1],undefined);
});
test('player and scorer invitation codes never reuse each other’s cached token',async()=>{
 const x=setup();x.p.watchBoard=()=>{};x.p.loadCode=async()=>{};const kinds=[];
 x.account.call=async(action,request)=>{assert.equal(action,'invite');kinds.push(request.kind);return {kind:request.kind,token:request.kind,expiresAt:Date.now()+100000};};
 await x.p.inviteScorer();assert.equal(x.p.data.boardInvite.kind,'scorer');await x.p.enableSharing(true);assert.equal(x.p.data.boardInvite.kind,'live');assert.deepEqual(kinds,['scorer','live']);
});
test('pending virtual-seat retries keep the original ID after a lost response',async()=>{
 const x=setup(),key=x.p.virtualKey(x.p.remoteRef);wx.setStorageSync(key,{playerId:'v1',name:'虚拟球友'});
 const first=x.p.submitVirtual(x.p.remoteRef);x.waiting.shift().reject(Error('offline'));await first;assert.equal(wx.getStorageSync(key).playerId,'v1');
 const retry=x.p.submitVirtual(x.p.remoteRef);assert.equal(x.calls[1].req.playerId,'v1');
 const round=structuredClone(x.p.remoteRound);round.players.push({id:'v1',name:'虚拟球友'});round.scores.v1={};x.waiting.shift().resolve({round,cells:{},version:1});await retry;
 assert.equal(wx.getStorageSync(key),null);assert.equal(x.p.remoteRound.players.length,3);
});
test('unchanged boards refresh names and avatars periodically without another score mutation',async()=>{
 const x=setup(),requests=[];let refreshes=0;x.p.boardVersion=7;x.p.refresh=()=>refreshes++;
 x.account.call=async(action,request)=>{requests.push({action,request});return {version:7,...(request.includeProfiles?{profiles:[{uid:'u1',name:'已更新球友',avatarUrl:'cloud://avatar'}]}:{})};};
 await x.p.pollBoard();assert.equal(requests[0].request.includeProfiles,true);assert.equal(x.p.boardProfiles[0].name,'已更新球友');assert.equal(refreshes,1);
 await x.p.pollBoard();assert.equal(requests[1].request.includeProfiles,false);
 x.p.profilesCheckedAt=Date.now()-31000;await x.p.pollBoard();assert.equal(requests[2].request.includeProfiles,true);assert.equal(refreshes,2);assert.equal(x.p.boardVersion,7);assert.ok(requests.every(r=>r.action==='readBoard'));
});
