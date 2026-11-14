const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict');
const S=require('../miniprogram/services/store'),Account=require('../miniprogram/services/account'),L=require('../miniprogram/services/location'),Shortcuts=require('../miniprogram/services/course-shortcuts');
const template=S.courses.find(c=>c.id==='cn_bg_585'),origin={latitude:31.2,longitude:121.2,time:Date.now()};
const course=(id,longitude,extra={})=>({...structuredClone(template),id,name:id,latitude:31.2,longitude,...extra});
const event=id=>({currentTarget:{dataset:{id}}});
let memory,pages,routes,loc,listeners,requests,settings,originals;
beforeEach(()=>{
 memory={};pages=[];routes=[];loc={status:'ready',fix:origin};listeners=new Set();requests=0;settings=0;
 global.wx={__preview:true,getStorageSync:k=>structuredClone(memory[k]||''),setStorageSync:(k,v)=>memory[k]=structuredClone(v),navigateTo:o=>routes.push(o.url),showToast(){},pageScrollTo(){}};S.init();
 originals={state:L.state,request:L.request,settings:L.settings,subscribe:L.subscribe,user:Account.user};
 L.state=()=>loc;L.request=async()=>{requests++;return loc.fix;};L.settings=async()=>{settings++;};L.subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};Account.user=()=>null;
});
afterEach(()=>{pages.forEach(p=>p.onUnload());Object.assign(L,{state:originals.state,request:originals.request,settings:originals.settings,subscribe:originals.subscribe});Account.user=originals.user;delete global.Page;});
function page(o={fresh:'1'}){let def;global.Page=x=>def=x;const file=require.resolve('../miniprogram/pages/create/index');delete require.cache[file];require(file);const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};pages.push(p);p.onLoad(o);p.onShow();return p;}
test('four distinct choices rank by actual distance, including favorites across cities; closed/incomplete courses never appear',()=>{
 const courses=[course('far',121.9),course('favorite-2',121.25),course('closed',121.2,{operationStatus:'closed_reported'}),course('missing-tee',121.2,{tees:[]}),course('near-2',121.22),course('favorite-1',121.24,{city:'苏州'}),course('near-1',121.21),course('no-coordinate',null)];
 const r=Shortcuts.build(courses,['near-1','favorite-2','favorite-1','far','closed'],origin);
 A.deepEqual(r.nearbyCourses.map(c=>c.id),['near-1','near-2']);A.deepEqual(r.favoriteCourses.map(c=>c.id),['favorite-1','favorite-2']);A.equal(r.nearbyCourses[0].favorite,true);A.ok([...r.nearbyCourses,...r.favoriteCourses].every(c=>c.distanceText));
});
test('no permission keeps favorites selectable without invented distances; fewer favorites and duplicates never create filler',()=>{
 const courses=[course('one',121.21),course('two',121.22)];
 const denied=Shortcuts.build(courses,['one'],null);A.equal(denied.nearbyCourses.length,0);A.equal(denied.favoriteCourses.length,1);A.equal(denied.favoriteCourses[0].distanceText,'');
 const overlap=Shortcuts.build(courses,['one'],origin);A.equal(overlap.favoriteCourses.length,0);A.equal(overlap.favoriteCourseCount,1);A.equal(Shortcuts.build(courses,[],null).favoriteCourseCount,0);
});
test('one tap selects the course in-place, builds its route, and preserves existing scores; a second tap cannot choose another course',()=>{
 const old=S.create({courseId:'cn_bg_585'});S.saveScore(old.id,'me',1,{strokes:6});const before=JSON.stringify(S.read().rounds),p=page();A.equal(p.data.nearbyCourses.length,2);const [first,second]=p.data.nearbyCourses;
 p.selectSuggestedCourse(event(first.id));A.equal(p.data.course.id,first.id);A.equal(S.read().draft.courseId,first.id);A.equal(p.data.step,1);A.ok(p.data.segments.length);A.equal(p.data.showCourseShortcuts,false);A.equal(routes.length,0);A.equal(JSON.stringify(S.read().rounds),before);
 p.selectSuggestedCourse(event(second.id));A.equal(p.data.course.id,first.id);p.next();A.equal(p.data.step,2);
});
test('viewing suggestions, receiving GPS and returning from the list cannot change an unselected old draft',async()=>{
 page({course:'cn_bg_585'});const before=JSON.stringify(S.read().draft),p=page();p.onReady();await Promise.resolve();A.equal(requests,1);A.equal(JSON.stringify(S.read().draft),before);
 loc={status:'ready',fix:{latitude:39.9,longitude:116.4,time:Date.now()}};listeners.forEach(fn=>fn());A.equal(JSON.stringify(S.read().draft),before);p.openCoursePicker();A.match(routes.at(-1),/context=round/);p.onShow();A.equal(p.data.course,null);A.equal(JSON.stringify(S.read().draft),before);
});
test('permission recovery uses location settings; hidden/unloaded pages and online groups ignore late recommendations',async()=>{
 loc={status:'denied',fix:null};S.mutate(d=>d.favorites=['cn_bg_585']);const p=page();A.equal(p.data.favoriteCourses[0].id,'cn_bg_585');await p.locateShortcuts();A.equal(settings,1);
 const snapshot=JSON.stringify(p.data);p.onHide();loc={status:'ready',fix:origin};listeners.forEach(fn=>fn());A.equal(JSON.stringify(p.data),snapshot);p.onUnload();p.selectSuggestedCourse(event('cn_bg_585'));A.equal(S.read().draft,undefined);
 const online=page({activity:'a',group:'g'});online.onReady();A.equal(online.data.showCourseShortcuts,false);A.equal(requests,0);online.selectSuggestedCourse(event('cn_bg_585'));A.equal(S.read().draft,undefined);
});
test('location refresh after selection never replaces the chosen course or route',async()=>{
 let finish;L.request=()=>new Promise(resolve=>finish=resolve);const p=page();p.onReady();const id=p.data.nearbyCourses[0].id;p.selectSuggestedCourse(event(id));const before=JSON.stringify(p.data.draft);
 loc={status:'ready',fix:{latitude:39.9,longitude:116.4,time:Date.now()}};listeners.forEach(fn=>fn());finish(loc.fix);await Promise.resolve();A.equal(p.data.course.id,id);A.equal(JSON.stringify(p.data.draft),before);
});
