const {test}=require('node:test'),A=require('node:assert/strict'),Feed=require('../miniprogram/services/course-feed');
const courses=Array.from({length:35},(_,i)=>({id:'c'+i}));
test('offline feed starts with unique recently played courses in recency order and appends a stable random remainder',()=>{
 const ranks=Feed.randomRanks(courses,()=>.37),rounds=[{courseId:'c3',createdAt:9},{courseId:'c4',createdAt:20},{courseId:'c3',createdAt:18},{courseId:'gone',createdAt:30}];
 const before=JSON.stringify({courses,rounds}),a=Feed.withoutLocation(courses,rounds,ranks),b=Feed.withoutLocation(courses,rounds,ranks);
 A.deepEqual(a.courses.slice(0,2).map(x=>x.id),['c4','c3']);A.equal(a.firstCount,2);A.equal(a.mode,'recent');A.equal(new Set(a.courses.map(x=>x.id)).size,35);A.deepEqual(a,b);A.equal(JSON.stringify({courses,rounds}),before);
 const random=Feed.withoutLocation(courses,[],ranks);A.equal(random.firstCount,10);A.equal(random.mode,'random');A.equal(random.courses.length,35);
});
test('filtered offline feed never reintroduces excluded courses and caps many recent courses at ten',()=>{
 const ranks=Feed.randomRanks(courses),rounds=courses.map((x,i)=>({courseId:x.id,createdAt:i})),all=Feed.withoutLocation(courses,rounds,ranks);
 A.equal(all.firstCount,10);const subset=Feed.withoutLocation(courses.slice(0,3),rounds,ranks);A.equal(subset.courses.length,3);A.equal(subset.firstCount,3);A.deepEqual(Feed.withoutLocation([],rounds,ranks).courses,[]);
});
test('directory loads ten then ten more, preserves rows, and resets to ten when searching',t=>{
 const names=['../miniprogram/services/ui','../miniprogram/services/catalog','../miniprogram/services/location','../miniprogram/services/remote','../miniprogram/pages/courses/index'],paths=names.map(require.resolve),saved=paths.map(p=>require.cache[p]);
 const old={wx:global.wx,Page:global.Page};let definition;
 const mocks=[{S:{courses,read:()=>({rounds:[],favorites:[]})},run:fn=>fn()},{regions:[],search:()=>courses,canScore:()=>true},{state:()=>({status:'denied'}),locateCourse:c=>c,subscribe:()=>()=>{}},{sync:()=>Promise.resolve()}];
 mocks.forEach((exports,i)=>require.cache[paths[i]]={exports});global.wx={getWindowInfo:()=>({})};global.Page=p=>definition=p;delete require.cache[paths[4]];require(paths[4]);
 t.after(()=>{paths.forEach((p,i)=>saved[i]?require.cache[p]=saved[i]:delete require.cache[p]);Object.assign(global,old);});
 const page={...definition,data:structuredClone(definition.data),setData(d){Object.assign(this.data,d);}};page.onLoad();page.refresh();A.equal(page.data.items.length,10);const ids=page.data.items.map(x=>x.id);page.onReachBottom();A.equal(page.data.items.length,20);A.deepEqual(page.data.items.slice(0,10).map(x=>x.id),ids);page.search({detail:{value:''}});A.equal(page.data.items.length,10);
});
function share(t,home){
 const names=['../miniprogram/services/backgrounds','../miniprogram/services/media','../miniprogram/services/store','../miniprogram/pages/share/index'],paths=names.map(require.resolve),saved=paths.map(p=>require.cache[p]),old={Page:global.Page,wx:global.wx};const images=[];let definition;
 const mocks=[{items:()=>[...Array.from({length:8},(_,i)=>({id:'bg'+i,name:'景'+i,fileID:'cloud://bg'+i}))],apply:home},{local:src=>Promise.resolve('/cached/'+src)},{getRound:()=>({id:'r',courseName:'球场',date:'2026-11-05',players:[{id:'me'}],holes:[],scores:{me:{}}})}];
 mocks.forEach((exports,i)=>require.cache[paths[i]]={exports});global.wx={createSelectorQuery:()=>({in(){return this;},select(){return this;},fields(){return this;},exec(cb){cb([{node:{getContext:()=>({}),createImage(){const image={};images.push(image);return image;}}}]);}})};global.Page=p=>definition=p;delete require.cache[paths[3]];require(paths[3]);
 t.after(()=>{paths.forEach((p,i)=>saved[i]?require.cache[p]=saved[i]:delete require.cache[p]);Object.assign(global,old);});const page={...definition,data:structuredClone(definition.data),setData(d){Object.assign(this.data,d);}};page.onLoad({id:'r'});return {page,images};
}
test('sharing defaults to actual homepage background and exposes the same eight optional themes',async t=>{const {page,images}=share(t,async()=>({src:'/cached/home-scene.jpg'}));A.equal(page.data.backgrounds.length,9);await page.draw();A.equal(images[0].src,'/cached/home-scene.jpg');page.background({detail:{value:2}});await new Promise(r=>setImmediate(r));A.equal(images[1].src,'/cached/cloud://bg1');});
test('a slow homepage image cannot overwrite a newer selected sharing theme',async t=>{let resolve;const {page,images}=share(t,()=>new Promise(r=>resolve=r)),first=page.draw();page.background({detail:{value:1}});await new Promise(r=>setImmediate(r));resolve({src:'/old-home.jpg'});await first;A.equal(images.length,1);A.equal(images[0].src,'/cached/cloud://bg0');});
test('failed sharing background clears stale generated image and offers retry',async t=>{const {page}=share(t,async()=>{throw Error('offline');});page.data.path='/old-poster.jpg';await page.draw();A.equal(page.data.path,'');A.equal(page.data.busy,false);A.match(page.data.error,/重试/);});
