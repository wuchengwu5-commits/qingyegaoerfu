const Dialog = require('../miniprogram/services/dialog');
const {test,beforeEach}=require('node:test'),A=require('node:assert/strict');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),H=require('../miniprogram/services/round-history');
let memory,routes,toasts;
function page(name,options={}){let def;global.Page=p=>def=p;const file=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data||{}),setData(x){require('../miniprogram/services/view-patch').apply(this.data,x);}};p.onLoad?.(options);p.onShow?.();return p;}
const ev=id=>({currentTarget:{dataset:{id}}});
beforeEach(()=>{require('../miniprogram/services/score-entry').consume();memory={};routes=[];toasts=[];Dialog.modal=o=>o.success({confirm:true,content:'李先生'});global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),navigateTo:o=>routes.push(o.url),redirectTo:o=>routes.push(o.url),switchTab:o=>routes.push(o.url),showToast:o=>toasts.push(o.title),pageScrollTo(){}};S.init();});
test('normal creation has no automatic testers; steps, manual players, Tee and invite preference survive page re-entry',()=>{
 const p=page('create',{course:'cn_bg_585'});A.equal(p.data.draft.players.length,1);A.equal(p.data.step,1);
 p.next();A.equal(p.data.step,2);p.temp();const id=p.data.draft.players[1].id;
 p.tee({currentTarget:{dataset:{pid:id}},detail:{value:2}});p.inviteToggle({detail:{value:true}});p.next();A.equal(p.data.step,3);
 const before=structuredClone(S.read().draft),again=page('create',{course:'cn_bg_585'});A.deepEqual(S.read().draft,before);A.equal(again.data.step,3);again.start();
 const round=S.active();A.equal(round.players.length,2);A.equal(round.players[1].tee,'White');A.equal(routes.at(-1),'/pages/play/index');A.equal(require('../miniprogram/services/score-entry').consume().options.invite,'1');A.equal(S.read().draft,null);A.equal(toasts.length,0);
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
test('new group starts with a blank course step and does not replace an existing round or draft before selection',()=>{
 const old=S.create({courseId:'cn_bg_585'});page('create',{course:'cn_bg_585'});const draft=structuredClone(S.read().draft);
 const hub=page('play');hub.choose();A.equal(routes.at(-1),'/pages/create/index?fresh=1');
 const p=page('create',{fresh:'1'});A.equal(p.data.ready,true);A.equal(p.data.course,null);A.deepEqual(S.read().draft,draft);
 p.setStep(ev(3));A.equal(p.data.step,1);p.start();A.equal(S.read().rounds.length,1);
 p.next();A.match(routes.at(-1),/^\/packages\/competition\/course-picker\?context=round/);
 p.onShow();A.equal(p.data.course,null);A.deepEqual(S.read().draft,draft);
 p.chooseCourse('cn_bg_577');A.equal(p.data.course.id,'cn_bg_577');A.equal(p.data.step,1);A.equal(S.read().rounds[0].id,old.id);
});
test('returning from course selection keeps the roster, resets hole-bound options, and can create a second independent group',()=>{
 const first=S.create({courseId:'cn_bg_585'});const p=page('create',{fresh:'1'});p.chooseCourse('cn_bg_577');p.next();p.temp();const player=p.data.draft.players[1].id;p.inviteToggle({detail:{value:true}});
 p.change(d=>{d.ruleSnapshot.handicap={mode:'manual_hole',perHole:{}};d.ruleSnapshot.sideGames=[{id:'old-route'}];});
 p.chooseCourse('cn_bg_2525');A.equal(p.data.draft.players[1].id,player);A.equal(p.data.draft.players[1].name,'李先生');A.equal(p.data.inviteAfterStart,true);A.equal(p.data.step,1);A.equal(p.data.draft.ruleSnapshot.handicap.mode,'none');A.equal(p.data.draft.ruleSnapshot.sideGames.length,0);
 const selected=structuredClone(p.data.draft);p.chooseCourse('cn_bg_2525');A.deepEqual(p.data.draft,selected);p.onShow();A.deepEqual(p.data.draft,selected);
 p.next();p.next();p.start();A.equal(S.read().rounds.length,2);A.ok(S.read().rounds.some(r=>r.id===first.id));A.equal(S.read().rounds[0].players.length,2);
});
test('a completed course picker cannot update an unloaded creation page',()=>{
 const p=page('create',{fresh:'1'});let navigation;const original=wx.navigateTo;wx.navigateTo=o=>navigation=o;
 try{p.openCoursePicker();p.onUnload();navigation.events.courseSelected({id:'cn_bg_2525'});A.equal(S.read().draft,undefined);}finally{wx.navigateTo=original;}
});
