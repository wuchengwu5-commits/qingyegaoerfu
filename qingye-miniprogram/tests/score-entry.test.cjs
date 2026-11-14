const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),Entry=require('../miniprogram/services/score-entry'),Patch=require('../miniprogram/services/view-patch');
let memory,routes,pages,user,originalUser;
const round=()=>S.create({courseId:'cn_bg_585'});
function page(name,options={}){let def;global.Page=x=>def=x;const f=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[f];require(f);const p={...def,route:'pages/'+name+'/index',data:structuredClone(def.data||{}),setData(d){Patch.apply(this.data,d);}};pages=[p];p.onLoad?.(options);p.onShow?.();return p;}
beforeEach(()=>{memory={};routes=[];pages=[];user=null;originalUser=Account.user;Account.user=()=>user;Entry.consume();global.getCurrentPages=()=>pages;global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),switchTab:o=>routes.push(['tab',o.url]),navigateTo:o=>routes.push(['push',o.url]),redirectTo:o=>routes.push(['replace',o.url]),showToast(){},pageScrollTo(){}};S.init();});
afterEach(()=>{Account.user=originalUser;delete global.getCurrentPages;Entry.consume();});
test('course shortcut traverses scoring tab to the same fresh form with that course already selected',()=>{
 const one=round();S.saveScore(one.id,'me',2,{strokes:6});page('course',{id:'cn_bg_2525'}).start();A.deepEqual(routes.pop(),['tab','/pages/play/index']);
 const hub=page('play');A.deepEqual(routes.pop(),['push','/pages/create/index?fresh=1&course=cn_bg_2525']);A.equal(hub.data.scoreTargets.length,0);
 const form=page('create',{fresh:'1',course:'cn_bg_2525'});A.equal(form.data.course.id,'cn_bg_2525');A.equal(form.data.step,1);A.equal(S.getRound(one.id).scores.me[2].grossStrokes,6);
 form.next();form.next();form.start();A.deepEqual(routes.pop(),['tab','/pages/play/index']);const next=page('play');A.equal(next.data.scoreTargets[0].options.id,S.active().id);A.equal(S.read().rounds.length,2);A.equal(S.getRound(one.id).status,'active');
});
test('remembered group, physical hole and player survive runtime restart and other groups are untouched',()=>{
 const first=round(),second=round();const r=S.getRound(first.id);r.currentHole=5;S.replace(r);Entry.remember({id:r.id},r);const before=JSON.stringify(S.read().rounds);
 delete require.cache[require.resolve('../miniprogram/services/score-entry')];const cold=require('../miniprogram/services/score-entry');require.cache[require.resolve('../miniprogram/services/score-entry')].exports=Entry;A.equal(cold.target().id,first.id);A.equal(S.getRound(cold.target().id).currentHole,5);A.equal(JSON.stringify(S.read().rounds),before);
 Entry.remember({id:second.id},second);A.equal(Entry.target().id,second.id);S.finish(second.id,{allowEmpty:true});A.equal(Entry.target().id,first.id);
});
test('scoring tab renders live score directly, explicit group list stays open, tab tap resumes it',()=>{
 const r=round();Entry.remember({id:r.id},r);const p=page('play');A.equal(p.data.scoreTargets[0].options.id,r.id);A.equal(routes.length,0);
 let scrolls=0;wx.pageScrollTo=()=>scrolls++;Entry.resume();A.equal(scrolls,0);
 p.showHub();p.onShow();A.equal(p.data.scoreTargets.length,0);Entry.resume();A.equal(p.data.scoreTargets[0].options.id,r.id);p.choose();A.equal(p.data.scoreTargets.length,0);A.equal(routes.at(-1)[1],'/pages/create/index?fresh=1');
});
test('ordinary cold and warm launcher entries resume while shares, scans, login and drafts keep their own destination',()=>{
 const r=round();Entry.remember({id:r.id},r);Entry.onAppShow({scene:1001,path:'pages/home/index'});A.equal(routes.length,0);pages=[{route:'pages/home/index'}];Entry.handleAppEntry();A.equal(routes.at(-1)[1],'/pages/play/index');Entry.consume();routes=[];
 for(const route of ['pages/create/index','pages/account/index','pages/result/index','packages/competition/index','pages/groups/index']){pages=[{route}];Entry.onAppShow({scene:1089,path:'pages/home/index'});A.equal(routes.length,0);}
 pages=[{route:'pages/home/index'}];for(const o of [{scene:1007,path:'pages/home/index'},{scene:1047,path:'pages/groups/index',query:{token:'invite'}},{scene:1001,path:'pages/share-view/index',query:{token:'share'}},{scene:1001,path:'pages/home/index',query:{from:'share'}}]){Entry.onAppShow(o);Entry.handleAppEntry();A.equal(routes.length,0);}
 Entry.onAppShow({scene:1089,path:'pages/home/index'});A.equal(routes.at(-1)[1],'/pages/play/index');
});
test('ended rounds, backup copies and another account never auto-resume; no data is deleted',()=>{
 user={uid:'first'};S.mutate(d=>d.profile.accountUid='first');const r=round();Entry.remember({id:r.id},r);user={uid:'second'};A.equal(Entry.target(),null);user=null;A.equal(Entry.target(),null);user={uid:'first'};A.equal(Entry.target().id,r.id);
 const copy=S.getRound(r.id);copy.conflictSourceId='old';S.replace(copy);A.equal(Entry.target(),null);A.equal(S.getRound(r.id).id,r.id);
});
test('cloud teammate cursor restores by physical hole, not stale sequence, and never crosses accounts',()=>{
 user={uid:'player'};const r=round();r.currentHole=3;const physical=r.holes[2].id;Entry.remember({activity:'a',group:'g'},r);A.deepEqual(Entry.target(),{activity:'a',group:'g',id:r.id});
 const moved=structuredClone(r);moved.holes[2].number=7;moved.currentHole=1;const restored=Entry.restoreCursor({activity:'a',group:'g'},moved);A.equal(restored.holes.find(h=>h.id===physical).number,restored.currentHole);A.equal(Entry.restoreCursor({activity:'b',group:'g'},moved),null);user={uid:'other'};A.equal(Entry.saved(),null);
});
test('resume preference storage failures cannot prevent scoring or creation',()=>{
 const r=round();const set=wx.setStorageSync;wx.setStorageSync=()=>{throw Error('storage full');};A.doesNotThrow(()=>Entry.remember({id:r.id},r));wx.setStorageSync=set;S.saveScore(r.id,'me',1,{strokes:5});A.equal(S.getRound(r.id).scores.me[1].grossStrokes,5);
});
test('local score notifications do not reload the group list or cloud lists on every stroke',()=>{
 const P=require('../miniprogram/services/personal-sync'),original=P.subscribe,listeners=[];
 P.subscribe=fn=>{listeners.push(fn);return()=>{};};
 try{round();const p=page('play');let reloads=0;p.onShow=()=>reloads++;listeners[0]();listeners[0]();A.equal(reloads,0);p.showHub();listeners[0]();A.equal(reloads,1);}finally{P.subscribe=original;}
});
