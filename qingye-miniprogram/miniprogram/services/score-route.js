// Route edits remap every hole-bound value by its physical course hole ID.
// The numeric position remains 1..18 for the scoring engine and map pages.
const R = require('./rules');
const C = require('./catalog');
const key = h => h.id || [h.sectionId, h.label].join(':');
function orderedHoles(round) {
  return R.order(round).map(n => round.holes.find(h => h.number === n)).filter(Boolean);
}
function selected(round) {
  return [...new Set(orderedHoles(round).map(h => h.sectionId))];
}
function sections(round, course) {
  const list = C.sections(course || {}).map(s => R.clone(s));
  for (const section of round.courseSnapshot?.sections || []) {
    const i = list.findIndex(s => s.id === section.id);
    if (i < 0) list.push(R.clone(section)); else list[i] = R.clone(section);
  }
  return list.filter(s => s.holes?.length === 9 && s.holes.every(h => [3,4,5,6].includes(h.par)));
}
function change(round, course, segmentIds, time = Date.now()) {
  if (R.isFinished(round)) throw Error('已结束的球局不能调整路线');
  if (segmentIds.length !== round.holes.length / 9) throw Error('请保持本轮球洞数量');
  const catalog = {...course, segments:sections(round, course)};
  const next = R.clone(round), bank = R.clone(round.courseSnapshot?.routeArchive || {});
  const currentKey = key(round.holes.find(h => h.number === round.currentHole) || round.holes[0]);
  const scopedGames = round.ruleSnapshot.sideGames.filter(g => g.holeNumbers);
  for (const hole of round.holes) {
    const n = hole.number;
    bank[key(hole)] = {
      players:Object.fromEntries(round.players.map(p => [p.id, {
        score:round.scores[p.id][n] || null, par:R.par(round,p.id,n), si:R.si(round,p.id,n),
        distance:p.holeDistances?.[n] ?? null, allowance:round.ruleSnapshot.handicap.perHole?.[p.id]?.[n] ?? null
      }])),
      events:(round.events || []).filter(e => e.holeNumber === n),
      awards:(round.awards || []).filter(e => e.holeNumber === n),
      games:scopedGames.filter(g => g.holeNumbers.includes(n)).map(g => g.id)
    };
  }
  const route = C.selectedHoles(catalog, segmentIds);
  next.holes = route.holes;
  next.playOrder = route.playOrder;
  next.holeOrder = [...route.playOrder];
  next.players = C.playerSnapshots(catalog, round.players, next.holes);
  next.scores = Object.fromEntries(next.players.map(p => [p.id, {}]));
  next.events = (round.events || []).filter(e => e.holeNumber == null);
  next.awards = [];
  for (const game of next.ruleSnapshot.sideGames) if (game.holeNumbers) game.holeNumbers = [];
  if (next.ruleSnapshot.handicap.mode === 'manual_hole') next.ruleSnapshot.handicap.perHole = {};
  for (const hole of next.holes) {
    const saved = bank[key(hole)], n = hole.number;
    for (const player of next.players) {
      const old = saved?.players[player.id];
      if (old) {
        if (old.score) next.scores[player.id][n] = R.clone(old.score);
        player.holePars[n] = old.par;
        player.holeSI[n] = old.si;
        player.holeDistances[n] = old.distance;
      }
      if (next.ruleSnapshot.handicap.mode === 'manual_hole') {
        if (old?.allowance == null) throw Error('新场区尚未设置逐洞让杆，请先在开局设置中确认');
        (next.ruleSnapshot.handicap.perHole[player.id] ||= {})[n] = old.allowance;
      }
    }
    next.events.push(...(saved?.events || []).map(e => ({...e,holeNumber:n})));
    next.awards.push(...(saved?.awards || []).map(e => ({...e,holeNumber:n})));
    for (const game of next.ruleSnapshot.sideGames) if (game.holeNumbers && saved?.games.includes(game.id)) game.holeNumbers.push(n);
  }
  if (next.ruleSnapshot.sideGames.some(g => g.holeNumbers && !g.holeNumbers.length)) throw Error('所选路线没有本场附加奖项的球洞，请先调整奖项范围');
  for (const hole of next.holes) delete bank[key(hole)];
  next.courseSnapshot = {...round.courseSnapshot, ...C.snapshot(catalog,segmentIds), routeArchive:bank,
    routeRevision:(round.courseSnapshot?.routeRevision || 0) + 1};
  next.currentHole = next.holes.find(h => key(h) === currentKey)?.number || next.playOrder[0];
  next.revision++;
  next.updatedAt = time;
  // An undo from the previous layout must never restore numeric scores under a new route.
  next.changeLog = [];
  R.validateRound(next);
  return next;
}
function shortLabel(hole) {
  const label = String(hole.label || hole.number).trim();
  const section = String(hole.sectionName || '').trim();
  if (/^[A-Z]+\s*\d+$/i.test(label)) return label.replace(/\s/g,'').toUpperCase();
  const letter = /^([A-Z])(?:\s*(?:场|場|COURSE))?$/i.exec(section);
  if (letter && /^\d+$/.test(label)) return letter[1].toUpperCase() + Number(label);
  if (/^IN$/i.test(section) && /^\d+$/.test(label) && Number(label) <= 9) return String(Number(label)+9);
  return label;
}
module.exports = {key,orderedHoles,selected,sections,change,shortLabel};
