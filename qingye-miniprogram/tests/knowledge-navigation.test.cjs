const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram');let memory={},routes=[],modal=null;
global.wx={__preview:true,getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:()=>{},showModal:o=>{modal=o;},navigateTo:o=>routes.push(['push',o.url]),redirectTo:o=>routes.push(['replace',o.url]),switchTab:o=>routes.push(['tab',o.url]),getWindowInfo:()=>({}),setClipboardData:o=>routes.push(['copy',o.data])};
const S=require(base+'/services/store'),E=require(base+'/services/engine'),K=require(base+'/services/knowledge'),articles=require(base+'/packages/knowledge/articles');
function page(name,o={}){let def;global.Page=p=>def=p;const file=require.resolve(base+'/'+name+'/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data||{}),setData(d){Object.assign(this.data,d);}};p.onLoad?.(o);return p;}
function event(dataset){return {currentTarget:{dataset}};}
function round(){return S.create({courseId:'cn_bg_585',mode:'all',friendIds:[],ruleSnapshot:E.defaultRules('stroke_play')});}
beforeEach(()=>{memory={};routes=[];modal=null;S.init();});
test('all four destinations agree with native custom tabs and the old score landing redirects',()=>{
 const app=require(base+'/app.json');assert.deepEqual(app.tabBar.list.map(t=>t.text),['首页','球场','知识','我的']);
 let component;global.Component=c=>component=c;require(base+'/custom-tab-bar/index');
 assert.deepEqual(component.data.tabs.map(t=>'pages/'+t.page+'/index'),app.tabBar.list.map(t=>t.pagePath));
 for(const t of app.tabBar.list){assert.ok(app.pages.includes(t.pagePath));assert.ok(fs.existsSync(base+'/'+t.iconPath));assert.ok(fs.existsSync(base+'/'+t.selectedIconPath));}
 const ui=require(base+'/services/ui');ui.go('play');ui.tab('play');page('pages/play');assert.ok(routes.every(r=>r[0]==='tab'&&r[1]==='/pages/courses/index'));
});
test('home starts with courses for a new player and resumes an existing round',()=>{
 const home=page('pages/home');home.start();assert.deepEqual(routes.pop(),['tab','/pages/courses/index']);
 const r=round();home.start();assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+r.id]);
});
test('selecting a course keeps the intended course through setup, without losing the active round',()=>{
 const course=page('pages/course',{id:'cn_bg_585'});course.start();assert.deepEqual(routes.pop(),['push','/pages/create/index?course=cn_bg_585']);
 const r=round();S.saveScore(r.id,'me',1,{strokes:5,putts:2,penalties:0});course.start();assert.ok(modal);modal.success({confirm:false});assert.equal(S.active().id,r.id);assert.equal(routes.length,0);
 course.start();modal.success({confirm:true});assert.equal(S.getRound(r.id).status,'paused');assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,5);assert.deepEqual(routes.pop(),['push','/pages/create/index?course=cn_bg_585']);
});
test('all 16 catalog articles open complete local bodies and official references',()=>{
 assert.equal(K.articles.length,16);assert.equal(new Set(K.articles.map(a=>a.id)).size,16);
 assert.deepEqual(K.categories.map(c=>K.list(c.id).length),[7,4,5]);
 for(const meta of K.articles){const p=page('packages/knowledge',{id:meta.id});assert.equal(p.data.article.title,meta.title);assert.ok(p.data.article.sections.length>=3);assert.ok(p.data.article.sections.every(s=>s.title&&s.body.length>30));assert.ok(p.data.article.takeaway);for(const s of p.data.article.sources)assert.match(s.url,/^https:\/\/(www\.randa\.org|www\.usga\.org)\//);}
 assert.equal(Object.keys(articles).length,K.articles.length);
});
test('knowledge search combines categories and keywords and recovers from empty results',()=>{
 const p=page('pages/knowledge');p.search({detail:{value:'  OB  '}});assert.deepEqual(p.data.items.map(a=>a.id),['lost']);
 p.category(event({id:'basics'}));assert.equal(p.data.count,0);p.clear();assert.equal(p.data.count,16);
 p.search({detail:{value:' GPS '}});assert.deepEqual(p.data.items.map(a=>a.id),['distance']);
 p.clear();p.category(event({id:'etiquette'}));assert.equal(p.data.count,4);p.article(event({id:p.data.items[0].id}));assert.match(routes.pop()[1],/knowledge\/index\?id=safety$/);
});
test('rules in My profile reach the rules catalog and legacy article links resolve',()=>{
 page('pages/profile').golfRules();assert.deepEqual(routes.pop(),['push','/packages/knowledge/index?category=rules']);
 const p=page('packages/knowledge',{category:'rules'});assert.equal(p.data.items.length,7);assert.ok(p.data.items.every(a=>a.category==='rules'));
 page('pages/guide',{group:'formats',article:'stroke'});assert.deepEqual(routes.pop(),['replace','/packages/knowledge/index?id=formats']);
 page('packages/knowledge',{id:'not-found'}).library();assert.deepEqual(routes.pop(),['tab','/pages/knowledge/index']);
});
test('paused rounds are discoverable and resume exactly where the player left off',()=>{
 let r=round();r=S.saveScore(r.id,'me',1,{strokes:5,putts:2,penalties:0});r.status='paused';r.currentHole=2;S.replace(r);
 const before=structuredClone(r.scores),p=page('pages/history',{filter:'paused'});p.onShow();assert.equal(p.data.items.length,1);
 p.open(event({id:r.id}));assert.equal(S.active().id,r.id);assert.equal(S.active().currentHole,2);assert.deepEqual(S.active().scores,before);assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+r.id]);
});
test('switching to a paused round requires confirmation and preserves both scores',()=>{
 let old=round();old.status='paused';S.replace(old);const active=round(),p=page('pages/history');
 p.open(event({id:old.id}));modal.success({confirm:false});assert.equal(S.active().id,active.id);assert.equal(S.getRound(old.id).status,'paused');assert.equal(routes.length,0);
 p.open(event({id:old.id}));modal.success({confirm:true});assert.equal(S.active().id,old.id);assert.equal(S.getRound(active.id).status,'paused');assert.equal(S.read().rounds.filter(r=>r.status==='active').length,1);
});
test('score pause returns home and recent paused round opens resumable history',()=>{
 const r=round(),score=page('pages/score',{id:r.id});score.pause();modal.success({confirm:true});assert.equal(S.getRound(r.id).status,'paused');assert.deepEqual(routes.pop(),['tab','/pages/home/index']);
 const profile=page('pages/profile');profile.data.recent={id:r.id,status:'paused'};profile.recent();assert.deepEqual(routes.pop(),['push','/pages/history/index?filter=paused']);
});
