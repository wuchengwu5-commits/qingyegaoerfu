const {test}=require('node:test');
const assert=require('node:assert/strict');
test('host score intents survive page hiding and are committed to the local shared round',async()=>{
 let memory={},uid='host',release;
 global.wx={getStorageSync:k=>structuredClone(memory[k]),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast(){}};
 const path=require.resolve('../miniprogram/services/account');
 const account={user:()=>({uid}),needLogin:()=>true,call:()=>new Promise(resolve=>release=resolve)};
 require.cache[path]={id:path,filename:path,loaded:true,exports:account};
 const S=require('../miniprogram/services/store'),V=require('../miniprogram/services/service'),R=require('../miniprogram/services/rules');
 const c=S.courses[0],r=V.newRound(c,[{id:'me',accountUid:uid,name:'我',tee:c.tees[0]}],{id:'shared-local',now:1,date:'2026-11-07'});
 r.cloud={activityId:'a',groupId:'g',ownerUid:uid,live:true,serverVersion:0,cells:{}};S.mutate(d=>d.rounds.push(r));
 const p={...require('../miniprogram/services/score-board-page'),rid:r.id,boardVisible:true,data:{p:{id:'me'},h:r.holes[0],liveBoard:true},setData(v){Object.assign(this.data,v)},refresh(v){this.data.r=v||this.viewedRound()}};
 const saving=p.writeCell({strokes:5},p.cellTarget());assert.equal(p.viewedRound().scores.me[1].strokes,5);assert.equal(S.getRound(r.id).scores.me[1],undefined);
 p.hideBoard();const reply=structuredClone(r);reply.scores.me[1]=R.normalizeScore({strokes:5});delete reply.cloud;
 release({activityId:'a',groupId:'g',ownerUid:uid,version:1,cells:{'me:1':{version:1}},round:reply});await saving;
 assert.equal(S.getRound(r.id).scores.me[1].strokes,5);assert.equal(p.pendingCells().length,0);assert.equal(S.getRound(r.id).cloud.serverVersion,1);
});
test('resolving a conflict retains the original input when local persistence fails',async()=>{
 const Account=require('../miniprogram/services/account'),Queue=require('../miniprogram/services/score-edit-queue'),Dialog=require('../miniprogram/services/dialog');
 const {round}=require('./helpers/closure.cjs'),r=round(),ref={activityId:'conflict-activity',groupId:'g'};
 const key='qingye.boardEdit.host.conflict-activity.g',request={...ref,roundId:r.id,playerId:'me',hole:1,score:{strokes:6},mutationId:'original',cellVersion:0,routeRevision:r.courseSnapshot?.routeRevision||0,physicalHoleId:r.holes[0].id};
 const memory={};let full=false;
 global.wx={getStorageSync:k=>structuredClone(memory[k]),setStorageSync:(k,v)=>{if(full&&k===key)throw Error('手机存储空间不足');memory[k]=structuredClone(v);},showToast(){}};
 Queue.save(key,[{request,before:null}]);Queue.reject(key,request,false,'组内已有更新');full=true;
 Account.call=async()=>({...ref,round:r,version:1,cells:{},lockedPlayers:[],readOnly:false});Dialog.actionSheet=o=>o.success({tapIndex:1});
 const p={...require('../miniprogram/services/score-board-page'),remoteRef:ref,data:{},ref:()=>ref,viewedRound:()=>r,showSnapshot(){},setData(v){Object.assign(this.data,v)},updatePending(){},refresh(){}};
 await p.resolveCellConflict();assert.equal(Queue.conflicts(key).length,1);assert.match(p.data.boardError,/存储/);assert.equal(memory[key+'.resolved'],undefined);
});
