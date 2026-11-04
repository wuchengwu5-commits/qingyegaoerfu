const {test}=require('node:test'),A=require('node:assert/strict');
const accountPath=require.resolve('../miniprogram/services/account'),syncPath=require.resolve('../miniprogram/services/cloud-sync');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 let uid=null,db={};const calls=[],account={configured:()=>true,user:()=>uid?{uid}:null,call:async(action,request)=>{calls.push(request);return {version:request.expectedVersion+1};}};
 require.cache[accountPath]={id:accountPath,filename:accountPath,loaded:true,exports:account};delete require.cache[syncPath];
 global.wx={getStorageSync:k=>structuredClone(db[k]),setStorageSync:(k,v)=>{db[k]=structuredClone(v);}};
 return {sync:require(syncPath),account,calls,login(){uid='u1';},data:()=>db,round:(revision=0)=>({id:'r1',revision,cloud:{ownerUid:'u1',activityId:'a',groupId:'g',serverVersion:0},changeLog:[{private:true}],scores:{me:{1:{strokes:revision+4}}}})};
}
test('offline edits persist and coalesce; authentication later sends the latest score without history logs',async()=>{
 const x=setup();x.sync.enqueue(x.round());x.sync.enqueue(x.round(2));A.equal(x.calls.length,0);x.login();await x.sync.flush();
 A.equal(x.calls.length,1);A.equal(x.calls[0].round.revision,2);A.equal(x.calls[0].round.changeLog,undefined);A.equal(x.sync.status('r1'),'已同步');
});
test('lost response survives an app restart and newer edits; original mutation retries before the next revision',async()=>{
 const x=setup();x.login();let first=true,committed=null;x.account.call=async(action,q)=>{x.calls.push(q);if(first){first=false;committed=q;throw Error('connection lost');}if(q.mutationId===committed.mutationId)return {version:1};A.equal(q.expectedVersion,1);return {version:2};};
 x.sync.enqueue(x.round());await x.sync.flush();A.match(x.sync.status('r1'),/connection/);delete require.cache[syncPath];const reopened=require(syncPath);reopened.enqueue(x.round(1));await reopened.flush();await tick();
 A.equal(x.calls.length,3);A.equal(x.calls[0].mutationId,x.calls[1].mutationId);A.equal(x.calls[2].round.revision,1);A.equal(reopened.status('r1'),'已同步');
});
test('edits arriving during a save are sent after the acknowledged version; a real conflict stays local',async()=>{
 const x=setup();x.login();let resolve;x.account.call=(action,q)=>{x.calls.push(q);if(x.calls.length===1)return new Promise(r=>resolve=r);return Promise.resolve({version:2});};
 x.sync.enqueue(x.round());x.sync.enqueue(x.round(1));resolve({version:1});await x.sync.flush();await tick();A.equal(x.calls[1].expectedVersion,1);A.equal(x.sync.status('r1'),'已同步');
 x.account.call=async()=>{const e=Error('conflict');e.code='CONFLICT';throw e;};x.sync.enqueue(x.round(2));await x.sync.flush();A.match(x.sync.status('r1'),/另一设备/);A.equal(x.data()['qingye.pendingRounds'].r1.round.revision,2);
});
test('committing a finished online score correction also queues the corrected revision',()=>{
 const x=setup(),S=require('../miniprogram/services/store'),R=require('../miniprogram/services/rules');
 const round=S.create({courseId:'cn_bg_585',players:[{id:'me',name:'Test',tee:'Blue'}]});S.saveScore(round.id,'me',1,{strokes:5});const online=S.getRound(round.id);online.cloud={ownerUid:'u1',activityId:'a',groupId:'g',serverVersion:0};S.replace(online);S.finish(round.id);
 S.startEdit(round.id);S.saveScore(round.id,'me',1,{strokes:4});const corrected=S.commitEdit('修正录入错误');A.equal(x.data()['qingye.pendingRounds'][round.id].round.scores.me[1].strokes,4);A.equal(x.data()['qingye.pendingRounds'][round.id].round.revision,corrected.revision);A.equal(R.rawSummary(corrected,'me').total,4);
});
