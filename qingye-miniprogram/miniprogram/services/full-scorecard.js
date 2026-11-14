const R=require('./rules'),View=require('./score-view');

// The halves follow this round's actual route, including C → A and back-nine starts.
function build(round,half='front',mineId,profiles=[]){
 const table=View.table(round,p=>p.name,profiles),offset=half==='back'&&round.holes.length>9?9:0;
 const holes=table.tableHoles.slice(offset,offset+9).map(h=>{
  const letter=/^([A-F])\s*场$/.exec(h.headerSection);
  return {...h,cardLabel:letter?letter[1]+h.headerNumber:h.headerNumber,cardSection:letter?'':h.headerSection};
 });
 return {cardHoles:holes,cardPlayers:table.tablePlayers.map(player=>({
  ...player,isMine:player.id===mineId,...R.rawSummary(round,player.id),
  cells:player.cells.slice(offset,offset+9)
 })),half:offset?'back':'front'};
}
module.exports={build};
