const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../miniprogram/services/rules'),S=require('../miniprogram/services/store'),V=require('../miniprogram/services/service'),Archive=require('../miniprogram/services/round-archive'),M=require('../miniprogram/services/storage-maintenance');
const copy=x=>structuredClone(x),size=x=>Buffer.byteLength(JSON.stringify(x));
function round(count=100){
 let r=V.newRound(S.courses.find(c=>c.id==='cn_bg_585'),[{id:'me',name:'球友',tee:'Blue'},{id:'p2',name:'同组球友',tee:'White'}],{id:'legacy-round',now:1,date:'2026-11-11'});
 for(let i=0;i<count;i++)r=R.applyOperation(r,{type:'score',operationId:'edit-'+i,baseRevision:r.revision,time:i+2,playerId:i%2?'p2':'me',holeNumber:i%18+1,score:{strokes:4+i%3}});
 return r;
}
const oldRound=round();
function setup(extra={}){
 const disk={'greenGolf.v3':{version:3,profile:{id:'me',name:'球友'},friends:[],rounds:[copy(oldRound)],settings:{unit:'yd'},favorites:[],templates:[],courses:[],dbRevision:4},'greenGolf.activeVersion':3,...copy(extra)};
 const writes=[];let failed=false;
 global.wx={__preview:true,getStorageSync:k=>copy(disk[k]||''),setStorageSync(k,v){if(failed)throw Error('setStorageSync:fail exceed storage max size 10Mb');disk[k]=copy(v);writes.push(k);},getStorageInfoSync:()=>({keys:Object.keys(disk)}),showToast(){}};
 return {disk,writes,fail:v=>failed=v};
}
test('legacy snapshots shrink before any write, preserving scores, audit deltas and latest undo',()=>{
 const x=setup(),before=copy(x.disk['greenGolf.v3']);S.init();const saved=x.disk['greenGolf.v3'],r=S.getRound(oldRound.id);
 assert.ok(size(saved)<size(before)/8);assert.deepEqual(r.scores,oldRound.scores);assert.equal(r.changeLog.length,100);assert.deepEqual(r.changeLog.at(-1).before,oldRound.changeLog.at(-1).before);
 for(let i=0;i<100;i++)for(const field of ['operationId','reason','time','kind','newRevision'])assert.deepEqual(r.changeLog[i][field],oldRound.changeLog[i][field]);
 const expected=R.applyOperation(oldRound,{type:'undo',operationId:'undo',targetId:'edit-99',baseRevision:100,time:200}),actual=S.operate(r.id,{type:'undo',targetId:'edit-99'});assert.deepEqual(actual.scores,expected.scores);
});
test('queued and in-flight legacy saves are compacted without changing retry IDs, versions or edits',()=>{
 const entry={round:copy(oldRound),stamp:'next-id',expectedVersion:3,errorCode:'OFFLINE',sent:{round:copy(oldRound),stamp:'original-id',expectedVersion:2}};
 const x=setup({'qingye.personalPending.owner':{[oldRound.id]:entry},'qingye.boardEdit.owner.a.g':[{mutationId:'cell-edit',score:{strokes:6}}]});const before=size(x.disk);S.init();
 const after=x.disk['qingye.personalPending.owner'][oldRound.id];assert.ok(size(x.disk)<before/8);assert.equal(after.stamp,entry.stamp);assert.equal(after.sent.stamp,entry.sent.stamp);assert.equal(after.sent.expectedVersion,2);assert.equal(after.expectedVersion,3);assert.deepEqual(after.round.scores,oldRound.scores);assert.deepEqual(after.sent.round.scores,oldRound.scores);assert.equal(after.errorCode,'OFFLINE');assert.equal(x.disk['qingye.boardEdit.owner.a.g'][0].mutationId,'cell-edit');
 const writes=x.writes.length;S.init();M.readQueue('qingye.personalPending.owner');assert.equal(x.writes.length,writes);
});
test('compaction keeps reversible edit history, including clears, rule changes and explicit nulls',()=>{
 let r=copy(oldRound);r=R.applyOperation(r,{type:'score',operationId:'clear',baseRevision:r.revision,time:210,playerId:'me',holeNumber:1,score:null});
 r=R.applyOperation(r,{type:'rules',operationId:'rules',baseRevision:r.revision,time:211,rules:R.defaultRules('stroke_play'),reason:'改为比杆'});
 // Compare every recorded diff against its original before/after, without dropping entries.
 const compact=Archive.compact(r);
 const assign=(target,change)=>{const path=change.path;let obj=target;for(const key of path.slice(0,-1))obj=obj[key];if(change.removed)delete obj[path.at(-1)];else obj[path.at(-1)]=copy(change.after);};
 for(let i=0;i<r.changeLog.length;i++){const original=r.changeLog[i],restored=copy(original.before);for(const change of compact.changeLog[i].changes)assign(restored,change);assert.deepEqual(restored,original.after);}
 assert.deepEqual(Archive.compact(compact),compact);
});
test('full storage and failed migration keep original data, and retry can recover it',()=>{
 const x=setup(),before=copy(x.disk);x.fail(true);assert.throws(()=>S.init(),/已有球局和成绩仍保留/);assert.deepEqual(x.disk,before);x.fail(false);S.init();assert.deepEqual(S.getRound(oldRound.id).scores,oldRound.scores);
});
test('several active rounds can be created and scored independently after legacy migration',()=>{
 const x=setup();S.init();const a=S.create({courseId:'cn_bg_585',players:[{id:'me',name:'甲',tee:'Blue'}]}),b=S.create({courseId:'cn_bg_519',players:[{id:'me',name:'乙',tee:'Blue'}]});
 S.saveScore(a.id,'me',1,{strokes:5});S.saveScore(b.id,'me',1,{strokes:7});assert.equal(S.getRound(a.id).status,'active');assert.equal(S.getRound(b.id).status,'active');assert.equal(S.getRound(a.id).scores.me[1].strokes,5);assert.equal(S.getRound(b.id).scores.me[1].strokes,7);assert.deepEqual(S.getRound(oldRound.id).scores,oldRound.scores);
});
test('failed create page loads offer a retry instead of an empty course and a working Next button',()=>{
 const x=setup();x.fail(true);let definition;global.Page=p=>definition=p;const file=require.resolve('../miniprogram/pages/create/index');delete require.cache[file];require(file);
 const p={...definition,data:copy(definition.data),setData(v){Object.assign(this.data,v);}};p.onLoad({course:'cn_bg_585'});p.onShow();assert.equal(p.data.ready,false);assert.match(p.data.loadError,/已有球局/);p.next();assert.equal(p.data.step,1);
 x.fail(false);p.retryLoad();assert.equal(p.data.ready,true);assert.equal(p.data.course.id,'cn_bg_585');assert.equal(p.data.loadError,'');assert.equal(p.data.draft.players.length,1);
});
