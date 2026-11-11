const {test,beforeEach}=require('node:test'),A=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const base=path.join(__dirname,'../miniprogram');let memory={},calls=[],denied=false,geoFail=false;
function freshLocation(){for(const f of ['location','privacy'])delete require.cache[require.resolve(base+'/services/'+f)];return require(base+'/services/location');}
function evt(d){return {currentTarget:{dataset:d}};}
function page(name,o={}){let def;global.Page=x=>def=x;const f=require.resolve(base+'/pages/'+name+'/index');delete require.cache[f];require(f);const p={...def,data:structuredClone(def.data||{}),setData(x){require('../miniprogram/services/view-patch').apply(this.data,x);}};if(p.onLoad)p.onLoad(o);if(p.onShow)p.onShow();return p;}
beforeEach(()=>{memory={};calls=[];denied=false;geoFail=false;global.wx={getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),requirePrivacyAuthorize:o=>{calls.push('privacy');denied?o.fail({errMsg:'privacy permission denied'}):o.success({});},getLocation:o=>{calls.push(o.type);geoFail?o.fail({errMsg:'GPS unavailable'}):o.success({latitude:31.2,longitude:121.4,accuracy:50});},showToast:o=>calls.push(o.title),showModal:o=>{calls.push('modal');o.success({confirm:true,content:'核对实际记录'});},navigateTo:o=>calls.push(o.url),switchTab:o=>calls.push(o.url),redirectTo:o=>calls.push(o.url),getRandomValues:o=>o.success({randomValues:new Uint8Array(32).fill(7).buffer})};});
test('先取得隐私同意再定位；一小时内跨启动复用约百米精度的本地缓存',async()=>{const L=freshLocation();await L.request();await L.request();const restored=freshLocation();A.equal(restored.state().status,'ready');await restored.request();A.deepEqual(calls,['privacy','gcj02']);A.equal(memory['qingye.location.v1'].fix.system,'gcj02');A.equal(memory['qingye.location.v1'].fix.accuracy,100);});
test('用户拒绝隐私授权时不调用位置接口，允许保留手动筛选',async()=>{denied=true;const L=freshLocation();A.equal(await L.request(),null);A.equal(L.state().status,'denied');A.deepEqual(calls,['privacy']);});
test('定位失败清除当前定位；有文案且不捏造坐标',async()=>{geoFail=true;const L=freshLocation();await L.request();A.equal(L.state().fix,null);A.equal(L.state().status,'unavailable');A.match(L.state().error,/无法定位/);});
test('同次并发定位只调用一次定位接口',async()=>{const L=freshLocation();await Promise.all([L.request(),L.request(),L.request()]);A.equal(calls.filter(x=>x==='gcj02').length,1);});
test('按距离升序；零距离有效，缺失/无效坐标排最后，来源未核验显示约数',()=>{const L=freshLocation(),origin={latitude:31.2,longitude:121.4};const cs=L.sort([{id:'far',name:'远',latitude:32,longitude:122},{id:'missing',name:'缺',latitude:null,longitude:null},{id:'near',name:'近',...origin,coordinateSystem:'gcj02',coordinateStatus:'verified'},{id:'bad',name:'错',latitude:999,longitude:121}],origin);A.deepEqual(cs.map(c=>c.id).slice(0,2),['near','far']);A.equal(cs[0].distanceKm,0);A.equal(cs[1].approximate,true);A.match(cs[1].distanceText,/约/);A.equal(cs.find(c=>c.id==='missing').distanceText,'距离待补充');});
test('已知两点距离符合大圆距离，不使用城市中心坐标补齐缺失点',()=>{const L=freshLocation();A.ok(Math.abs(L.distance({latitude:0,longitude:1},{latitude:1,longitude:1})-111.195)<0.01);A.equal(L.distance({latitude:31,longitude:121},{latitude:null,longitude:null}),null);});
test('默认Par未写入；点击数字直接确认Par，无数字输入弹窗；10杆以上可累加且可撤销',()=>{const S=require(base+'/services/store'),R=require(base+'/services/rules');S.init();const c=S.courses[0],r=S.create({courseId:c.id,segmentIds:c.segments.slice(0,2).map(s=>s.id),players:[{id:'me',name:'测试',tee:c.tees[0]}],ruleSnapshot:R.defaultRules()});const p=page('score',{id:r.id});A.equal(p.data.s,null);A.equal(p.data.summary.liveTotal,72);p.input();A.equal(S.getRound(r.id).scores.me[1].grossStrokes,r.holes[0].par);A.ok(!calls.includes('modal'));for(let i=0;i<10;i++)p.step(evt({delta:1}));A.equal(p.data.s.grossStrokes,r.holes[0].par+10);A.equal(p.data.summary.liveTotal,82);A.equal(p.data.tableHoles.length,18);p.undo();A.equal(p.data.summary.liveTotal,81);});
test('前九实际40、标准36时，整轮72的总杆显示76；未记录的后九仍无成绩',()=>{const S=require(base+'/services/store'),R=require(base+'/services/rules'),T=require(base+'/services/score-totals');S.init();const c=S.courses.find(c=>c.pars.length===18&&c.pars.slice(0,9).reduce((a,b)=>a+b,0)===36&&c.pars.reduce((a,b)=>a+b,0)===72),r=S.create({courseId:c.id,segmentIds:c.segments.slice(0,2).map(s=>s.id),players:[{id:'me',name:'测试',tee:c.tees[0]}],ruleSnapshot:R.defaultRules()});for(let n=1;n<=9;n++){const h=r.holes[n-1];S.saveScore(r.id,'me',n,{completion:'holed_out',strokes:h.par+(n===1?4:0),penalties:0,putts:null,fairway:null,green:null});}const now=S.getRound(r.id);A.equal(T.summary(now,'me').liveTotal,76);A.equal(T.summary(now,'me').front,40);A.equal(now.scores.me[10],undefined);});
test('后九记分进入当前球道页对应10号洞，浏览选洞不改变记分进度',()=>{
 const S=require(base+'/services/store'),R=require(base+'/services/rules');S.init();
 const c=S.courses.find(c=>c.id==='cn_bg_585'),r=S.create({courseId:c.id,segmentIds:[c.segments[1].id],players:[{id:'me',name:'测试',tee:c.tees[0]}],ruleSnapshot:R.defaultRules()});
 const before=JSON.stringify(S.getRound(r.id)),context=require(base+'/packages/hole-map/hole-context').holeContext(c,r,1);
 A.equal(context.selected.number,10);A.equal(context.selected.sourceId,'cn_bg_585_s2_h01');
 // This course now opens its GPS atlas; the old reference page redirects there.
 const score=page('score',{id:r.id});score.guide();A.ok(calls.includes('/packages/hole-map/atlas?course='+c.id+'&round='+r.id+'&hole=1'));
 let def;global.Page=x=>def=x;const file=base+'/packages/hole-map/atlas.js';delete require.cache[require.resolve(file)];require(file);
 const atlas={...def,data:structuredClone(def.data),setData(x){require('../miniprogram/services/view-patch').apply(this.data,x);},fetchHoles(){}};
 atlas.onLoad({round:r.id,hole:'1'});A.equal(atlas.initialNumber,10);
 const browsed=require(base+'/packages/hole-map/hole-context').holeContext(c,null,11);A.equal(browsed.selected.sourceId,'cn_bg_585_s2_h02');
 A.equal(JSON.stringify(S.getRound(r.id)),before);score.onUnload();
});
test('新原生项目主包与球场指南分包各小于2MiB；没有H5 web-view套壳',()=>{const app=JSON.parse(fs.readFileSync(base+'/app.json'));const files=[];function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p);else files.push(p);}}walk(base);for(const prefix of ['',...app.subPackages.map(p=>p.root)]){const group=files.filter(p=>prefix?p.startsWith(base+'/'+prefix+'/'):!app.subPackages.some(s=>p.startsWith(base+'/'+s.root+'/')));const size=group.reduce((n,p)=>n+fs.statSync(p).size,0);A.ok(size<2*1024*1024,prefix+': '+size);}for(const f of files.filter(f=>f.endsWith('.wxml')))A.doesNotMatch(fs.readFileSync(f,'utf8'),/<web-view/);A.deepEqual(app.requiredPrivateInfos,['getLocation']);});

const LOCATION_KEY='qingye.location.v1';
test('过期定位先显示上次球场依据，后台更新失败仍保留缓存',async()=>{
 const L=freshLocation();await L.request();memory[LOCATION_KEY].fix.time-=3600001;
 const restored=freshLocation();let fail;wx.getLocation=o=>{fail=o.fail;};
 const old=restored.state().fix,pending=restored.request();await Promise.resolve();await Promise.resolve();
 A.deepEqual(restored.state().fix,old);A.equal(restored.state().status,'ready');
 fail({errMsg:'GPS unavailable'});await pending;A.deepEqual(restored.state().fix,old);A.match(restored.state().error,/上次位置/);
});
test('一小时内不重复GPS，显式刷新仍立即定位',async()=>{
 const L=freshLocation();await L.request();memory[LOCATION_KEY].fix.time-=59*60000;const restored=freshLocation();await restored.request();A.equal(calls.filter(x=>x==='gcj02').length,1);await restored.request(true);A.equal(calls.filter(x=>x==='gcj02').length,2);
});
test('已撤销定位授权会清掉跨启动缓存，不继续使用旧坐标',async()=>{
 await freshLocation().request();wx.getSetting=o=>o.success({authSetting:{'scope.userLocation':false}});
 const restored=freshLocation();await restored.request();A.equal(restored.state().status,'denied');A.equal(restored.state().fix,null);A.equal(freshLocation().state().fix,null);
});
test('超过七天、未来或损坏的定位缓存不参与附近推荐',()=>{
 for(const fix of [{latitude:31,longitude:121,system:'gcj02',time:Date.now()-7*86400000},{latitude:31,longitude:121,system:'gcj02',time:Date.now()+3600000},{latitude:999,longitude:121,system:'gcj02',time:Date.now()}]){memory[LOCATION_KEY]={version:1,fix};A.equal(freshLocation().state().fix,null);}
});
