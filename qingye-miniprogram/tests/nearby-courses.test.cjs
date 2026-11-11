const {test,beforeEach}=require('node:test'),A=require('node:assert/strict');
const base='../miniprogram/',City=require(base+'services/location-city'),catalog=require(base+'services/courses-data').courses;
const point={latitude:31.23,longitude:121.47};let gps,apiCalls;
function fresh(){for(const n of ['location','privacy'])delete require.cache[require.resolve(base+'services/'+n)];return require(base+'services/location');}
beforeEach(()=>{apiCalls=0;gps={...point};global.wx={requirePrivacyAuthorize:o=>o.success({}),getLocation:o=>{apiCalls++;o.success(gps);},getWindowInfo:()=>({statusBarHeight:24})};});
test('GPS resolves actual administrative cities including both sides of Shanghai/Suzhou; not nearest-course city',()=>{
 for(const [longitude,latitude,city] of [[121.47,31.23,'上海市'],[121.30,31.29,'上海市'],[120.98,31.38,'苏州市'],[116.4,39.9,'北京市'],[120.15,30.27,'杭州市'],[114.06,22.55,'深圳市'],[104.06,30.67,'成都市']])A.equal(City.resolve({longitude,latitude}).city,city);
 A.equal(City.resolve({latitude:0,longitude:1}),null);
 A.ok(City.sameCity({province:'江苏省',city:'苏州'},{province:'江苏省',city:'苏州市'}));
 A.equal(City.sameCity({province:'江苏省',city:'苏州'},{province:'上海市',city:'上海市'}),false);
});
test('same city first, each group ascending, missing coordinates at group end; nearest remains global',()=>{
 const L=fresh(),origin={latitude:31.3,longitude:121.2,city:'上海市',province:'上海市'},courses=[
  {id:'other',name:'跨市近',latitude:31.5,longitude:121.1,province:'江苏省',city:'苏州'},
  {id:'missing',name:'无坐标',province:'上海市',city:'上海'},
  {id:'localFar',name:'同城远',latitude:31.0,longitude:121.8,province:'上海市',city:'上海市'},
  {id:'localNear',name:'同城近',latitude:31.3,longitude:121.2,province:'上海市',city:'上海市',operationStatus:'closed_reported'}];
 A.deepEqual(L.sort(courses,origin,true).map(c=>c.id),['localNear','localFar','missing','other']);
 A.equal(L.nearest(courses,origin).id,'other');
 A.equal(L.sort(courses,{latitude:origin.latitude,longitude:origin.longitude},true)[1].id,'other');
});
test('fresh GPS shared between pages, stale fix refreshed, forced relocation replaces old city',async t=>{
 const L=fresh();const original=Date.now;let now=original();t.mock.method(Date,'now',()=>now);
 await L.request();A.equal(L.state().fix.city,'上海市');await L.request();A.equal(apiCalls,1);
 now+=61000;gps={latitude:39.9,longitude:116.4};await L.request();A.equal(apiCalls,2);A.equal(L.state().fix.city,'北京市');
 gps={latitude:22.55,longitude:114.06};await L.request(true);A.equal(L.state().fix.city,'深圳市');
});
test('native city data loads once per attempt and never delays or overwrites a newer GPS fix',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 function fromSource(file,localRequire){
  const filename=require.resolve(base+'services/'+file),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:localRequire,wx:global.wx,setTimeout,clearTimeout,Date},{filename});
  return module.exports;
 }
 let finishData,failData,downloads=0;
 const cityRequire=()=>{throw Error('city data must load asynchronously');};
 cityRequire.async=path=>{
  A.equal(path,'../packages/location-data/location-cities-data.js');
  downloads++;
  return new Promise((resolve,reject)=>{finishData=resolve;failData=reject;});
 };
 const city=fromSource('location-city',cityRequire);
 const L=fromSource('location',path=>path==='./location-city'?city:{ensure:async()=>{}});
 const first=await L.request();
 A.equal(first.longitude,121.47);A.equal(first.city,undefined);A.equal(L.state().status,'ready');
 failData(Error('offline'));
 await new Promise(resolve=>setImmediate(resolve));
 await L.request();
 gps={latitude:39.9,longitude:116.4};
 const recent=await L.request(true);
 A.equal(recent.longitude,116.4);A.equal(recent.city,undefined);A.equal(downloads,2);
 finishData(require(base+'packages/location-data/location-cities-data'));
 await new Promise(resolve=>setImmediate(resolve));
 A.equal(L.state().fix.city,'北京市');A.equal(L.state().fix.longitude,116.4);
});

test('rejected authorization is not repeatedly requested; settings recovery and invalid GPS clear old fix',async()=>{
 const L=fresh();wx.getLocation=o=>o.fail({errMsg:'getLocation:fail auth deny'});
 await L.request();A.equal(L.state().status,'denied');let opened=0;
 wx.openSetting=o=>{opened++;o.success({authSetting:{'scope.userLocation':true}});};
 wx.getLocation=o=>{apiCalls++;o.success(point);};await L.request();A.equal(apiCalls,0);
 await L.settings();A.equal(opened,1);A.equal(L.state().status,'ready');
 wx.getLocation=o=>o.success({latitude:999,longitude:121});await L.request(true);A.equal(L.state().fix,null);A.equal(L.state().status,'unavailable');
});
test('GPS timeout releases loading and a late result cannot replace a newer fix',async t=>{
 const L=fresh();let late;wx.getLocation=o=>late=o;
 t.mock.timers.enable({apis:['setTimeout']});const pending=L.request();await Promise.resolve();await Promise.resolve();
 t.mock.timers.tick(15001);await pending;A.equal(L.state().status,'unavailable');
 wx.getLocation=o=>o.success({latitude:39.9,longitude:116.4});await L.request(true);late.success(point);A.equal(L.state().fix.city,'北京市');
});
function setupPages(t,L){
 const active={id:'active-elsewhere',courseId:'cn_bg_2525',courseName:'旧球局球场'},favorites=[],navigation=[];
 const S={courses:catalog,read:()=>({profile:{},favorites}),active:()=>active,stats:()=>({})};
 const replacements={'services/ui':{S,run:fn=>fn(),go:(name,query)=>navigation.push([name,query]),tab:name=>navigation.push([name])},'services/remote':{sync:()=>Promise.resolve()},'services/slogans':{get:()=>({title:'测试',subtitle:''})}};
 const saved=[];
 for(const [name,exports] of Object.entries(replacements)){const id=require.resolve(base+name);saved.push([id,require.cache[id]]);require.cache[id]={id,filename:id,loaded:true,exports};}
 const pages=[];
 function page(name){let def;global.Page=x=>def=x;const id=require.resolve(base+'pages/'+name+'/index');saved.push([id,require.cache[id]]);delete require.cache[id];require(id);const p={...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}};p.onLoad();p.refresh();pages.push(p);return p;}
 t.after(()=>{pages.forEach(p=>p.onUnload());for(const [id,old] of saved)old?require.cache[id]=old:delete require.cache[id];delete global.Page;});
 return {home:page('home'),directory:page('courses'),navigation,active};
}
test('home and current-location show the same nearest course, independent of active round, search or province filters',async t=>{
 const L=fresh();await L.request();const {home,directory,navigation,active}=setupPages(t,L),before=JSON.stringify(active);
 const nearest=L.nearest(catalog,L.state().fix);A.equal(home.data.featured.id,nearest.id);A.equal(home.data.featured.name,nearest.name);A.equal(directory.data.nearest.id,nearest.id);
 A.notEqual(home.data.featured.name,active.courseName);home.start();A.deepEqual(navigation.pop(),['score','?id='+active.id]);
 directory.quickProvince({currentTarget:{dataset:{id:'北京市'}}});directory.search({detail:{value:'不存在的球场'}});A.equal(directory.data.items.length,0);A.equal(directory.data.nearest.id,nearest.id);
 gps={latitude:39.9,longitude:116.4};await L.request(true);A.equal(home.data.featured.id,directory.data.nearest.id);A.notEqual(home.data.featured.id,nearest.id);A.equal(directory.data.province,'北京市');A.equal(directory.data.query,'不存在的球场');A.equal(JSON.stringify(active),before);
 wx.getLocation=o=>o.fail({errMsg:'GPS unavailable'});await L.request(true);A.equal(home.data.featured.id,undefined);A.equal(directory.data.nearest,null);
});
test('without an active round, the home button opens setup for the displayed nearest course',async t=>{
 const L=fresh();await L.request();const {home,navigation}=setupPages(t,L);const ui=require(base+'services/ui');ui.S.active=()=>null;home.refresh();home.start();A.deepEqual(navigation.pop(),['create','?course='+home.data.featured.id]);
});
test('all 442 catalog courses have real source coordinates; imported coordinates preserve provenance and scorecards',()=>{
 const fs=require('node:fs'),path=require('node:path');A.equal(catalog.length,442);
 for(const c of catalog)A.ok(fresh().valid(c.latitude,c.longitude),c.id);
 const imported=JSON.parse(fs.readFileSync(path.join(__dirname,'../../outputs/gps-nearby-2026-11-04/coordinate-import.json')));
 A.equal(imported.length,377);for(const row of imported){const c=catalog.find(c=>c.id===row.id);A.equal(c.latitude,row.latitude);A.equal(c.longitude,row.longitude);A.ok(c.coordinateSource.url);A.notEqual(c.coordinateStatus,'verified');}
});
