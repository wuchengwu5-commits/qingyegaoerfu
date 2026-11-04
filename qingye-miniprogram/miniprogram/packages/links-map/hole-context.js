const C=require('../../services/catalog');
const DefaultConfig=require('./course-config');
function holeContext(course,round,requested,config=DefaultConfig){
 const sections=course?C.sections(course):[],holes=[];
 sections.forEach((s,si)=>s.holes.forEach(h=>{const number=holes.length+1,id=h.id,match=round?.holes.find(x=>(x.sourceHoleId||x.id)===id);holes.push({...h,number,sourceId:id,sectionName:s.name,sectionId:s.id,groupIndex:si,roundNumber:match?.number||null,mapAvailable:!!config.holes[id],displayNumber:sections.length>2?(holes.length%9+1):holes.length+1,displayTitle:sections.length>2?(config.sectionNames?.[s.id]||s.name)+' '+(holes.length%9+1)+' 号洞':'第 '+(holes.length+1)+' 洞',enhancedAvailable:!!config.holes[id]&&!config.holes[id].satelliteOnly&&!config.holes[id].diagram});}));
 const chosen=Number(requested)||round?.currentHole||1,source=round?.holes.find(h=>h.number===chosen);
 let selected=source?holes.find(h=>h.sourceId===(source.sourceHoleId||source.id)):holes.find(h=>h.number===chosen);
 // Older saved rounds may predate stable source IDs. Only use an unambiguous
 // section/label match; do not silently substitute hole 1 for an unknown hole.
 if(source&&!selected){
  selected=holes.find(h=>h.sectionId===source.sectionId&&h.label===source.label);
  if(!selected&&round.holes.length===18)selected=holes.find(h=>h.number===Number(source.label||source.number));
  if(!selected&&Number(source.label)>9)selected=holes.find(h=>h.number===Number(source.label));
 }
 if(!source&&!selected)selected=holes[0]||null;
 return {holes,groups:sections.map((s,i)=>({id:s.id,title:config.sectionNames?.[s.id]||((sections.length===2?(i===0?'前九 · ':'后九 · '):'')+s.name),holes:holes.filter(h=>h.sectionId===s.id)})),selected};
}
module.exports={holeContext};
