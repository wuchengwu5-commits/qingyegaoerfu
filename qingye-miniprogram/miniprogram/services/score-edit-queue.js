// Durable, account-scoped score intents. Never advance a cell version on conflict.
function read(key) {
  const saved = wx.getStorageSync(key);
  return Array.isArray(saved) ? saved : saved?.request ? [saved] : [];
}
function save(key, entries) { wx.setStorageSync(key,entries.length ? entries : null); }
function sameCell(a,b) {
  return a.roundId===b.roundId && a.playerId===b.playerId && a.hole===b.hole &&
    a.routeRevision===b.routeRevision && a.physicalHoleId===b.physicalHoleId;
}
function overlay(round, entries) {
  if (!round || !entries.length) return round;
  const scores = {...round.scores};
  for (const {request:q} of entries) {
    if(q.roundId!==round.id || (q.routeRevision||0)!==(round.courseSnapshot?.routeRevision||0) ||
       !scores[q.playerId] || !round.holes.some(h=>h.number===q.hole && (!q.physicalHoleId || h.id===q.physicalHoleId))) continue;
    scores[q.playerId]={...scores[q.playerId]};
    if(q.score)scores[q.playerId][q.hole]=q.score;else delete scores[q.playerId][q.hole];
  }
  return {...round,scores};
}
function acknowledge(key, request, version) {
  const entries=read(key).filter(e=>e.request.mutationId!==request.mutationId);
  for(const entry of entries) {
    if(!entry.sent && sameCell(entry.request,request) && entry.request.cellVersion===request.cellVersion)
      entry.request.cellVersion=version;
  }
  save(key,entries);
}
function reject(key,request,all) {
  save(key,read(key).filter(e=>!all && !sameCell(e.request,request)));
}
module.exports={read,save,overlay,sameCell,acknowledge,reject};
