const R = require('./rules');
const A = require('./appearance');
const T = require('./score-totals');
const Route = require('./score-route');
const Catalog = require('./catalog');
const Details=require('./player-details');
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
  const players = Details.labels(round,profiles).map((player,index) => {
    const displayPlayer=player;
    return {id:player.id,name:label(displayPlayer),displayName:label(displayPlayer),tabId:'score-player-'+index,tee:player.teeName||player.tee,teeColor:player.teeColor,seat:player.seat,
      avatarUrl:player.avatarUrl,total:T.summary(round,player.id).totalText,played:T.summary(round,player.id).played,
      cells:holes.map(h => {
        const s = round.scores[player.id]?.[h.number], d = distance(round,player,h);
        return {number:h.number,value:value(s),recorded:!!s,distance:d,
          aria:label(displayPlayer)+'，'+h.shortLabel+'，'+(s?value(s)+'杆':'未记分')+(d?'，距离'+d+(round.distanceUnit==='m'?'米':'码'):''),
          kind:A.appearance(s?.grossStrokes,R.par(round,player.id,h.number),s?.completion).kind};
      })};
  });
  const current = holes.find(h=>h.number===round.currentHole)||holes[0];
  return {tableHoles:holes,tablePlayers:players,players:players.map(({cells,...player})=>player),tableWidth:holes.length*45,
    distanceUnitLabel:round.distanceUnit==='m'?'米':'码',currentHoleLabel:[current.headerSection,current.headerNumber].filter(Boolean).join(' '),
    currentPosition:holes.findIndex(h=>h.number===round.currentHole)+1,playerScrollTarget:players.find(p=>p.id===round.currentPlayer)?.tabId || players[0]?.tabId};
}
const signed = n => n > 0 ? '+' + n : String(n);
function relativeValue(score, par) {
  return score?.completion === 'holed_out' ? signed(score.grossStrokes - par) : value(score);
}
// Subtotals follow the displayed route, including a back-nine start or C → A.
// Stored scores and the full scorecard continue to use actual strokes.
function liveTable(round, label, profiles = []) {
  const base = table(round, label, profiles), columns = [];
  for (let start = 0; start < base.tableHoles.length; start += 9) {
    const holes = base.tableHoles.slice(start, start + 9), half = start / 9;
    columns.push(...holes.map(h => ({...h,key:'hole-' + h.number,width:45,summary:false})));
    columns.push({key:'half-' + half,summary:true,width:60,
      title:half === 0 ? '前九' : half === 1 ? '后九' : '第' + (half + 1) + '段',
      subtitle:half === 0 ? 'OUT' : half === 1 ? 'IN' : '合计',
      numbers:holes.map(h => h.number),par:holes.reduce((sum,h) => sum + h.par,0)});
  }
  columns.push({key:'total',summary:true,isTotal:true,width:64,title:'总杆',subtitle:'实际',
    numbers:base.tableHoles.map(h => h.number),par:base.tableHoles.reduce((sum,h) => sum + h.par,0)});
  let left = 0, currentColumnLeft = 0;
  for (const column of columns) {
    if (!column.summary && column.number === round.currentHole) currentColumnLeft = left;
    left += column.width;
  }
  const players = base.tablePlayers.map(player => {
    const actual = T.summary(round,player.id),relativeTotal = actual.played ? signed(actual.diff) : '—';
    const cells = columns.map(column => {
      if (!column.summary) {
        const cell = player.cells.find(c => c.number === column.number),score = round.scores[player.id]?.[column.number];
        const par = R.par(round,player.id,column.number),relative = relativeValue(score,par);
        return {...cell,key:column.key,width:column.width,summary:false,value:relative,
          aria:player.name+'，'+column.shortLabel+'洞，'+(score?.completion==='holed_out'?'相对标准杆'+relative+'，实际'+score.grossStrokes+'杆':score?value(score):'未记分')};
      }
      let strokes = 0, playedPar = 0, played = 0;
      for (const number of column.numbers) {
        const score = round.scores[player.id]?.[number];
        if (score?.completion !== 'holed_out') continue;
        strokes += score.grossStrokes;playedPar += R.par(round,player.id,number);played++;
      }
      const diff = strokes - playedPar;
      return {key:column.key,width:column.width,summary:true,isTotal:!!column.isTotal,played,
        value:played ? column.isTotal ? String(strokes) : signed(diff) : '—',
        detail:column.isTotal ? played+'/'+column.numbers.length+' 洞' : played ? strokes+' 杆' : '',
        aria:player.name+'，'+column.title+'，'+(played?'实际'+strokes+'杆，相对标准杆'+signed(diff)+'，已记'+played+'洞':'未记分')};
    });
    return {...player,relativeTotal,liveTotal:actual.liveTotal,roundPar:actual.roundPar,cells};
  });
  return {...base,tableColumns:columns,tablePlayers:players,tableWidth:left,currentColumnLeft};
}
module.exports = {table,liveTable,distance,value,relativeValue};
