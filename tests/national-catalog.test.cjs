const {test}=require('node:test');
const A=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const R=require('../shared-golf/rules');
const C=require('../shared-golf/catalog');
const V=require('../shared-golf/service');
const data=require('../shared-golf/courses.json');
const normalized=require('../outputs/全国球场数据_2026-10-23/golf_china.json');
const old=require('../outputs/长三角球场数据_2026-10-19/golf_yangtze_delta.json');
test('全国目录完整导入公开索引442条；34地区可筛选，未收录保持空集合',()=>{
  A.equal(data.courses.length,442);A.equal(new Set(data.courses.map(c=>c.id)).size,442);
  A.equal(C.regions.length,34);A.equal(new Set(data.courses.map(c=>c.province)).size,31);
  A.equal(C.regions.reduce((n,p)=>n+C.search(data.courses,'',p).length,0),442);
  A.equal(C.search(data.courses,'','西藏自治区').length,0);
  A.equal(C.search(data.courses,'','甘肃省').length,0);
  for(const p of ['广东省','北京市','海南省','香港特别行政区','澳门特别行政区','台湾省'])A.ok(C.search(data.courses,'',p).length>0);
});
test('原长三角65条及关联数据逐字段保留，不覆盖已校对内容',()=>{
  for(const c of old.courses)A.deepEqual(normalized.courses.find(n=>n.course_id===c.course_id),c);
  const oldIds=new Set(old.courses.map(c=>c.course_id));
  for(const key of ['sections','holes','tees','tee_holes','issues'])A.deepEqual(normalized[key].filter(r=>oldIds.has(r.course_id)),old[key]);
});
test('全国逐洞与发球台距离有来源且外键唯一，零值和缺失Par不混入',()=>{
  const holes=new Set(normalized.holes.map(h=>h.hole_id)),tees=new Set(normalized.tees.map(t=>t.tee_id)),sources=new Set(normalized.sources.map(s=>s.source_id));
  A.equal(holes.size,8460);A.equal(tees.size,1746);
  A.equal(new Set(normalized.tee_holes.map(t=>t.tee_hole_id)).size,normalized.tee_holes.length);
  for(const h of normalized.holes){A.ok([3,4,5,6].includes(h.par));A.ok(sources.has(h.source_id));}
  for(const t of normalized.tee_holes){A.ok(holes.has(t.hole_id));A.ok(tees.has(t.tee_id));A.ok(t.distance>0);A.equal(t.distance_unit,'yard');A.ok(sources.has(t.source_id));}
});
test('每条有记分卡的球场能创建合法9洞/18洞球局，未取得记分卡和关闭记录拒绝开局',()=>{
  let ready=0,blocked=0;
  for(const c of data.courses){
    const options={id:c.id,now:1,date:'2026-10-23',ruleSnapshot:R.defaultRules()},players=[{id:'me',name:'测试',tee:c.tees[0]||'未指定'}];
    if(C.canScore(c)){
      const r=V.newRound(c,players,options);A.ok([9,18].includes(r.holes.length));A.equal(Object.keys(r.scores.me).length,0);
      A.equal(r.holes.reduce((n,h)=>n+h.par,0),r.players[0].holePars?Object.values(r.players[0].holePars).reduce((n,p)=>n+p,0):NaN);
      ready++;
    }else{A.throws(()=>V.newRound(c,players,options),/关闭|缺少完整逐洞Par/);blocked++;}
  }
  A.equal(ready+blocked,442);A.equal(blocked,13);
});
test('全国目录升级不会修改历史球局或覆盖用户自建球场',()=>{

  const userCourse={id:'mine',name:'我的球场',pars:Array(9).fill(4),tees:['未指定']};
  const db={version:3,profile:{id:'me',name:'测试'},friends:[],rounds:[],courses:[userCourse]};
  // Use a legal full round so hydration exercises the actual history validation path.
  db.rounds=[V.newRound(data.courses[0],[{id:'me',name:'测试'}],{id:'historical',now:1,date:'2026-10-23'})];
  const saved=JSON.stringify(db.rounds);const upgraded=V.hydrate(db,data.courses);
  A.equal(JSON.stringify(upgraded.rounds),saved);A.deepEqual(upgraded.courses.find(c=>c.id==='mine'),userCourse);
});
test('源Par栏异常和4469码异常值不进入可用记分卡，保留问题来源',()=>{
  const invalid=data.courses.find(c=>c.id==='cn_bg_657');A.equal(C.canScore(invalid),false);A.deepEqual(invalid.pars,[]);A.ok(invalid.issues.some(i=>i.code==='invalid_section'));
  const distance=data.courses.find(c=>c.id==='cn_bg_3579');A.ok(distance.issues.some(i=>i.code==='implausible_distance'));A.ok(distance.teeData.every(t=>Object.values(t.distances).every(v=>v<=1000)));
  A.equal(data.courses.find(c=>c.id==='cn_bg_17867').city,'石家庄');
});
test('压缩后的H5与原生目录逐字段等同原数据，原生文件总量低于2MiB',()=>{
  const native=require('../golf-score/miniprogram/services/courses-data.js');A.deepEqual(native,data);
  const ctx={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../golf-h5/dist/courses-data.js'),'utf8'),ctx);
  A.deepEqual(JSON.parse(JSON.stringify(ctx.GolfCourseData)),data);
  function size(dir){return fs.readdirSync(dir,{withFileTypes:true}).reduce((n,f)=>n+(f.isDirectory()?size(path.join(dir,f.name)):fs.statSync(path.join(dir,f.name)).size),0);}
  A.ok(size(path.join(__dirname,'../golf-score/miniprogram'))<2*1024*1024);
});
