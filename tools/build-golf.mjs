import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/全国球场数据_2026-10-23/golf_china.json'),'utf8'));
const courses=data.courses.map(c=>{
 const segments=data.sections.filter(s=>s.course_id===c.course_id).sort((a,b)=>a.display_order-b.display_order).map(s=>({id:s.section_id,name:s.name,holes:data.holes.filter(h=>h.section_id===s.section_id).sort((a,b)=>a.ordinal_in_section-b.ordinal_in_section).map(h=>({id:h.hole_id,label:h.source_hole_label,par:h.par,si:h.stroke_index,siStatus:h.stroke_index_status,sourceId:h.source_id,siSourceId:h.stroke_index_source_id}))}));
 const tees=data.tees.filter(t=>t.course_id===c.course_id).map(t=>({id:t.tee_id,name:t.name,color:t.color,distances:Object.fromEntries(data.tee_holes.filter(x=>x.tee_id===t.tee_id).map(x=>[x.hole_id,x.distance]))}));
 const sourceIds=new Set([c.source_id,c.scorecard_source_id,c.city_source_id,...segments.flatMap(s=>s.holes.map(h=>h.siSourceId).filter(Boolean))]);
 return {id:c.course_id,facilityId:c.facility_id,name:c.name,nameEn:c.name_en,aliases:c.aliases,province:c.province,city:c.city,district:c.district,address:c.address,phone:c.phone,holes:c.scorecard_holes,reportedHoles:c.reported_holes,par:c.scorecard_par_sum,reportedPar:c.reported_par,pars:segments.flatMap(s=>s.holes.map(h=>h.par)),tees:tees.map(t=>t.name),teeData:tees,segments,publicData:true,demo:false,photo:0,image:'/assets/course.jpg',tag:'全国球场',subtitle:segments.length?'公开记分卡 · 现行资料待球会确认':'基础资料 · 记分卡待补全',retrievedOn:c.retrieved_on,operationStatus:c.operation_status,issues:data.issues.filter(i=>i.course_id===c.course_id).map(i=>({field:i.field,code:i.code,detail:i.detail,action:i.action})),sources:data.sources.filter(s=>sourceIds.has(s.source_id)),coordinateStatus:c.coordinate_status,coordinateSystem:c.coordinate_system,longitude:c.longitude,latitude:c.latitude,verifiedHandicapReady:false};
});
const output={metadata:data.metadata,courses};
// Store repeated hole fields and tee-distance keys once, then restore the public schema.
// This keeps the nationwide data inside WeChat's main-package size allowance.
const packed={metadata:output.metadata,courses:courses.map(c=>({...c,
 segments:c.segments.map(s=>[s.id,s.name,s.holes.map(h=>[h.id,h.label,h.par,h.si,h.siStatus,h.sourceId,h.siSourceId])]),
 teeData:c.teeData.map(t=>[t.id,t.name,t.color,c.segments.flatMap(s=>s.holes).map(h=>t.distances[h.id]??null)])
}))};
function inflateCatalog(data){for(const c of data.courses){
 c.segments=c.segments.map(([id,name,holes])=>({id,name,holes:holes.map(([id,label,par,si,siStatus,sourceId,siSourceId])=>({id,label,par,si,siStatus,sourceId,siSourceId}))}));
 const holes=c.segments.flatMap(s=>s.holes);
 c.teeData=c.teeData.map(([id,name,color,values])=>({id,name,color,distances:Object.fromEntries(values.flatMap((n,i)=>n===null?[]:[[holes[i].id,n]]))}));
}return data;}
const packedExpression='('+inflateCatalog.toString()+')('+JSON.stringify(packed)+')';
fs.writeFileSync(path.join(root,'shared-golf/courses.json'),JSON.stringify(output));
for(const [source,targets] of Object.entries({
 'shared-golf/rules.js':['golf-h5/dist/rules.js','golf-score/miniprogram/services/rules.js'],
 'shared-golf/service.js':['golf-h5/dist/service.js','golf-score/miniprogram/services/service.js'],
 'shared-golf/catalog.js':['golf-h5/dist/catalog.js','golf-score/miniprogram/services/catalog.js']
})) for(const target of targets)if(fs.existsSync(path.join(root,source)))fs.copyFileSync(path.join(root,source),path.join(root,target));
fs.writeFileSync(path.join(root,'golf-score/miniprogram/services/courses-data.js'),'module.exports='+packedExpression+';\n');
fs.writeFileSync(path.join(root,'golf-h5/dist/courses-data.js'),'globalThis.GolfCourseData='+packedExpression+';\n');
const entry=path.join(root,'golf-h5/dist/index.html');
const html=fs.readFileSync(entry,'utf8').replace(/(src|href)="([^"?]+\.(?:js|css))(?:\?[^"]*)?"/g,(_,attr,file)=>{
 const digest=createHash('sha256').update(fs.readFileSync(path.join(root,'golf-h5/dist',file))).digest('hex').slice(0,12);
 return `${attr}="${file}?v=${digest}"`;
});
fs.writeFileSync(entry,html);
console.log(JSON.stringify({courses:courses.length,sections:courses.reduce((n,c)=>n+c.segments.length,0),holes:courses.reduce((n,c)=>n+c.pars.length,0),tees:courses.reduce((n,c)=>n+c.teeData.length,0),distances:courses.reduce((n,c)=>n+c.teeData.reduce((a,t)=>a+Object.keys(t.distances).length,0),0),sharedEngineCopied:true}));
