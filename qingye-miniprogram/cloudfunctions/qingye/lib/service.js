(function(root){
'use strict';
const R=typeof module!=='undefined'?require('./rules'):root.GolfRules,C=typeof module!=='undefined'?require('./catalog'):root.GolfCatalog;
const clone=R.clone;
function newRound(course,players,options){
 if(!C.canScore(course))throw Error(course.operationStatus==='closed_reported'?'来源标注该球场已关闭，不能新建球局':'缺少完整逐洞Par，请先按现行记分卡补全。');
 const selected=options.segmentIds||C.sections(course).slice(options.holes==='back'?1:0,options.holes==='all'||!options.holes?2:options.holes==='back'?2:1).map(s=>s.id);
 // An explicitly ordered route determines tee-off, including drafts from older clients.
 const start=options.segmentIds?1:(Number(options.start)||1);
 const {holes,playOrder}=C.selectedHoles(course,selected,start),ps=C.playerSnapshots(course,players,holes),rules=clone(options.ruleSnapshot||R.defaultRules());
 if(options.distanceUnit&&!['yd','m'].includes(options.distanceUnit))throw Error('距离单位无效');
 const r={id:options.id,distanceUnit:options.distanceUnit||'yd',schemaVersion:3,status:'active',revision:0,courseId:course.id,courseName:course.name,city:course.city,courseDemo:!!course.demo,photo:course.photo||0,date:options.date,time:options.time,createdAt:options.now,updatedAt:options.now,courseSnapshot:C.snapshot(course,selected),ruleSnapshot:rules,mainContestId:rules.scoring.type==='record_only'?null:'main',holes,playOrder,holeOrder:playOrder,players:ps,scores:Object.fromEntries(ps.map(p=>[p.id,{}])),currentHole:playOrder[0],currentPlayer:ps[0].id,events:[],awards:[],operations:[],changeLog:[],corrections:[]};R.validateRound(r);return r;
}
function personalRecords(data) {
 const records=new Map();
 for(const r of data.rounds||[])if(r.players.some(p=>p.id==='me'))records.set(r.id,{r,pid:'me'});
 for(const x of data.linkedRounds||[]){const old=records.get(x.round.id);if(!x.round.players.some(p=>p.id===x.playerId))continue;
  if(!old||old.r.revision<x.round.revision)records.set(x.round.id,{r:x.round,pid:x.playerId});}
 return [...records.values()].filter(x=>R.isFinished(x.r));
}
function stats(data,size=18,days=0,now=Date.now(),filter='strict') {
 const min=days?new Date(now-days*86400000).toISOString().slice(0,10):'0000';
 const rounds=personalRecords(data).filter(x=>x.r.date>=min),relevant=rounds.filter(x=>x.r.holes.length===size);
 const chosen=relevant.filter(({r,pid})=>filter==='legacy'?r.ruleSnapshot.penaltyPolicy.mode==='legacy_unspecified':filter==='custom'?r.ruleSnapshot.penaltyPolicy.mode!=='official'||r.ruleSnapshot.scoring.cap?.enabled:R.strictEligible(r,pid));
 const complete=chosen.filter(({r,pid})=>R.rawSummary(r,pid).complete),sums=chosen.map(({r,pid})=>R.rawSummary(r,pid)),totals=complete.map(({r,pid})=>R.rawSummary(r,pid).total),sum=k=>sums.reduce((a,s)=>a+s[k],0);
 return {rounds:rounds.length,holes:rounds.reduce((a,{r,pid})=>a+R.rawSummary(r,pid).played,0),best:totals.length?Math.min(...totals):null,average:totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null,complete:complete.length,courseCount:new Set(rounds.map(x=>x.r.courseId)).size,fw:sum('fw'),fwN:sum('fwN'),gir:sum('gir'),girN:sum('girN'),putts:sum('putts'),puttN:sum('puttN'),penalties:sum('penalties'),penaltyN:sum('penaltyN'),trend:complete.sort((a,b)=>a.r.date.localeCompare(b.r.date)).slice(-8).map(({r,pid})=>({date:r.date,total:R.rawSummary(r,pid).total,id:r.id})),types:sums.reduce((o,s)=>{for(const k in o)o[k]+=s.types[k];return o;},{eagle:0,birdie:0,par:0,bogey:0,double:0,other:0})};
}
function hydrate(data,courses){const d=R.migrateV1(data);d.courses=[...clone(courses),...(d.courses||[]).filter(c=>!courses.some(x=>x.id===c.id)&&!c.demo)];d.templates=d.templates||[];d.profile.bio=d.profile.bio||d.profile.goal||'享受每一次挥杆';d.profile.handicap=d.profile.handicap??null;return d;}
function finishRound(r,time,options={}){
 if(!['active','paused'].includes(r.status))return clone(r);
 const n=clone(r),empty=!r.players.some(p=>Object.keys(r.scores[p.id]).length)&&!r.events.length&&!r.awards.length;
 n.status=empty?'cancelled':n.players.every(p=>R.rawSummary(n,p.id).complete)?'finished_complete':'finished_incomplete';
 n.completedAt=time;n.finishedAt=time;n.updatedAt=time;n.revision++;return n;
}
function portableTemplate(rules,players){const out=clone(rules),map=Object.fromEntries(players.map((p,i)=>[p.id,'slot'+i]));out.grouping.teams?.forEach(t=>t.playerIds=t.playerIds.map(id=>map[id]));for(const k of ['totals','perHole'])if(out.handicap[k])out.handicap[k]=Object.fromEntries(Object.entries(out.handicap[k]).map(([id,v])=>[map[id],v]));delete out.handicap.siConfirmed;return out;}
function applyTemplate(template,players){const out=clone(template),map=Object.fromEntries(players.map((p,i)=>['slot'+i,p.id]));out.grouping.teams?.forEach(t=>t.playerIds=t.playerIds.map(id=>map[id]||id));for(const k of ['totals','perHole'])if(out.handicap[k])out.handicap[k]=Object.fromEntries(Object.entries(out.handicap[k]).map(([id,v])=>[map[id]||id,v]));return out;}
function describeResult(r){const m=R.evaluateContest(r);if(r.ruleSnapshot.scoring.type==='record_only')return '仅记分';if(m.result)return m.result;return (m.rows||[]).map(x=>x.name+' '+(x.played?x.total:'—')+(m.unit||'')).join('、')+(m.final?'':'（暂算）');}
const api={newRound,personalRecords,stats,hydrate,finishRound,portableTemplate,applyTemplate,describeResult};if(typeof module!=='undefined')module.exports=api;else root.GolfService=api;
})(typeof globalThis==='undefined'?this:globalThis);
