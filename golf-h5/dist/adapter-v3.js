'use strict';
const R=GolfRules,C=GolfCatalog,S3=GolfService;
const v2Initial=Golf.initial,v2Seeded=Golf.seeded;
Object.assign(Golf,{
 courses:GolfCourseData.courses,
 initial(demo=false){return S3.hydrate(v2Initial(demo),GolfCourseData.courses);},
 seeded(){return S3.hydrate(v2Seeded(),GolfCourseData.courses);},
 makeRound(c,ps,o={}){return S3.newRound(c,ps,{...o,id:Golf.uid(),now:Date.now(),date:o.date||Golf.date(),time:o.time||'08:30'});},
 summary:R.rawSummary,
 validate(s){const n=s?{...s,grossStrokes:s.strokes}:s;if(n&&n.strokes!=null&&['picked_up','skipped'].includes(n.completion))n.completion='holed_out';return R.validateScore(n);},
 setScore(r,pid,n,s){return R.applyOperation(r,{operationId:Golf.uid(),baseRevision:r.revision,time:Date.now(),type:'score',playerId:pid,holeNumber:Number(n),score:s?{...s,grossStrokes:s.strokes}:null});},
 ranking(r){const main=R.evaluateContest(r);const raw=r.players.map(p=>({...p,...R.rawSummary(r,p.id)}));return {rows:raw.map(p=>({...p,rank:r.ruleSnapshot.scoring.type==='stroke_play'&&r.ruleSnapshot.scoring.basis==='gross'&&!r.ruleSnapshot.scoring.cap?.enabled?main.rows?.find(x=>x.id===p.id)?.rank:null})),final:main.final,comparable:main.comparable};},
 stats(d,size=18,days=0){return S3.stats(d,size,days,Date.now(),typeof statsScope==='undefined'?'strict':statsScope);},
 validateBackup(d){return S3.hydrate(d,GolfCourseData.courses);}
});
