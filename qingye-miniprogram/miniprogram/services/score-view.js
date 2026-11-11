const R = require('./rules');
const A = require('./appearance');
const T = require('./score-totals');
const Route = require('./score-route');
const Catalog = require('./catalog');
const value = s => !s ? '—' : s.completion === 'holed_out' ? s.grossStrokes : ({picked_up:'捡',skipped:'跳',conceded_next_stroke:'认'})[s.completion];
function distance(round, player, hole) {
  const yards = player.holeDistances?.[hole.number];
  return typeof yards === 'number' && yards > 0 ? Math.round(yards * (round.distanceUnit === 'm' ? .9144 : 1)) : '';
}
function header(hole, label) {
  const match = /^(.*?)(\d+)(?:\s*号?洞)?$/.exec(label);
  const prefix = (match?.[1] || '').trim().replace(/[·\s_-]+$/g,'');
  const section = String(hole.sectionName || '').trim();
  const sameSection = prefix.toUpperCase() === section.replace(/\s+COURSE$/i,'').toUpperCase();
  return {headerNumber:match ? String(Number(match[2])) : String(hole.number),
    headerSection:match ? (prefix && prefix !== '第' ? (sameSection ? Catalog.sectionTitle(section) : prefix) : '') : label};
}
function table(round, label, profiles = []) {
  const numericLabels = round.holes.every(h => /^\d+$/.test(String(h.label))) && new Set(round.holes.map(h=>String(h.label))).size === round.holes.length;
  const labelFor = h => numericLabels && !/^IN$/i.test(h.sectionName||'') ? String(h.label) : Route.shortLabel(h);
  const holes = Route.orderedHoles(round).map(h => ({...h,shortLabel:labelFor(h),...header(h,labelFor(h))}));
  const players = round.players.map((player,index) => {
    const profile = profiles.find(p => player.accountUid && (p.uid === player.accountUid || p.accountUid === player.accountUid));
    return {id:player.id,name:label(player),displayName:label(player),tabId:'score-player-'+index,
      avatarUrl:profile ? (profile.avatarUrl || '') : (player.avatarUrl || ''),total:T.summary(round,player.id).totalText,played:T.summary(round,player.id).played,
      cells:holes.map(h => {
        const s = round.scores[player.id]?.[h.number], d = distance(round,player,h);
        return {number:h.number,value:value(s),recorded:!!s,distance:d,
          aria:label(player)+'，'+h.shortLabel+'，'+(s?value(s)+'杆':'未记分')+(d?'，距离'+d+(round.distanceUnit==='m'?'米':'码'):''),
          kind:A.appearance(s?.grossStrokes,R.par(round,player.id,h.number),s?.completion).kind};
      })};
  });
  const current = holes.find(h=>h.number===round.currentHole)||holes[0];
  return {tableHoles:holes,tablePlayers:players,players:players.map(({cells,...player})=>player),tableWidth:holes.length*45,
    distanceUnitLabel:round.distanceUnit==='m'?'米':'码',currentHoleLabel:[current.headerSection,current.headerNumber].filter(Boolean).join(' '),
    currentPosition:holes.findIndex(h=>h.number===round.currentHole)+1,playerScrollTarget:players.find(p=>p.id===round.currentPlayer)?.tabId || players[0]?.tabId};
}
module.exports = {table,distance,value};
