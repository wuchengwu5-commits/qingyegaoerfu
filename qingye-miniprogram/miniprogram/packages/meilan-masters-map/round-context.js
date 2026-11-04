function roundContext(round) {
  const player=round?.players.find(p=>p.id===round.currentPlayer)||round?.players[0];
  const tee=player?.tee||'',key=tee.toLowerCase();
  const known=[['black','黑','#303a31'],['blue','蓝','#5d87aa'],['white','白','#f9faf3'],['red','红','#be7370'],['gold','金','#b6a16a'],['yellow','黄','#b6a16a']];
  const match=known.find(([en,zh])=>key.includes(en)||tee.includes(zh));
  return {unit:round?.distanceUnit==='m'?'m':'yd',teeLabel:tee?(match?match[1]+' Tee':tee):'未开局',teeColor:match?.[2]||'#a8b19a',hasRound:!!round};
}
module.exports={roundContext};
