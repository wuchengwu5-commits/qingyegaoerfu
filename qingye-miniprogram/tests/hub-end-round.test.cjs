const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const S=require('../miniprogram/services/store'),A=require('../miniprogram/services/account');
const End=require('../miniprogram/services/end-round'),Sync=require('../miniprogram/services/cloud-sync');
const originals={user:A.user,call:A.call};
let memory,modals,toasts,confirm,uid,calls;
const event=id=>({currentTarget:{dataset:{id}}});
function create(){return S.create({courseId:'cn_bg_585',players:[{id:'me',name:'我',tee:'Blue'}]});}
function hub(){let def;global.Page=p=>def=p;const file=require.resolve('../miniprogram/pages/play/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};p.onShow();return p;}
beforeEach(()=>{
 memory={};modals=[];toasts=[];confirm=true;uid=null;calls=[];
 global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:o=>toasts.push(o.title),showModal:o=>{modals.push(o);o.success({confirm});}};
 A.user=()=>uid?{uid}:null;A.call=async(action,input)=>{calls.push({action,input});return [];};S.init();
});
afterEach(()=>{A.user=originals.user;A.call=originals.call;});
test('hub ends only the selected partial group, retains scores and refreshes the card without navigation',async()=>{
 const one=create(),two=create();S.saveScore(one.id,'me',1,{strokes:5});
 const p=hub();assert.equal(p.data.activeRounds.length,2);await p.endRound(event(one.id));
 assert.equal(S.getRound(one.id).status,'finished_incomplete');assert.equal(S.getRound(one.id).scores.me[1].grossStrokes,5);
 assert.equal(S.getRound(two.id).status,'active');assert.deepEqual(p.data.activeRounds.map(r=>r.id),[two.id]);assert.equal(p.data.endingId,'');
 assert.ok(p.data.recent.some(r=>r.id===one.id));assert.equal(modals.length,1);assert.equal(toasts.at(-1),'本组已结束');
});
test('cancel leaves the group untouched; explicit confirmation may finish an accidental empty round without adding strokes',async()=>{
 const r=create(),p=hub();confirm=false;await p.endRound(event(r.id));assert.equal(S.getRound(r.id).status,'active');assert.deepEqual(toasts,[]);
 confirm=true;await p.endRound(event(r.id));const done=S.getRound(r.id);assert.equal(done.status,'finished_incomplete');assert.deepEqual(done.scores.me,{});assert.equal(S.stats().avg,'—');assert.equal(p.data.activeRounds.length,0);
});
test('a double tap opens one confirmation and changed local scores must be reviewed again',async()=>{
 const r=create(),p=hub();let dialog;wx.showModal=o=>dialog=o;
 const first=p.endRound(event(r.id));await p.endRound(event(r.id));assert.equal(p.data.endingId,r.id);
 S.saveScore(r.id,'me',1,{strokes:6});dialog.success({confirm:true});await first;
 assert.equal(S.getRound(r.id).status,'active');assert.match(toasts.at(-1),/成绩已更新/);
});
test('cloud finish uses the latest version, adopts the closed card, and cannot be triggered by a nonowner',async()=>{
 uid='owner';const r=create(),ref={activityId:'activity',groupId:'main'};
 S.mutate(d=>d.rounds[0].cloud={...ref,ownerUid:uid,live:true,serverVersion:2});
 const board={...ref,ownerUid:uid,version:8,cells:{},round:{...r,scores:{me:{1:require('../miniprogram/services/rules').normalizeScore({strokes:4})}}}};
 A.call=async(action,input)=>{calls.push({action,input});if(action==='readBoard')return board;if(action==='finishBoard')return {...board,version:9,round:require('../miniprogram/services/service').finishRound(board.round,123,{allowEmpty:true})};return [];};
 assert.equal(await End({id:r.id}),true);assert.equal(calls[1].input.version,8);assert.equal(calls[1].input.allowEmpty,true);assert.equal(S.getRound(r.id).status,'finished_incomplete');assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,4);
 uid='guest';assert.equal(hub().data.activeRounds.length,0);
 await assert.rejects(End({id:'remote',...ref}),/只有本组发起人/);assert.equal(calls.filter(c=>c.action==='finishBoard').length,1);
});
test('pending score writes and a cloud version conflict cannot silently close a group',async()=>{
 uid='owner';const r=create(),ref={activityId:'activity',groupId:'main'};
 memory['qingye.boardEdit.owner.activity.main']=[{request:{mutationId:'pending'}}];
 await assert.rejects(End({id:r.id,...ref}),/待同步/);assert.equal(calls.length,0);assert.equal(modals.length,0);
 delete memory['qingye.boardEdit.owner.activity.main'];
 A.call=async action=>{if(action==='readBoard')return {...ref,ownerUid:uid,version:1,round:r};throw Object.assign(Error('组内成绩已更新'),{code:'CONFLICT'});};
 await assert.rejects(End({id:r.id,...ref}),{code:'CONFLICT'});assert.equal(S.getRound(r.id).status,'active');
});
