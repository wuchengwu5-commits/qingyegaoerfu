const {test,beforeEach}=require('node:test'),A=require('node:assert/strict');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),H=require('../miniprogram/services/round-history');
let memory,routes,toasts;
function page(name,options={}){let def;global.Page=p=>def=p;const file=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data||{}),setData(x){require('../miniprogram/services/view-patch').apply(this.data,x);}};p.onLoad?.(options);p.onShow?.();return p;}
const ev=id=>({currentTarget:{dataset:{id}}});
beforeEach(()=>{memory={};routes=[];toasts=[];global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),navigateTo:o=>routes.push(o.url),redirectTo:o=>routes.push(o.url),switchTab:o=>routes.push(o.url),showToast:o=>toasts.push(o.title),showModal:o=>o.success({confirm:true,content:'李先生'}),pageScrollTo(){}};S.init();});
test('normal creation has no automatic testers; steps, manual players, Tee and invite preference survive page re-entry',()=>{
 const p=page('create',{course:'cn_bg_585'});A.equal(p.data.draft.players.length,1);A.equal(p.data.step,1);
 p.next();A.equal(p.data.step,2);p.temp();const id=p.data.draft.players[1].id;
 p.tee({currentTarget:{dataset:{pid:id}},detail:{value:2}});p.inviteToggle({detail:{value:true}});p.next();A.equal(p.data.step,3);
 const before=structuredClone(S.read().draft),again=page('create',{course:'cn_bg_585'});A.deepEqual(S.read().draft,before);A.equal(again.data.step,3);again.start();
 const round=S.active();A.equal(round.players.length,2);A.equal(round.players[1].tee,'White');A.match(routes.at(-1),/&invite=1$/);A.equal(S.read().draft,null);A.equal(toasts.length,0);
});
test('all group creation entrances route to the same setup without creating a separate cloud activity',()=>{
 const p=page('groups',{course:'cn_bg_585'}),old=Account.needLogin,call=Account.call;
 Account.needLogin=()=>true;Account.call=()=>{throw Error('must not create a second activity');};
 try{p.create();A.equal(routes.at(-1),'/pages/create/index?course=cn_bg_585');}finally{Account.needLogin=old;Account.call=call;}
});
test('history deduplicates shared scorecards, keeps competitions and preserves conflict copies separately',()=>{
 const r=S.create({courseId:'cn_bg_585'});S.saveScore(r.id,'me',1,{strokes:5});const now=S.getRound(r.id),backup={...structuredClone(now),id:'backup',status:'paused',conflictSourceId:r.id,courseName:r.courseName+'（本机副本）'};
 const remote=H.cloud([{id:'online',courseName:r.courseName,groups:[{id:'main',roundId:r.id,status:'active',players:1,played:1,holes:18}]}],[{id:'event',title:'比赛',status:'active',date:'2026-11-09',groupCount:2}]);
 const merged=H.merge(H.local([now,backup]),remote);A.equal(merged.length,3);A.equal(merged.filter(r=>r.key==='round:'+now.id).length,1);A.equal(merged.filter(r=>r.backup).length,1);A.equal(H.select(merged,'active').length,3);A.equal(H.select(merged,'all','比赛').length,1);
});
test('score table shows actual strokes and leaving never pauses the group',()=>{
 const r=S.create({courseId:'cn_bg_585'});S.saveScore(r.id,'me',1,{strokes:5});const p=page('score',{id:r.id});A.equal(p.data.tablePlayers[0].total,'5');A.equal(p.data.tablePlayers[0].played,1);p.pause();A.equal(S.getRound(r.id).status,'active');A.equal(routes.at(-1),'/pages/play/index');
});
