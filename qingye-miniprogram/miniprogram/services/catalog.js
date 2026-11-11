(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const regions=['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区','台湾省','香港特别行政区','澳门特别行政区'];
function sections(c){return c.segments||[0,9].filter(n=>(c.pars||[]).length>n).map((n,i)=>({id:c.id+'-s'+i,name:i?'后九 IN':'前九 OUT',holes:c.pars.slice(n,n+9).map((p,j)=>({id:c.id+'-'+(n+j+1),label:String(n+j+1),par:p,si:null,siStatus:'missing'}))}));}
function sectionTitle(name) {
 const raw=String(name||'').trim();
 const names={'OUT':'前九','IN':'后九','NEW COURSE':'新场','OLD COURSE':'老场','TIANMA COURSE':'天马场'};
 const key=raw.toUpperCase();
 if(names[key])return names[key];
 const letter=/^([A-F])(?:\s+COURSE)?$/i.exec(raw);
 return letter?letter[1].toUpperCase()+' 场':raw;
}
function courseHoleTitle(hole) {
 if(!hole)return '';
 const raw=String(hole.sectionName||'').trim(), section=sectionTitle(raw);
 const label=String(hole.label??'').trim();
 if(!label)return section?(section+' · 本轮第 '+hole.number+' 洞'):('本轮第 '+hole.number+' 洞');
 const prefix=raw.replace(/\s+COURSE$/i,'').toUpperCase();
 const tagged=/^([a-z]+)\s*(\d+)$/i.exec(label);
 if(tagged&&tagged[1].toUpperCase()===prefix)return section+' '+Number(tagged[2])+' 号洞';
 if(/^\d+$/.test(label)){
  // Some OUT / IN scorecards number the back nine locally from 1 through 9.
  const local=Number(label),physical=raw.toUpperCase()==='IN'&&local>=1&&local<=9?local+9:local;
  return (section?section+' ':'')+physical+' 号洞';
 }
 return (section?section+' · ':'')+label;
}
function canScore(c){return c.operationStatus!=='closed_reported'&&sections(c).some(s=>s.holes.length===9&&s.holes.every(h=>[3,4,5,6].includes(h.par)));}
function selectedHoles(c,segmentIds,start=1){
 const ss=sections(c);if(!segmentIds?.length||segmentIds.length>2||new Set(segmentIds).size!==segmentIds.length)throw Error('请选择一个或两个不同的九洞段');
 const chosen=segmentIds.map(id=>ss.find(s=>s.id===id));if(chosen.some(s=>!s||s.holes.length!==9))throw Error('球洞段数据不完整');
 const holes=chosen.flatMap((s,i)=>s.holes.map((h,j)=>({...copy(h),number:i*9+j+1,sectionId:s.id,sectionName:s.name})));
 const order=holes.map(h=>h.number);return {holes,playOrder:start===10&&holes.length===18?[...order.slice(9),...order.slice(0,9)]:order};
}
function playerSnapshots(c,players,holes){return players.map(p=>{const tee=c.teeData?.find(t=>t.name===p.tee||t.id===p.teeId);return {...copy(p),teeId:tee?.id||null,tee:tee?.name||p.tee||'未指定',teeName:tee?.name||p.tee||'未指定',holePars:Object.fromEntries(holes.map(h=>[h.number,h.par])),holeSI:Object.fromEntries(holes.map(h=>[h.number,h.si??null])),holeDistances:Object.fromEntries(holes.map(h=>[h.number,tee?.distances[h.id]??null]))};});}
function snapshot(c,segmentIds){
 const available=sections(c);
 return {id:c.id,name:c.name,publicData:!!c.publicData,retrievedOn:c.retrievedOn||null,sections:copy(segmentIds.map(id=>available.find(section=>section.id===id)).filter(Boolean)),sources:copy(c.sources||[]),operationStatus:c.operationStatus||'unknown'};}
function search(cs,q,province='all'){const s=q.trim().toLowerCase();return cs.filter(c=>(province==='all'||c.province===province)&&(!s||[c.name,c.nameEn,c.city,c.district,c.province,...c.aliases||[]].join(' ').toLowerCase().includes(s)));}
const api={regions,sections,sectionTitle,courseHoleTitle,canScore,selectedHoles,playerSnapshots,snapshot,search};if(typeof module!=='undefined')module.exports=api;else root.GolfCatalog=api;
})(typeof globalThis==='undefined'?this:globalThis);
