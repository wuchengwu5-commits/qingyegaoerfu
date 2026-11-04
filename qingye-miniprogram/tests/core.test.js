const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
let memory={},toasts=[],routes=[];
global.wx={__preview:true,getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:o=>toasts.push(o.title),showModal:o=>o.success({confirm:true,content:'新昵称'}),navigateTo:o=>routes.push(o.url),redirectTo:o=>routes.push(o.url),switchTab:o=>routes.push(o.url),setClipboardData:o=>{global.clipboard=o.data;},env:{USER_DATA_PATH:'/tmp'},getFileSystemManager:()=>({writeFileSync:()=>{}})};
const S=require('../miniprogram/services/store');const E=require('../miniprogram/services/engine');
function create(mode='all',friendIds=[]){return S.create({courseId:S.courses[0].id,mode,friendIds,ruleSnapshot:E.defaultRules('stroke_play')});}
function score(r,pid,n,strokes=4,extra={}){return S.saveScore(r.id,pid,n,Object.assign({strokes,putts:2,penalties:0,fairway:null,green:null},extra));}
function loadPage(name,options={}){let definition;global.Page=p=>definition=p;const f=require.resolve('../miniprogram/pages/'+name+'/index');delete require.cache[f];require(f);const p=Object.assign({},definition,{data:structuredClone(definition.data||{}),setData(d){Object.assign(this.data,d);}});if(p.onLoad)p.onLoad(options);if(p.onShow)p.onShow();return p;}
function event(dataset){return {currentTarget:{dataset}};}
beforeEach(()=>{memory={};toasts=[];routes=[];S.init();S.mutate(d=>d.friends=[{id:'f1',name:'测试甲'},{id:'f2',name:'测试乙'}]);});
test('new round leaves every hole unrecorded; par total 72',()=>{const r=create();assert.equal(r.holes.reduce((a,h)=>a+h.par,0),72);assert.equal(E.summary(r,'me').played,0);assert.equal(E.summary(r,'me').totalText,'—');assert.throws(()=>create(),/进行中/);});
test('front and back nine use correct original hole numbers',()=>{let r=create('back');assert.equal(r.currentHole,1);assert.equal(r.holes[0].label,'10');assert.deepEqual(r.holes.map(h=>h.number),[1,2,3,4,5,6,7,8,9]);score(r,'me',1);S.finish(r.id);r=create('front');assert.equal(r.holes.length,9);assert.equal(r.currentHole,1);});
test('penalties already included, empty holes excluded and edits replace values',()=>{let r=create();r=score(r,'me',1,6,{penalties:1});let s=E.summary(r,'me');assert.equal(s.total,6);assert.equal(s.par,r.holes[0].par);assert.equal(s.diff,6-r.holes[0].par);r=score(r,'me',1,4);assert.equal(E.summary(r,'me').total,4);assert.equal(E.summary(r,'me').played,1);});
test('invalid score is rejected without mutation',()=>{const r=create();for(const s of [{strokes:0,putts:0,penalties:0},{strokes:4,putts:3,penalties:2},{strokes:2.5,putts:0,penalties:0}])assert.throws(()=>S.saveScore(r.id,'me',1,{fairway:null,green:null,...s}));assert.equal(E.summary(S.getRound(r.id),'me').played,0);});
test('FIR excludes par3 and unknown; GIR excludes unknown',()=>{let r=create();r=score(r,'me',1,4,{fairway:true,green:false});r=score(r,'me',r.holes.find(h=>h.number!==1&&h.par!==3).number,5,{fairway:false,green:true});r=score(r,'me',r.holes.find(h=>h.par===3).number,3,{fairway:true,green:null});assert.equal(E.summary(r,'me').fwRate,'50%');assert.equal(E.summary(r,'me').girRate,'50%');});
test('rank ties and all four players persist independently',()=>{let d=S.read();d.friends.push({id:'f3',name:'王三'});wx.setStorageSync(S.KEY,d);let r=create('all',['f1','f2','f3']);r=score(r,'me',1,4);r=score(r,'f1',1,4);r=score(r,'f2',1,5);r=score(r,'f3',1,6);assert.deepEqual(E.ranking(r).map(p=>p.rank),[1,1,3,4]);assert.equal(E.summary(r,'f3').total,6);});
test('can finish partial round; finished round immutable; partial results excluded from 18 hole average',()=>{let r=create('all',['f1']);r=score(r,'me',1);r=score(r,'f1',1);r=S.finish(r.id);assert.throws(()=>score(r,'me',1),/已结束/);assert.equal(S.stats().rounds,1);assert.equal(S.stats().avg,'—');});
test('complete 18 hole stats and local reload',()=>{let r=create();r.holes.forEach(h=>{r=score(r,'me',h.number,h.par);});S.finish(r.id);assert.equal(S.stats().best,72);assert.equal(S.stats().avg,'72.0');assert.equal(S.stats().putts,'2.0');delete require.cache[require.resolve('../miniprogram/services/store')];assert.equal(require('../miniprogram/services/store').read().rounds[0].scores.me[18].strokes,r.holes[17].par);});
test('backup round trip and malformed import preserves storage',()=>{let r=create();score(r,'me',1);const backup=JSON.stringify(S.read());memory={};S.importData(backup);assert.equal(S.active().id,r.id);const saved=JSON.stringify(S.read());assert.throws(()=>S.importData('{bad'));assert.equal(JSON.stringify(S.read()),saved);const bad=JSON.parse(saved);bad.rounds[0].scores.me[1].strokes=-1;assert.throws(()=>S.importData(JSON.stringify(bad)));assert.equal(JSON.stringify(S.read()),saved);});
test('score page recording, navigation, undo and clear',()=>{const r=create(),p=loadPage('score',{id:r.id});assert.equal(p.data.s,null);p.quick(event({value:4}));assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,4);p.step(event({delta:1}));assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,5);p.undo();assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,4);p.hole(event({number:2}));assert.equal(S.getRound(r.id).currentHole,2);p.hole(event({number:1}));p.clear();assert.equal(E.summary(S.getRound(r.id),'me').played,0);p.undo();assert.equal(E.summary(S.getRound(r.id),'me').played,1);});
test('create, course search, history and results handlers',()=>{const courses=loadPage('courses');courses.search({detail:{value:'银杏湖'}});assert.equal(courses.data.items.length,1);const c=loadPage('create',{course:S.courses[0].id});c.start();const r=S.active();assert.equal(r.players.length,1);score(r,'me',1);S.finish(r.id);const result=loadPage('result',{id:r.id});result.copy();assert.match(global.clipboard,/1\/18 洞/);const hist=loadPage('history');assert.equal(hist.data.items.length,1);hist.remove(event({id:r.id}));assert.equal(S.read().rounds.length,0);});
test('Yintao course and source A1 score page enter the native map; returning preserves round and score',()=>{
  const course=loadPage('course',{id:'cn_bg_585'});course.maps();assert.equal(routes.pop(),'/packages/hole-map/index?course=cn_bg_585');
  const r=S.create({courseId:'cn_bg_585',mode:'all',friendIds:[],ruleSnapshot:E.defaultRules('stroke_play')});
  score(r,'me',1,5);const p=loadPage('score',{id:r.id}),before=JSON.stringify(S.getRound(r.id));
  p.guide();assert.equal(routes.pop(),'/packages/hole-map/index?course=cn_bg_585&round='+encodeURIComponent(r.id)+'&hole=1');
  let def;global.Page=d=>def=d;const f=require.resolve('../miniprogram/packages/hole-map/index');delete require.cache[f];require(f);
  const map={...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}};map.onLoad({round:r.id});map.toggleLayer();map.toggleLayer();map.reset();map.onUnload();p.onShow();
  assert.equal(JSON.stringify(S.getRound(r.id)),before);assert.equal(p.data.displayScore,5);assert.equal(p.data.h.number,1);
  p.jump(2);p.guide();assert.match(routes.pop(),/hole-map\/index.*hole=2$/);
});
test('back-nine current hole 1 and other courses cannot open the A1 sample by mistake',()=>{
  const r=S.create({courseId:'cn_bg_585',mode:'back',friendIds:[],ruleSnapshot:E.defaultRules('stroke_play')});
  const p=loadPage('score',{id:r.id});assert.equal(p.data.h.number,1);p.guide();assert.match(routes.pop(),/hole-map\/index.*hole=1$/);
  const other=S.courses.find(c=>c.id!=='cn_bg_585');const c=loadPage('course',{id:other.id});c.maps();assert.equal(routes.pop(),'/packages/hole-map/index?course='+other.id);
});
test('an existing pre-unit draft displays the same distance unit that will be saved',()=>{
  const setup=loadPage('create',{course:'cn_bg_585'});
  S.mutate(d=>{delete d.draft.distanceUnit;d.settings.unit='m';});setup.onShow();
  assert.equal(setup.data.draft.distanceUnit,'m');setup.distanceUnit(event({unit:'yd'}));setup.onShow();
  assert.equal(setup.data.draft.distanceUnit,'yd');setup.start();assert.equal(S.active().distanceUnit,'yd');
});
test('distance unit is selected before starting and stays fixed with the round after preferences change',()=>{
  const setup=loadPage('create',{course:'cn_bg_585'});setup.distanceUnit(event({unit:'m'}));setup.tee({currentTarget:{dataset:{pid:'me'}},detail:{value:1}});setup.start();
  const r=S.active();assert.equal(r.distanceUnit,'m');assert.equal(r.players[0].tee,'Blue');
  S.mutate(d=>d.settings.unit='yd');const reloaded=S.getRound(r.id);assert.equal(reloaded.distanceUnit,'m');
  let def;global.Page=d=>def=d;const f=require.resolve('../miniprogram/packages/hole-map/index');delete require.cache[f];require(f);
  const map={...def,data:structuredClone(def.data),setData(d){Object.assign(this.data,d);}};map.onLoad({round:r.id});
  assert.equal(map.data.unit,'米');assert.equal(map.data.teeLabel,'蓝 Tee');map.toggleLayer();map.reset();assert.equal(map.state.unit,'m');assert.equal(S.getRound(r.id).players[0].tee,'Blue');
  const backup=JSON.stringify(S.read());S.importData(backup);assert.equal(S.getRound(r.id).distanceUnit,'m');
});
test('every route, template handler and JS file exists; WXML has no function calls',()=>{const root=path.join(__dirname,'../miniprogram');const app=JSON.parse(fs.readFileSync(root+'/app.json'));for(const route of app.pages){for(const ext of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(root+'/'+route+ext));let definition;global.Page=p=>definition=p;delete require.cache[require.resolve(root+'/'+route+'.js')];require(root+'/'+route+'.js');const w=fs.readFileSync(root+'/'+route+'.wxml','utf8');for(const [,h] of w.matchAll(/(?:bind|catch)[\w:]*="([a-zA-Z]+)"/g))assert.equal(typeof definition[h],'function',route+': '+h);for(const expr of w.matchAll(/{{(.*?)}}/g))assert.doesNotMatch(expr[1],/\.\w+\(/,'WXML cannot call functions');}for(const t of app.tabBar.list)assert.ok(app.pages.includes(t.pagePath));});
test('picker current values follow saved draft across page reopen',()=>{
  let p=loadPage('create',{course:'cn_bg_585'});p.tee({currentTarget:{dataset:{pid:'me'}},detail:{value:'2'}});p.startHole({detail:{value:'1'}});
  p=loadPage('create',{course:'cn_bg_585'});assert.equal(p.data.teePlayers[0].tee,'White');assert.equal(p.data.teePlayers[0].teeIndex,2);assert.equal(p.data.draft.start,10);
  let f=loadPage('feedback');f.category({detail:{value:'2'}});f=loadPage('feedback');assert.equal(f.data.draft.category,'球场资料纠错');assert.equal(f.data.categoryIndex,2);
});
test('read-only rule selectors and empty award options cannot change records',()=>{
  const r=create(),before=JSON.stringify(S.getRound(r.id)),p=loadPage('rules',{id:r.id,view:'1'}),rules=JSON.stringify(p.r.ruleSnapshot);
  p.change({currentTarget:{dataset:{index:0}},detail:{value:'1'}});assert.equal(JSON.stringify(p.r.ruleSnapshot),rules);
  const a=loadPage('adjust',{id:r.id,mode:'award'}),values=JSON.stringify(a.values);assert.equal(a.data.fields[0].options.length,0);
  a.change({currentTarget:{dataset:{index:0}},detail:{value:'0'}});assert.equal(JSON.stringify(a.values),values);assert.equal(JSON.stringify(S.getRound(r.id)),before);
});
