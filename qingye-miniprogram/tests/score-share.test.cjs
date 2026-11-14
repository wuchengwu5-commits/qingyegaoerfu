const {test}=require('node:test'),A=require('node:assert/strict'),path=require('node:path');
const {round,op,R,V}=require('./helpers/closure.cjs');
const backend=process.env.QY_SHARE_BACKEND||path.resolve(__dirname,'../cloudfunctions/qingye');
const {createService}=require(path.join(backend,'domain'));
async function setup(){let records={},serial=0,clock=1000000;const adapter=db=>({async get(c,id){return structuredClone(db[c+':'+id]);},async set(c,id,v){db[c+':'+id]=structuredClone(v);}});const repo={...adapter(records),async transaction(fn){return fn(adapter(records));}};const api=createService(repo,{now:()=>clock,random:()=>String(++serial).padStart(24,'0'),verifyPhone:async()=>({number:'13800000000',verifiedAt:clock})}).dispatch;for(const uid of ['host','guest','outsider'])await api(uid,'phoneLogin');return {api,records,advance:()=>clock+=31*86400000};}
function finished(){return V.finishRound(op(round(2,18),{type:'score',playerId:'me',holeNumber:1,score:{strokes:5}}),100);}
test('personal own/group shares can be read without phone login, preserve blank holes and grant no membership',async()=>{
 const x=await setup(),r=finished();await x.api('host','savePersonalRound',{round:r,expectedVersion:0,mutationId:'save'});
 for(const scope of ['own','group']){const link=await x.api('host','createScoreShare',{roundId:r.id,scope});const view=await x.api('visitor','readScoreShare',link);A.equal(view.players.length,scope==='own'?1:2);A.equal(view.players[0].total,'5');A.equal(view.players[0].scores[1],'—');A.equal(view.expiresAt,1000000+30*86400000);A.doesNotMatch(JSON.stringify(view),/accountUid|ownerUid|13800000000|handicapInputs|changeLog/);await A.rejects(x.api('guest','join',link),{code:'EXPIRED'});}
 await A.rejects(x.api('outsider','createScoreShare',{roundId:r.id,scope:'group'}),{code:'NOT_FOUND'});await A.rejects(x.api('visitor','createScoreShare',{roundId:r.id,scope:'own'}),{code:'AUTH_REQUIRED'});
});
test('shared group view requires owner, follows saved corrections, supports revoke and expiry',async()=>{
 const x=await setup();let b=await x.api('host','enableBoard',{round:round(2,18)});const ref={activityId:b.activityId,groupId:b.groupId};
 const invite=await x.api('host','invite',{...ref,kind:'live'});await x.api('guest','join',{token:invite.token,seatId:'manual-1'});b=await x.api('host','readBoard',ref);
 await A.rejects(x.api('host','createScoreShare',{...ref,scope:'group'}),{code:'CLOSED'});
 const completed={...finished(),id:b.round.id,players:b.round.players};await x.api('host','saveRound',{...ref,round:completed,expectedVersion:b.version,mutationId:'finish'});
 const own=await x.api('guest','createScoreShare',{...ref,scope:'own'});A.equal((await x.api('visitor','readScoreShare',own)).players.length,1);await A.rejects(x.api('guest','createScoreShare',{...ref,scope:'group'}),{code:'FORBIDDEN'});
 const group=await x.api('host','createScoreShare',{...ref,scope:'group'});A.equal((await x.api('visitor','readScoreShare',group)).players.length,2);await A.rejects(x.api('guest','revoke',group),{code:'FORBIDDEN'});
 const current=await x.api('host','readBoard',ref);const corrected=structuredClone(current.round);corrected.revision++;corrected.scores.me[1]={...corrected.scores.me[1],grossStrokes:6,strokes:6};await x.api('host','saveRound',{...ref,round:corrected,expectedVersion:current.version,mutationId:'correct'});
 const changed=await x.api('visitor','readScoreShare',group);A.equal(changed.players[0].total,'6');A.equal(changed.updated,true);await x.api('host','revoke',group);await A.rejects(x.api('visitor','readScoreShare',group),{code:'EXPIRED'});x.advance();await A.rejects(x.api('visitor','readScoreShare',own),{code:'EXPIRED'});
});
test('malformed, invitation and unsupported scope inputs never create readable scores',async()=>{
 const x=await setup();await A.rejects(x.api('visitor','readScoreShare',{token:'bad'}),{code:'INVALID'});await A.rejects(x.api('host','createScoreShare',{scope:'invalid'}),{code:'INVALID'});await A.rejects(x.api('visitor','readScoreShare',{token:'0'.repeat(24)}),{code:'EXPIRED'});
});
