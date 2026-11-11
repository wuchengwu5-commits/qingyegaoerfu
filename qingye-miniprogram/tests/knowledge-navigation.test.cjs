const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram');let memory={},routes=[],modal=null;
global.wx={__preview:true,getStorageSync:k=>memory[k]?structuredClone(memory[k]):'',setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:()=>{},showModal:o=>{modal=o;},navigateTo:o=>routes.push(['push',o.url]),redirectTo:o=>routes.push(['replace',o.url]),switchTab:o=>routes.push(['tab',o.url]),getWindowInfo:()=>({}),setClipboardData:o=>routes.push(['copy',o.data])};
const S=require(base+'/services/store'),E=require(base+'/services/engine'),K=require(base+'/services/knowledge'),articles=require(base+'/packages/knowledge/articles');
function page(name,o={}){let def;global.Page=p=>def=p;const file=require.resolve(base+'/'+name+'/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data||{}),setData(d){Object.assign(this.data,d);}};p.onLoad?.(o);return p;}
function event(dataset){return {currentTarget:{dataset}};}
function round(){return S.create({courseId:'cn_bg_585',mode:'all',friendIds:[],ruleSnapshot:E.defaultRules('stroke_play')});}
beforeEach(()=>{memory={};routes=[];modal=null;S.init();});
test('scoring is the second tab and courses third; both navigation helpers open the scoring hub',()=>{
 const app=require(base+'/app.json');assert.deepEqual(app.tabBar.list.map(t=>t.text),['首页','记分','球场','我的']);
 let component;global.Component=c=>component=c;require(base+'/custom-tab-bar/index');
 assert.deepEqual(component.data.tabs.map(t=>'pages/'+t.page+'/index'),app.tabBar.list.map(t=>t.pagePath));
 for(const t of app.tabBar.list){assert.ok(app.pages.includes(t.pagePath));assert.ok(fs.existsSync(base+'/'+t.iconPath));assert.ok(fs.existsSync(base+'/'+t.selectedIconPath));}
 const ui=require(base+'/services/ui');ui.go('play');ui.tab('play');assert.deepEqual(routes,[['tab','/pages/play/index'],['tab','/pages/play/index']]);
});
test('home starts with courses for a new player and resumes an existing round',()=>{
 const home=page('pages/home');home.start();assert.deepEqual(routes.pop(),['tab','/pages/courses/index']);
 const r=round();home.start();assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+r.id]);
});
test('selecting a course keeps the intended course through setup, without losing the active round',()=>{
 const course=page('pages/course',{id:'cn_bg_585'});course.start();assert.deepEqual(routes.pop(),['push','/pages/create/index?course=cn_bg_585']);
 const r=round();S.saveScore(r.id,'me',1,{strokes:5,putts:2,penalties:0});course.start();assert.equal(modal,null);assert.equal(S.getRound(r.id).status,'active');assert.equal(S.getRound(r.id).scores.me[1].grossStrokes,5);assert.deepEqual(routes.pop(),['push','/pages/create/index?course=cn_bg_585']);
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
test('My opens a compact knowledge collection; article and legacy links still resolve',()=>{
 page('pages/profile').knowledge();assert.deepEqual(routes.pop(),['push','/pages/knowledge/index']);const k=page('pages/knowledge');assert.equal(k.data.expanded,false);assert.equal(k.data.essentials.length,3);assert.ok(k.data.essentials.every(a=>a?.id));k.toggle();assert.equal(k.data.expanded,true);
 const p=page('packages/knowledge',{category:'rules'});assert.equal(p.data.items.length,7);assert.ok(p.data.items.every(a=>a.category==='rules'));
 page('pages/guide',{group:'formats',article:'stroke'});assert.deepEqual(routes.pop(),['replace','/packages/knowledge/index?id=formats']);
 page('packages/knowledge',{id:'not-found'}).library();assert.deepEqual(routes.pop(),['replace','/pages/knowledge/index']);
});
test('paused rounds are discoverable and resume exactly where the player left off',()=>{
 let r=round();r=S.saveScore(r.id,'me',1,{strokes:5,putts:2,penalties:0});r.status='paused';r.currentHole=2;S.replace(r);
 const before=structuredClone(r.scores),p=page('pages/history',{filter:'active'});p.onShow();assert.equal(p.data.items.length,1);
 p.open(event({id:p.data.items[0].key}));assert.equal(S.active().id,r.id);assert.equal(S.active().currentHole,2);assert.deepEqual(S.active().scores,before);assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+r.id]);
});
test('switching to a paused round resumes it alongside the other active group',()=>{
 let old=round();old=S.saveScore(old.id,'me',1,{strokes:5});old.status='paused';S.replace(old);const active=round();S.saveScore(active.id,'me',1,{strokes:6});const p=page('pages/history');
 p.onShow();p.open(event({id:p.data.items.find(item=>item.id===old.id).key}));assert.equal(modal,null);assert.equal(S.getRound(old.id).status,'active');assert.equal(S.getRound(active.id).status,'active');assert.equal(S.read().rounds.filter(r=>r.status==='active').length,2);assert.equal(S.getRound(old.id).scores.me[1].strokes,5);assert.equal(S.getRound(active.id).scores.me[1].strokes,6);assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+old.id]);
});
test('save and return keeps the group active and its scores intact; legacy paused rounds remain accessible',()=>{
 const r=round();S.saveScore(r.id,'me',1,{strokes:5,putts:2,penalties:0});
 const before=structuredClone(S.getRound(r.id)),score=page('pages/score',{id:r.id});score.pause();
 assert.equal(modal,null);assert.equal(S.getRound(r.id).status,'active');assert.deepEqual(S.getRound(r.id).scores,before.scores);assert.deepEqual(routes.pop(),['tab','/pages/play/index']);
 const profile=page('pages/profile');profile.data.recent={id:r.id,status:'paused'};profile.recent();assert.deepEqual(routes.pop(),['push','/pages/history/index?filter=paused']);
 const history=page('pages/history',{filter:'paused'});history.onShow();assert.ok(history.data.items.some(item=>item.id===r.id));
});

test('scoring hub opens course selection, resumes saved setup and prioritizes an active scorecard',()=>{
 const hub=page('pages/play');hub.onShow();hub.start();assert.deepEqual(routes.pop(),['tab','/pages/courses/index']);
 S.mutate(d=>d.draft={courseId:'cn_bg_585',activityId:'activity',groupId:'group'});
 hub.onShow();hub.start();assert.deepEqual(routes.pop(),['push','/pages/create/index?course=cn_bg_585&activity=activity&group=group']);
 const r=round();hub.onShow();hub.start();assert.deepEqual(routes.pop(),['push','/pages/score/index?id='+r.id]);
});
test('three named policies freeze valid terms, survive a change of game, and preserve old record labels',()=>{
 const P=require(base+'/services/scoring-policies'),F=require(base+'/services/forms'),R=require(base+'/services/rules'),cloudRules=require('../cloudfunctions/qingye/lib/rules');
 const r=round();for(const option of P.options){
  F.set(r,'penaltyPolicy.mode',option.id);assert.equal(R.validateRuleConfig(r),true);assert.equal(cloudRules.validateRuleConfig(r),true);
  const field=F.fields(r).find(f=>f.key==='penaltyPolicy.mode');assert.deepEqual(field.options.map(o=>o.label),['球场规则','大流氓','小流氓']);
 }
 const legacy={...P.make('large'),mode:'custom'};delete legacy.preset;r.ruleSnapshot.penaltyPolicy=legacy;
 assert.equal(F.fields(r).find(f=>f.key==='penaltyPolicy.mode').displayValue,'旧版自定义规则');assert.equal(R.validateRuleConfig(r),true);
 const form=page('pages/create',{course:'cn_bg_585'});form.onShow();form.selectPolicy(event({id:'small'}));
 const terms=structuredClone(form.data.draft.ruleSnapshot.penaltyPolicy);
 form.template(event({id:'stroke_play'}));modal.success({confirm:true});assert.deepEqual(form.data.draft.ruleSnapshot.penaltyPolicy,terms);
 form.onShow();assert.deepEqual(form.data.draft.ruleSnapshot.penaltyPolicy,terms);
});
