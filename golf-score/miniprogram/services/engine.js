const R=require('./rules');
function ranking(r){const out=R.evaluateContest(r);return r.players.map(p=>({...p,...R.rawSummary(r,p.id),rank:r.ruleSnapshot.scoring.type==='stroke_play'&&r.ruleSnapshot.scoring.basis==='gross'&&!r.ruleSnapshot.scoring.cap?.enabled?out.rows?.find(x=>x.id===p.id)?.rank||'—':'—'}));}
function setScore(r,pid,n,s){return R.applyOperation(r,{type:'score',operationId:Date.now().toString(36)+Math.random(),time:Date.now(),baseRevision:r.revision,playerId:pid,holeNumber:n,score:s?{...s,grossStrokes:s.strokes,green:s.green??null}:null});}
module.exports={...R,validate:R.validateScore,summary:R.rawSummary,ranking,setScore};
