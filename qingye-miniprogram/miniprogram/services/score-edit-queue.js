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
function conflicts(key){return wx.getStorageSync(key+'.conflicts')||[];}
function resolve(key,id){wx.setStorageSync(key+'.conflicts',conflicts(key).filter(x=>x.id!==id));}
function reject(key,request,all,reason='组内成绩已变化') {
  const removed=read(key).filter(e=>all||sameCell(e.request,request));
  if(removed.length){
    const existing=conflicts(key),groups=new Map();
    for(const entry of removed){const q=entry.request,id=[q.roundId,q.playerId,q.hole,q.routeRevision,q.physicalHoleId].join(':');const item=groups.get(id)||{id,reason,entries:[],at:Date.now()};item.entries.push(entry);groups.set(id,item);}
    for(const item of groups.values()){const old=existing.find(x=>x.id===item.id);if(old)old.entries.push(...item.entries.filter(e=>!old.entries.some(x=>x.request.mutationId===e.request.mutationId)));else existing.push(item);}
    wx.setStorageSync(key+'.conflicts',existing);
  }
  save(key,read(key).filter(e=>!all&&!sameCell(e.request,request)));
}
module.exports={read,save,overlay,sameCell,acknowledge,reject,conflicts,resolve};
