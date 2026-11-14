const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict');
const {round,op,server,course}=require('./helpers/closure.cjs');
const Roster=require('../miniprogram/services/score-roster'),R=require('../miniprogram/services/rules');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),Dialog=require('../miniprogram/services/dialog');
const Board=require('../miniprogram/services/score-board-page'),Patch=require('../miniprogram/services/view-patch');
const Route=require('../miniprogram/services/score-route');
function remove(r,id='manual-1'){return Roster.remove(r,id,{time:123,operationId:'remove-1'});}
test('removal preserves other scores, archives the removed card, resets the selected player and permits a new seat',()=>{
 let r=round(3,18);r=op(r,{type:'score',playerId:'me',holeNumber:1,score:{strokes:4}});r=op(r,{type:'score',playerId:'manual-1',holeNumber:2,score:{strokes:6}});r.currentPlayer='manual-1';
 const before=JSON.stringify(r),next=remove(r);A.equal(JSON.stringify(r),before);A.equal(next.players.length,2);A.deepEqual(next.scores.me,r.scores.me);A.equal(next.scores['manual-1'],undefined);A.equal(next.currentPlayer,'me');
 const record=next.courseSnapshot.rosterArchive[0];A.equal(record.scores[2].grossStrokes,6);A.equal(record.player.id,'manual-1');A.equal(next.revision,r.revision+1);A.equal(next.changeLog.length,0);R.validateRound(next);
 const added=Roster.append(next,{id:'replacement',name:'新球友'});A.equal(added.players.length,3);A.deepEqual(added.courseSnapshot.rosterArchive,[record]);A.throws(()=>Roster.append(next,{id:'manual-1',name:'重试'}),/编号/);
});
test('creator, completed rounds, fixed teams, related awards and minimum Skins players cannot be removed',()=>{
 const r=round(2,18);A.throws(()=>remove(r,'me'),/发起人/);A.throws(()=>remove({...r,status:'cancelled'}),/已结束/);
 const match=round(2,18,'match_play');A.throws(()=>remove(match),/固定/);
 r.ruleSnapshot.sideGames=[{id:'skin',type:'skins',basis:'gross'}];A.throws(()=>remove(r),/至少需要两位/);
 r.ruleSnapshot.sideGames=[];r.awards=[{winnerIds:['manual-1']}];A.throws(()=>remove(r),/裁定或奖项/);
});
test('route archives and handicap entries cannot resurrect removed players or scores',()=>{
 let r=round(3,18);r.ruleSnapshot.scoring.basis='net';r.ruleSnapshot.handicap={mode:'manual_hole',perHole:Object.fromEntries(r.players.map(p=>[p.id,Object.fromEntries(r.holes.map(h=>[h.number,0]))]))};
 r.courseSnapshot.routeArchive={old:{players:{'manual-1':{score:{grossStrokes:7},par:4},me:{score:null,par:4}}}};
 const next=remove(r);A.equal(next.ruleSnapshot.handicap.perHole['manual-1'],undefined);A.equal(next.courseSnapshot.routeArchive.old.players['manual-1'],undefined);A.equal(next.courseSnapshot.rosterArchive[0].routeScores.old.score.grossStrokes,7);
 const simple=remove(round(2,18)),changed=Route.change(simple,course,Route.selected(simple).reverse());A.equal(changed.courseSnapshot.rosterArchive.length,1);
});
async function open(api,r=round(3,18)){const b=await api('host','enableBoard',{round:r});return {b,ref:{activityId:b.activityId,groupId:b.groupId}};}
const request=(b,ref,id='manual-1',mutationId='remove-seat')=>({...ref,roundId:b.round.id,playerId:id,version:b.version,mutationId});
test('shared removal is owner-only, version checked, audited and idempotent across retries',async()=>{
 const {api}=await server(),{b,ref}=await open(api,op(round(3,18),{type:'score',playerId:'manual-1',holeNumber:1,score:{strokes:6}}));
 const invite=await api('host','invite',{...ref,kind:'scorer'});await api('marker','join',invite);
 const current=await api('host','readBoard',ref),req=request(current,ref);
 await A.rejects(api('marker','removePlayer',req),{code:'FORBIDDEN'});await A.rejects(api('host','removePlayer',request(b,ref)),{code:'CONFLICT'});
 const next=await api('host','removePlayer',req),again=await api('host','removePlayer',req);
 A.equal(again.version,next.version);A.equal(next.round.players.length,2);A.equal(next.round.courseSnapshot.rosterArchive[0].scores[1].grossStrokes,6);A.equal(next.playerRemovalSupported,true);
 const history=await api('host','readBoardHistory',ref);A.match(history.items[0].reason,/移除球员/);A.ok(history.items[0].changes.some(c=>c.path[0]==='scores'&&c.before[1].grossStrokes===6));
 await A.rejects(api('host','removePlayer',{...req,playerId:'manual-2'}),{code:'INVALID'});
});
test('new score during confirmation prevents removal without losing either score',async()=>{
 const {api}=await server(),{b,ref}=await open(api),req=request(b,ref);
 await api('host','scoreCell',{...ref,roundId:b.round.id,playerId:'manual-1',hole:1,score:{strokes:5},cellVersion:0,mutationId:'new-score'});
 await A.rejects(api('host','removePlayer',req),{code:'CONFLICT'});
 const current=await api('host','readBoard',ref);A.equal(current.round.players.length,3);A.equal(current.round.scores['manual-1'][1].grossStrokes,5);
});
test('removing a WeChat player revokes editing, restores the host scorer, keeps friends and isolates other groups',async()=>{
 const {api}=await server(),{b,ref}=await open(api),other=await open(api);
 const invite=await api('host','invite',{...ref,kind:'live'});await api('guest','join',{...invite,seatId:'+'});
 await api('host','primaryScorer',{...ref,scorerId:'guest'});
 let current=await api('host','readBoard',ref);const req=request(current,ref,'guest');
 const removed=await api('host','removePlayer',req);A.equal(removed.primaryScorerUid,'host');
 await A.rejects(api('guest','readBoard',ref),{code:'FORBIDDEN'});await A.rejects(api('guest','scoreCell',{...ref,roundId:b.round.id,playerId:'me',hole:1,score:{strokes:4},cellVersion:0,mutationId:'denied'}),{code:'FORBIDDEN'});
 A.equal((await api('host','friends')).some(f=>f.uid==='guest'),true);A.equal((await api('host','readBoard',other.ref)).round.players.length,3);
 await api('guest','join',{...invite,seatId:'+'});current=await api('host','readBoard',ref);A.deepEqual(current.round.scores.guest,{});
 const retry=await api('host','removePlayer',req);A.ok(retry.round.players.some(p=>p.id==='guest'));
 await A.rejects(api('guest','scoreCell',{...ref,roundId:b.round.id,playerId:'guest',hole:1,score:{strokes:7},cellVersion:0,mutationId:'offline-old'}),{code:'CELL_CONFLICT'});
 await A.rejects(api('host','removePlayer',request(current,ref,'me','remove-host')),{code:'INVALID'});
});
let memory,user,original,dialogs,menus,pages,toasts;
beforeEach(()=>{
 memory={};user=null;dialogs=[];menus=[];pages=[];toasts=[];
 global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:o=>toasts.push(o.title),navigateTo(){}};S.init();
 original={user:Account.user,call:Account.call,modal:Dialog.modal,actionSheet:Dialog.actionSheet};Account.user=()=>user;Dialog.modal=o=>dialogs.push(o);Dialog.actionSheet=o=>menus.push(o);
});
afterEach(()=>{pages.forEach(p=>p.onUnload?.());Object.assign(Account,{user:original.user,call:original.call});Object.assign(Dialog,{modal:original.modal,actionSheet:original.actionSheet});});
function localPage(){const r=S.create({courseId:course.id,players:round(3,18).players}),def=require('../miniprogram/services/score-page');const p={...def,data:structuredClone(def.data),setData(x){Patch.apply(this.data,x);}};pages.push(p);p.onLoad({id:r.id});p.onShow();return p;}
test('local management confirms a named player, cancel keeps data and archived scores remain readable',async()=>{
 const p=localPage();S.saveScore(p.rid,'manual-1',1,{strokes:6});p.refresh();p.managePlayers();A.match(menus[0].title,/管理本组/);A.equal(menus[0].itemList[1].disabled,true);menus.shift().success({tapIndex:2});
 const before=JSON.stringify(S.getRound(p.rid));A.match(dialogs[0].title,/手动球友1/);await dialogs.shift().success({confirm:false});A.equal(JSON.stringify(S.getRound(p.rid)),before);
 p.removePlayer('manual-1');await dialogs.shift().success({confirm:true});A.equal(p.data.players.length,2);A.equal(p.data.r.courseSnapshot.rosterArchive,undefined);
 p.removedPlayers();menus.shift().success({tapIndex:0});A.match(dialogs.shift().content,/6/);A.equal(S.getRound(p.rid).courseSnapshot.rosterArchive.length,1);
});
test('a late confirmation after score change, page hide or account switch cannot remove a player',async()=>{
 const p=localPage();p.removePlayer('manual-1');S.saveScore(p.rid,'manual-1',1,{strokes:5});await dialogs.shift().success({confirm:true});A.equal(S.getRound(p.rid).players.length,3);A.match(toasts.at(-1),/更新/);
 p.removePlayer('manual-1');p.onHide();await dialogs.shift().success({confirm:true});A.equal(S.getRound(p.rid).players.length,3);
 p.onShow();p.removePlayer('manual-1');user={uid:'different'};await dialogs.shift().success({confirm:true});A.equal(S.getRound(p.rid).players.length,3);
});
function remotePage(b,ref){user={uid:'host'};const p={...Board,rid:b.round.id,remoteRound:b.round,remoteRef:ref,boardVisible:true,boardOwnerUid:'host',boardVersion:b.version,playerRemovalSupported:true,data:{liveBoard:true,players:b.round.players},setData(x){Object.assign(this.data,x);},refresh(){this.data.players=this.remoteRound.players;}};return p;}
test('a lost removal response retries the same request and changes the visible roster only after acknowledgement',async()=>{
 const {api}=await server(),{b,ref}=await open(api),p=remotePage(b,ref);let first=true,calls=[];
 Account.call=async(action,input)=>{calls.push(structuredClone(input));const result=await api('host',action,input);if(first){first=false;throw Error('网络中断');}return result;};
 p.removePlayer('manual-1');await dialogs.shift().success({confirm:true});A.equal(p.remoteRound.players.length,3);A.match(p.data.boardError,/待确认/);A.ok(wx.getStorageSync(p.removalKey(ref)));
 await p.submitRemoval(ref);A.equal(p.remoteRound.players.length,2);A.equal(memory[p.removalKey(ref)],null);A.deepEqual(calls[1],calls[0]);A.equal(p.data.joiningBusy,false);
});
test('old servers, pending scores and changed accounts never perform a silent local-only removal',async()=>{
 const {api}=await server(),{b,ref}=await open(api),p=remotePage(b,ref);p.playerRemovalSupported=false;Account.call=async()=>({...b,playerRemovalSupported:false});await p.removePlayer('manual-1');A.equal(dialogs.length,0);A.match(toasts.at(-1),/暂未启用/);
 p.playerRemovalSupported=true;wx.setStorageSync(require('../miniprogram/services/shared-round').pendingKey(ref),[{request:{}}]);p.removePlayer('manual-1');A.equal(dialogs.length,0);A.match(toasts.at(-1),/同步/);
 wx.setStorageSync(require('../miniprogram/services/shared-round').pendingKey(ref),null);let resolve;Account.call=()=>new Promise(r=>resolve=r);p.removePlayer('manual-1');const saving=dialogs.shift().success({confirm:true});user={uid:'different'};resolve({...b,round:remove(b.round)});await saving;A.equal(p.remoteRound.players.length,3);A.ok(memory['qingye.removePlayer.host.'+ref.activityId+'.'+ref.groupId]);
});
test('an already open page refreshes an old capability flag and shows confirmation without deleting anything',async()=>{
 const {api}=await server(),{b,ref}=await open(api),p=remotePage(b,ref),actions=[];p.playerRemovalSupported=false;
 Account.call=async(action,input)=>{actions.push(action);return api('host',action,input);};
 await p.removePlayer('manual-1');A.equal(p.playerRemovalSupported,true);A.deepEqual(actions,['readBoard']);A.equal(dialogs.length,1);A.match(dialogs[0].title,/移除/);A.equal(p.remoteRound.players.length,3);A.equal(p.data.joiningBusy,false);
});
test('capability refresh does not open a removal dialog after logout or a failed connection',async()=>{
 const {api}=await server(),{b,ref}=await open(api),p=remotePage(b,ref);p.playerRemovalSupported=false;
 Account.call=async()=>{throw Error('网络未连接');};await p.removePlayer('manual-1');A.match(toasts.at(-1),/网络未连接/);A.equal(dialogs.length,0);A.equal(p.data.joiningBusy,false);
 let resolve;Account.call=()=>new Promise(r=>resolve=r);const reading=p.removePlayer('manual-1');user={uid:'other'};resolve(b);await reading;A.equal(dialogs.length,0);A.equal(p.playerRemovalSupported,false);
});
test('a removed member cannot continue entering scores after the next board refresh',async()=>{
 const {api}=await server(),{ref}=await open(api),invite=await api('host','invite',{...ref,kind:'live'});await api('guest','join',{...invite,seatId:'+'});
 const b=await api('guest','readBoard',ref),p=remotePage(b,ref);user={uid:'guest'};Account.call=(action,input)=>api('guest',action,input);
 await api('host','removePlayer',request(b,ref,'guest'));await p.pollBoard();A.equal(p.data.scoreLocked,true);A.equal(p.boardReadOnly,true);
 A.equal(await p.writeCell({strokes:5},{playerId:'me',hole:1}),false);
});
