const {test}=require('node:test'),A=require('node:assert/strict');
const {server,round,op,R,V,C,course,competition,fillBoard,confirmCard}=require('./helpers/closure.cjs');
const Archive=require('../miniprogram/services/round-archive');
function filled(count=1){let r=round(count);for(const p of r.players)for(const h of r.holes)r=op(r,{type:'score',playerId:p.id,holeNumber:h.number,score:{strokes:h.par+(p.id==='me'?0:1)}});return V.finishRound(r,100);}
test('only actual finished holes count as a complete round; empty cancellation is consistent',()=>{
 let r=round();for(const h of r.holes)r=op(r,{type:'score',playerId:'me',holeNumber:h.number,score:{completion:'skipped',reason:'未打'}});
 const ended=V.finishRound(r,10);A.equal(ended.status,'finished_incomplete');A.equal(R.rawSummary(ended,'me').played,0);
 A.equal(V.finishRound(round(),10).status,'cancelled');A.equal(V.finishRound(round(),10,{allowEmpty:true}).status,'cancelled');
 A.throws(()=>op(V.finishRound(round(),10),{type:'score',playerId:'me',holeNumber:1,score:{strokes:4}}),{code:'READ_ONLY'});
});
test('disqualified and withdrawn competitors do not remove valid ranks or create false winners',()=>{
 for(const type of ['disqualified','withdrawn']){let r=filled(3);r={...r,status:'active'};r=op(r,{type:'event',event:{type,contestId:'main',beneficiary:'manual-2',reason:'核对'}});const out=R.evaluateContest(r);A.deepEqual(out.rows.map(p=>p.rank),[1,2,null]);A.equal(out.final,true);}
});
test('my statistics include joined rounds using the participant identity and deduplicate local owner copies',()=>{
 const remote=filled(2);let stats=V.stats({rounds:[],linkedRounds:[{round:remote,playerId:'manual-1'}]},9);A.equal(stats.rounds,1);A.equal(stats.best,R.rawSummary(remote,'manual-1').total);
 stats=V.stats({rounds:[remote],linkedRounds:[{round:remote,playerId:'me'}]},9);A.equal(stats.rounds,1);A.equal(stats.best,R.rawSummary(remote,'me').total);
});
test('ordinary manual seat invitation, common-friend reuse, finish and own/group readonly share form one chain',async()=>{
 const x=await server(),api=x.api;let source=round(2);source=op(source,{type:'score',playerId:'manual-1',holeNumber:1,score:{strokes:5}});
 let board=await api('host','enableBoard',{round:source});const ctx={activityId:board.activityId,groupId:board.groupId};
 const invite=await api('host','invite',{...ctx,kind:'live'});await api('guest','join',{token:invite.token,seatId:'manual-1'});
 board=await api('guest','readBoard',ctx);A.equal(board.round.players.length,2);A.equal(board.round.scores['manual-1'][1].grossStrokes,5);A.equal(board.round.players[1].id,'manual-1');
 A.equal((await api('host','friends')).length,1);
 const next=round(2);next.players[1].accountUid='guest';const added=await api('host','enableBoard',{round:next});A.equal(added.round.players[1].accountUid,'guest');
 await A.rejects(api('guest','createScoreShare',{...ctx,scope:'own'}),{code:'CLOSED'});
 await api('host','finishBoard',{...ctx,version:board.version});
 const own=await api('guest','createScoreShare',{...ctx,scope:'own'}),publicView=await api('unregistered','readScoreShare',{token:own.token});
 A.equal(publicView.players.length,1);A.equal(publicView.players[0].total,'5');A.equal(publicView.players[0].played,1);A.equal(publicView.players[0].scores[1],'—');
 A.equal(JSON.stringify(publicView).includes('accountUid'),false);A.equal(JSON.stringify(publicView).includes('13800000000'),false);
 await A.rejects(api('guest','createScoreShare',{...ctx,scope:'group'}),{code:'FORBIDDEN'});
 const group=await api('host','createScoreShare',{...ctx,scope:'group'});A.equal((await api('unregistered','readScoreShare',group)).players.length,2);
 await A.rejects(api('other','join',{token:group.token}),{code:'EXPIRED'});
 await A.rejects(api('other','scoreCell',{...ctx,roundId:board.round.id,playerId:'me',hole:1,score:{strokes:1},cellVersion:0,mutationId:'attack'}),{code:'FORBIDDEN'});
 await api('host','revoke',{token:group.token});await A.rejects(api('unregistered','readScoreShare',group),{code:'EXPIRED'});
});
test('ended and published competitions reopen only the selected card, require confirmation and version the shared result',async()=>{
 const {api,records}=await server(),ctx=await competition(api,2);await api('host','competitionStart',ctx);let board=await fillBoard(api,'host',ctx);
 await confirmCard(api,ctx,'manual-1');await confirmCard(api,ctx,'manual-2');
 let e=await api('host','competitionGet',ctx);await api('host','competitionEnd',{...ctx,closeVersion:e.closeVersion});
 e=await api('host','competitionGet',ctx);await api('host','competitionResolve',{...ctx,playerId:'manual-1',state:'open',reason:'录入错误',version:e.groups[0].version});
 board=await api('host','readBoard',ctx);A.equal(board.readOnly,false);A.equal(board.correctionOpen,true);A.deepEqual(board.lockedPlayers,['manual-2']);
 const edit={...ctx,roundId:board.round.id,hole:1,score:{strokes:6},mutationId:'after-end'};
 await A.rejects(api('host','scoreCell',{...edit,playerId:'manual-2',cellVersion:board.cells['manual-2:1'].version}),{code:'CLOSED'});
 await api('host','scoreCell',{...edit,playerId:'manual-1',cellVersion:board.cells['manual-1:1'].version});await confirmCard(api,ctx,'manual-1');
 e=await api('host','competitionPublish',ctx);A.equal(e.publicationVersion,1);
 const link=await api('host','createScoreShare',{activityId:ctx.activityId,scope:'competition'}),published=await api('public','readScoreShare',link);
 e=await api('host','competitionGet',ctx);await A.rejects(api('guest','competitionResolve',{...ctx,playerId:'manual-1',state:'open',reason:'无权限'}),{code:'FORBIDDEN'});
 await api('host','competitionResolve',{...ctx,playerId:'manual-1',state:'open',reason:'公布后核对',version:e.groups[0].version});
 const during=await api('public','readScoreShare',link);A.equal(during.status,'revising');A.deepEqual(during.players,published.players);
 board=await api('host','readBoard',ctx);await api('host','scoreCell',{...edit,mutationId:'after-publish',playerId:'manual-1',score:{strokes:7},cellVersion:board.cells['manual-1:1'].version});
 await A.rejects(api('host','competitionPublish',ctx),{code:'INVALID'});await confirmCard(api,ctx,'manual-1');
 e=await api('host','competitionPublish',ctx);A.equal(e.publicationVersion,2);const updated=await api('public','readScoreShare',link);A.equal(updated.updated,true);A.equal(updated.version,2);
 A.equal(Object.values(records()).filter(x=>x.kind==='competition-publication').length,2);
 const first=await api('host','competitionPublication',{...ctx,version:1}),second=await api('host','competitionPublication',{...ctx,version:2});
 A.equal(Number(first.rows.find(p=>p.id==='manual-1').total)+1,Number(second.rows.find(p=>p.id==='manual-1').total));A.equal(second.reason,'公布后核对');
 await A.rejects(api('guest','competitionPublication',{...ctx,version:1}),{code:'FORBIDDEN'});
});
test('friend reservation and manual seat claiming cannot create two entries for the same invited account',async()=>{
 const {api}=await server();const practice=await api('host','enableBoard',{round:round()}),iv=await api('host','invite',{activityId:practice.activityId,groupId:practice.groupId,kind:'live'});await api('guest','join',{token:iv.token,seatId:'+'});
 const ctx=await competition(api,1);await api('host','competitionFriend',{...ctx,uid:'guest',tee:course.tees[0]});
 const invitation=await api('host','competitionInvite',{...ctx,kind:'competition-player'}),shown=await api('guest','invitation',invitation);
 A.equal(shown.canAdd,false);A.equal(shown.seats.length,1);A.equal(shown.seats[0].reserved,true);
 await A.rejects(api('guest','join',{...invitation,seatId:'manual-1',name:'球友',tee:course.tees[0]}),{code:'RESERVED_SEAT'});
 await api('guest','join',{...invitation,seatId:shown.seats[0].id});const event=await api('host','competitionGet',ctx);
 A.equal(event.groups[0].roster.length,2);A.equal(event.groups[0].roster.filter(p=>p.pending).length,0);A.equal(event.groups[0].count,2);
 await api('host','competitionStart',ctx);A.equal((await api('guest','readBoard',ctx)).round.players.length,2);
});
test('shared edits retain a paged audit for members while outsiders cannot inspect it',async()=>{
 const {api}=await server();let board=await api('host','enableBoard',{round:round()});const ctx={activityId:board.activityId,groupId:board.groupId};
 for(let i=0;i<34;i++)board=await api('host','scoreCell',{...ctx,roundId:board.round.id,playerId:'me',hole:1,score:{strokes:4+i%2},cellVersion:board.cells['me:1']?.version||0,mutationId:'audit-'+i});
 let cursor=null,logs=[];do{const page=await api('host','readBoardHistory',{...ctx,cursor});logs.push(...page.items);cursor=page.nextCursor;}while(cursor!=null);
 A.equal(logs.length,34);A.equal(logs[0].actor,'host');A.ok(logs[0].changes.length);await A.rejects(api('other','readBoardHistory',ctx),{code:'FORBIDDEN'});
});
test('conflicting intentions survive restart, including intermediate input and explicit resolution',()=>{
 const Q=require('../miniprogram/services/score-edit-queue'),disk={};global.wx={getStorageSync:k=>structuredClone(disk[k]),setStorageSync:(k,v)=>disk[k]=structuredClone(v)};
 const req={roundId:'r',playerId:'me',hole:1,cellVersion:0,mutationId:'first'};
 Q.save('k',[{request:{...req,score:{strokes:5}}},{request:{...req,mutationId:'second',score:{strokes:6}}},{request:{...req,hole:2,mutationId:'other',score:{strokes:4}}}]);Q.reject('k',req,false,'有人更新');
 A.equal(Q.read('k').length,1);A.deepEqual(Q.conflicts('k')[0].entries.map(e=>e.request.score.strokes),[5,6]);const id=Q.conflicts('k')[0].id;Q.resolve('k',id);A.equal(Q.conflicts('k').length,0);
});
test('a competition being corrected remains visible in ongoing history',()=>{
 const H=require('../miniprogram/services/round-history'),items=H.cloud([],[{id:'revision',title:'已公布赛事',status:'revising',date:'2026-11-11'}]);
 A.equal(H.select(items,'active').length,1);A.equal(H.select(items,'finished').length,0);
});
