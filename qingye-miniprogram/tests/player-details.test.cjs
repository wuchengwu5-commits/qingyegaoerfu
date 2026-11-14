const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict');
const {round,op,server,course}=require('./helpers/closure.cjs'),D=require('../miniprogram/services/player-details'),View=require('../miniprogram/services/score-view'),Route=require('../miniprogram/services/score-route'),V=require('../miniprogram/services/service');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),Dialog=require('../miniprogram/services/dialog');
const change=(r,id,name,tee,operationId='details-1')=>D.edit(r,course,id,{name,tee},{operationId,baseRevision:r.revision,time:999});
test('player tabs distinguish tee colors, default names and real duplicate names without mutating snapshots',()=>{
 const r=round(4,18);r.players.forEach((p,i)=>{p.name=i<2?'高球爱好者':'欧阳';p.tee=['Blue','White','Red','Gold'][i];p.teeName=p.tee;});const before=JSON.stringify(r);
 const rows=View.table(r,p=>p.id==='me'?'我':p.name).players;A.deepEqual(rows.map(p=>p.name),['我','球友 2','欧阳 · 3','欧阳 · 4']);A.deepEqual(rows.map(p=>p.teeColor),['#4086c6','#ffffff','#d65a55','#cba34e']);A.equal(JSON.stringify(r),before);
});
test('a round alias survives live profile refresh while tee changes preserve scores, pars, SI, IDs and route',()=>{
 let r=round(2,18);r.players[1].accountUid='guest';r=op(r,{type:'score',playerId:r.players[1].id,holeNumber:1,score:{strokes:6,putts:2}});
 const id=r.players[1].id,tee=course.tees.find(t=>t!==r.players[1].tee),n=change(r,id,'欧阳',tee);
 A.deepEqual(n.scores,r.scores);A.deepEqual(n.holes,r.holes);A.deepEqual(n.playOrder,r.playOrder);A.deepEqual(n.players[1].holePars,r.players[1].holePars);A.deepEqual(n.players[1].holeSI,r.players[1].holeSI);A.equal(n.players[1].accountUid,'guest');A.equal(n.players[1].id,id);
 const data=course.teeData.find(t=>t.name===tee);A.equal(n.players[1].holeDistances[1],data.distances[n.holes[0].id]);A.equal(View.table(n,p=>p.name,[{uid:'guest',name:'高球爱好者'}]).players[1].name,'欧阳');A.equal(n.revision,r.revision+1);A.match(n.changeLog.at(-1).reason,/修改组员资料/);
});
test('finished scorecards remain ended after member corrections and invalid edits are rejected atomically',()=>{
 let r=round(2,18);r=op(r,{type:'score',playerId:'me',holeNumber:1,score:{strokes:5}});r=V.finishRound(r,12);
 const n=change(r,r.players[1].id,'王先生',course.tees[1]);A.equal(n.status,r.status);A.equal(n.finishedAt,r.finishedAt);A.deepEqual(n.scores,r.scores);A.equal(n.changeLog.at(-1).kind,'correction');
 const before=JSON.stringify(r);A.throws(()=>change(r,'me','',course.tees[0]),/1–20/);A.throws(()=>change(r,'me','我','不存在'),/发球台/);A.throws(()=>D.edit(r,course,'me',{name:'甲',tee:course.tees[0]},{operationId:'x',baseRevision:r.revision-1}),/更新/);A.equal(JSON.stringify(r),before);
});
test('changing Tee updates archived physical holes so returning to a previous route does not restore old distances',()=>{
 const c=require('../miniprogram/services/courses-data').courses.find(c=>c.id==='cn_bg_577'),sections=require('../miniprogram/services/catalog').sections(c);let r=V.newRound(c,[{id:'me',name:'我',tee:c.tees[0]}],{id:'tee-route',segmentIds:sections.slice(0,2).map(s=>s.id),now:1,date:'2026-11-13'});
 r=op(r,{type:'score',playerId:'me',holeNumber:1,score:{strokes:5}});const physical=r.holes[0].id;
 r=Route.change(r,c,[sections[1].id,sections[2].id]);const tee=c.tees[1];r=D.edit(r,c,'me',{name:'张先生',tee},{operationId:'tee-archive',baseRevision:r.revision});r=Route.change(r,c,[sections[0].id,sections[1].id]);
 A.equal(r.scores.me[1].grossStrokes,5);A.equal(r.players[0].holeDistances[1],c.teeData.find(t=>t.name===tee).distances[physical]);A.equal(View.table(r,p=>p.name).players[0].name,'张先生');
});
test('existing owner sync preserves aliases and Tee, rejects another member and stale writes, and retries only once',async()=>{
 const {api}=await server();let r=round(2,18);r.players[1].name='高球爱好者';const board=await api('host','enableBoard',{round:r}),ref={activityId:board.activityId,groupId:board.groupId};
 const next=change(board.round,board.round.players[1].id,'陈先生',course.tees[1]);const request={...ref,expectedVersion:board.version,round:next,mutationId:'member-change',reason:'修改组员资料'};
 await A.rejects(api('other','saveRound',request),e=>e.code==='FORBIDDEN');const out=await api('host','saveRound',request),retry=await api('host','saveRound',request);A.equal(out.version,retry.version);
 const synced=await api('host','readBoard',ref);A.equal(synced.round.players[1].tee,course.tees[1]);A.equal(View.table(synced.round,p=>p.name,synced.profiles).players[1].name,'陈先生');A.deepEqual(synced.round.scores,r.scores);
 await A.rejects(api('host','saveRound',{...request,mutationId:'stale'}),e=>e.code==='CONFLICT');
});
let memory,user,originalUser,pages;
beforeEach(()=>{memory={};user=null;pages=[];global.wx={getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast(){},navigateTo(){}};S.init();originalUser=Account.user;Account.user=()=>user;});
afterEach(()=>{Account.user=originalUser;pages.forEach(p=>p.onUnload());delete global.Page;});
async function page(id){let def;global.Page=d=>def=d;const file=require.resolve('../miniprogram/pages/players/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}};pages.push(p);p.onLoad({id});p.visible=true;await p.load();return p;}
const ev=id=>({currentTarget:{dataset:{id}}});
test('member form cancel never saves; confirmed nickname and Tee update only the chosen round',async()=>{
 const one=S.create({courseId:course.id}),two=S.create({courseId:course.id}),p=await page(one.id),before=JSON.stringify(S.read().rounds);p.editPlayer(ev('me'));p.changeTee({detail:{value:1}});p.cancelEdit();A.equal(JSON.stringify(S.read().rounds),before);
 p.editPlayer(ev('me'));p.setData({editor:{...p.data.editor,name:'吴先生',tee:course.tees[1]}});await p.save();A.equal(S.getRound(one.id).players[0].name,'吴先生');A.equal(S.getRound(one.id).players[0].tee,course.tees[1]);A.equal(S.getRound(two.id).revision,0);A.equal(p.data.editor,null);
});
test('stale form, changed login and late popup results cannot overwrite current records',async()=>{
 const r=S.create({courseId:course.id}),p=await page(r.id);p.editPlayer(ev('me'));p.setData({editor:{...p.data.editor,name:'旧输入'}});S.saveScore(r.id,'me',1,{strokes:6});await p.save();A.match(p.data.error,/已有更新/);A.equal(S.getRound(r.id).scores.me[1].grossStrokes,6);
 await p.load();p.editPlayer(ev('me'));user={uid:'other'};await p.save();A.match(p.data.error,/账号已变化/);user=null;
 let popup;const original=Dialog.modal;Dialog.modal=o=>popup=o;try{p.editName();p.onHide();popup.success({confirm:true,content:'迟到输入'});A.notEqual(p.data.editor.name,'迟到输入');}finally{Dialog.modal=original;}
});
test('another account cannot edit owned local round metadata',async()=>{
 const r=S.create({courseId:course.id});r.ownerUid='owner';S.replace(r);user={uid:'other'};const p=await page(r.id);A.equal(p.data.canManage,false);p.editPlayer(ev('me'));A.equal(p.data.editor,null);
});

test('changing only Tee does not freeze an account nickname into a round alias',()=>{
 const r=round(2,18);r.players[1].name='高球爱好者';r.players[1].accountUid='guest';
 const n=D.edit(r,course,r.players[1].id,{tee:course.tees[1]},{operationId:'tee-only',baseRevision:r.revision});
 A.equal(n.courseSnapshot.playerNames,undefined);A.equal(View.table(n,p=>p.name,[{uid:'guest',name:'更新昵称'}]).players[1].name,'更新昵称');
});

test('round aliases edited inside a correction draft survive the final correction commit',()=>{
 const r=S.create({courseId:course.id});S.saveScore(r.id,'me',1,{strokes:5});S.finish(r.id);S.startEdit(r.id);
 const working=S.getRound(r.id),changed=D.edit(working,course,'me',{name:'新称呼',tee:working.players[0].tee},{operationId:'draft-alias',baseRevision:working.revision});S.replace(changed);S.commitEdit('更正称呼');
 const saved=S.getRound(r.id);A.equal(saved.courseSnapshot.playerNames.me,'新称呼');A.equal(saved.status,'finished_incomplete');A.equal(saved.scores.me[1].grossStrokes,5);
});
