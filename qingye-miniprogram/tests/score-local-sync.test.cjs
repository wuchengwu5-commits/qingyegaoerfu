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
