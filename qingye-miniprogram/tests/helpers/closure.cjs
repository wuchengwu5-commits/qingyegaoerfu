const {createService}=require('../../cloudfunctions/qingye/domain');
const R=require('../../miniprogram/services/rules'),V=require('../../miniprogram/services/service'),C=require('../../miniprogram/services/catalog');
const course=require('../../miniprogram/services/courses-data').courses.find(c=>c.id==='cn_bg_585');
let serial=0;
function round(count=1,holes=9,type='stroke_play'){
 return V.newRound(course,Array.from({length:count},(_,i)=>({id:i?'manual-'+i:'me',name:i?'手动球友'+i:'本人',isVirtual:i>0,tee:course.tees[0]})),{id:'closure-'+(++serial),now:1,date:'2026-11-11',time:'08:00',segmentIds:C.sections(course).slice(0,holes/9).map(s=>s.id),ruleSnapshot:R.defaultRules(type)});
}
function op(r,fields){return R.applyOperation(r,{...fields,operationId:'op-'+(++serial),baseRevision:r.revision,time:serial});}
async function server(){
 let records={},token=0,clock=1000000,tail=Promise.resolve();
 const adapter=data=>({get:async(c,id)=>structuredClone(data[c+':'+id]),set:async(c,id,v)=>{data[c+':'+id]=structuredClone(v);}});
 const repo={get:async(c,id)=>structuredClone(records[c+':'+id]),transaction(fn){const p=tail.then(async()=>{const next=structuredClone(records),value=await fn(adapter(next));records=next;return value;});tail=p.catch(()=>{});return p;}};
 const api=createService(repo,{now:()=>clock,random:()=>String(++token).padStart(24,'0'),verifyPhone:async()=>({number:'13800000000',verifiedAt:clock})}).dispatch;
 for(const uid of ['host','guest','other','marker'])await api(uid,'phoneLogin');
 return {api,records:()=>records,advance:n=>clock+=n};
}
async function competition(api,count=1){
 const {activityId}=await api('host','competitionCreate',{requestId:'event-'+(++serial),title:'闭环验收赛',date:'2026-11-11',courseId:course.id,segmentIds:[C.sections(course)[0].id]});
 const ctx={activityId,groupId:'a'};
 for(let i=1;i<=count;i++)await api('host','competitionManual',{...ctx,playerId:'manual-'+i,name:'球友'+i,tee:course.tees[0]});
 await api('host','competitionSchedule',{...ctx,time:'08:00',startHole:1});
 return ctx;
}
async function fillBoard(api,actor,ctx){let board=await api(actor,'readBoard',ctx);for(const p of board.round.players)for(const h of board.round.holes)board=await api(actor,'scoreCell',{...ctx,roundId:board.round.id,playerId:p.id,hole:h.number,cellVersion:board.cells[p.id+':'+h.number]?.version||0,score:{strokes:h.par},mutationId:'cell-'+(++serial)});return board;}
async function confirmCard(api,ctx,id){let e=await api('host','competitionGet',ctx);await api('host','competitionConfirm',{...ctx,playerId:id,offline:true,version:e.groups[0].version});e=await api('host','competitionGet',ctx);if(e.groups[0].cards.find(c=>c.playerId===id).state!=='submitted')await api('host','competitionConfirm',{...ctx,playerId:id,version:e.groups[0].version});}
module.exports={server,round,op,R,V,C,course,competition,fillBoard,confirmCard};
