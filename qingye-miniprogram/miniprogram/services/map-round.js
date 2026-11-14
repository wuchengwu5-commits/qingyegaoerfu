// A teammate's viewed round may not exist in the local score store. Carry only
// map context in memory; viewing a map must never adopt or save a shared round.
let current=null;
const copy=value=>JSON.parse(JSON.stringify(value));
const uid=()=>require('./account').user()?.uid||'';
function prepare(round){
 current=round?{uid:uid(),round:{
  id:round.id,courseId:round.courseId,currentHole:round.currentHole,
  currentPlayer:round.currentPlayer,distanceUnit:round.distanceUnit,
  players:round.players.map(({id,tee})=>({id,tee})),
  holes:round.holes.map(({id,sourceHoleId,number,label,sectionId,sectionName})=>({id,sourceHoleId,number,label,sectionId,sectionName}))
 }}:null;
}
function get(id){
 if(current&&current.uid!==uid())current=null;
 return current?.round.id===id?copy(current.round):require('./store').getRound(id);
}
module.exports={prepare,get};
