const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('fs'),path=require('path');
const base=path.resolve(__dirname,'../miniprogram'),root=path.resolve(base,'../..'),B=base+'/packages/sheshan-map',Config=require(B+'/course-config'),M=require(B+'/map-core'),{holeContext}=require(B+'/hole-context'),S=require(base+'/services/store'),C=require(base+'/services/catalog'),course=S.courses.find(c=>c.id===Config.courseId);
function page(o={}){let def;global.Page=p=>def=p;delete require.cache[require.resolve(B+'/index')];require(B+'/index');const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x)}};p.onLoad(o);return p;}
test('18 distinct Sheshan holes use catalog IDs, Par, source geometry, and their own geographic atlas',()=>{
 const ctx=holeContext(course),holes=Object.values(Config.holes),atlas=Config.overview;A.equal(holes.length,18);A.equal(new Set(holes.map(h=>h.greenOsmId)).size,18);A.equal(new Set(holes.map(h=>h.originOsmId)).size,18);A.equal(ctx.holes.filter(h=>h.mapAvailable).length,18);A.equal(ctx.holes.filter(h=>h.enhancedAvailable).length,0);
 for(const d of holes){A.equal(d.par,ctx.holes.find(h=>h.sourceId===d.id).par);A.equal(d.verified,false);const f=d.sourceWindow,green=d.features.find(f=>f.id==='green');A.ok(M.inside(d.greenCenter,green.points));A.ok(f.x>=0&&f.y>=0&&f.x+f.width<=atlas.width&&f.y+f.height<=atlas.height);
 for(const p of [d.defaultOrigin,d.defaultTarget,d.greenCenter,...green.points,...d.focusRoute]){A.ok(M.inBounds(p,d));const geo=M.toGeo(p,d),back=M.toPixel(geo,d),ap=M.toPixel(geo,atlas);A.ok(geo[0]>121.20&&geo[0]<121.224&&geo[1]>31.104&&geo[1]<31.115);A.ok(Math.hypot(back[0]-p[0],back[1]-p[1])<1e-6);A.ok(Math.hypot(ap[0]-f.x-p[0],ap[1]-f.y-p[1])<1e-6);}
 const v=M.measure({origin:d.defaultOrigin,target:d.defaultTarget},d);A.ok(v.front<v.center&&v.center<v.back);A.ok(v.center>100&&v.center<550);A.ok(v.first+v.second>=v.center-.01);
 for(const [w,h] of [[375,580],[390,758]]){const camera=M.focusFit(w,h,d,holes);for(const p of d.focusRoute){const q=M.screen(p,camera,d);A.ok(q[0]>w*.36&&q[0]<w-22&&q[1]>26&&q[1]<h-48);}}
 }
 A.equal(Config.holes.cn_bg_2525_s1_h08.greenOsmId,'695631698');
});
test('rear-nine starts and reversed rounds resolve to physical holes 10-18 without changing scores',()=>{
 const back=C.sections(course)[1].holes,round={currentHole:1,holes:back.map((h,i)=>({...h,sourceHoleId:h.id,number:i+1})),scores:{me:{1:{grossStrokes:5}}}},before=JSON.stringify(round);
 for(let i=1;i<=9;i++)A.equal(holeContext(course,round,i).selected.number,i+9);
 A.equal(JSON.stringify(round),before);A.equal(holeContext(course,null,18).selected.sourceId,'cn_bg_2525_s2_h09');
});
test('Sheshan page switches holes, never exposes Yintao enhancement, and rejects stale fixes',()=>{
 let pending;global.wx={getLocation:o=>pending=o,showToast:()=>{}};const p=page({course:course.id});A.equal(p.mapData.courseId,course.id);A.equal(p.data.hasOverview,true);A.equal(p.data.enhancedAvailable,false);A.equal(p.state.layer,'satellite');p.toggleLayer();A.equal(p.state.layer,'satellite');p.locate();const old=pending;p.selectHole(10);old.success({longitude:121.2149,latitude:31.1133,accuracy:5});A.deepEqual(p.state.origin,p.mapData.defaultOrigin);
 p.locate();const geo=M.toGeo(p.mapData.defaultTarget,p.mapData);pending.success({longitude:geo[0],latitude:geo[1],accuracy:5});A.ok(Math.hypot(...p.state.origin.map((v,i)=>v-p.mapData.defaultTarget[i]))<.001);p.selectHole(18);A.equal(p.mapData.id,'cn_bg_2525_s2_h09');
});
test('manual Sheshan origins survive browsing and reset without retaining GPS positions',()=>{
 global.wx={};const p=page({course:course.id});p.manualOrigin=true;p.state.origin=p.mapData.defaultTarget.slice();const manual=p.state.origin.slice();p.selectHole(2);p.selectHole(1);A.deepEqual(p.state.origin,manual);p.reset();A.deepEqual(p.state.origin,manual);A.equal(p.data.locationText,'手动起点 · 可拖动');
});
test('legacy and mismatched package links route to the correct independent course package',()=>{
 let url;const storage={};global.wx={redirectTo:o=>url=o.url,getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=structuredClone(v)};page({course:'cn_bg_585',round:'a&b',hole:'10'});A.equal(url,'/packages/hole-map/index?course=cn_bg_585&round=a%26b&hole=10');
 let def;global.Page=p=>def=p;delete require.cache[require.resolve(base+'/packages/hole-map/index')];require(base+'/packages/hole-map/index');const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x)}};p.onLoad({course:course.id,hole:18});A.equal(url,'/packages/sheshan-map/index?course=cn_bg_2525&hole=18');
 delete require.cache[require.resolve(base+'/packages/course-guide/index')];require(base+'/packages/course-guide/index');def.onLoad({course:course.id,round:'r1',hole:10});A.equal(url,'/packages/sheshan-map/index?course=cn_bg_2525&round=r1&hole=10');
});
test('image loading uses Sheshan atlas only and recovers after a failed request',async()=>{
 global.wx={};const p=page({course:course.id}),calls=[];p.canvas={};p.rasterLoader={load(src,region){calls.push({src,region});return calls.length===1?Promise.reject(new Error('network')):Promise.resolve({width:2560,tiles:[]});}};
 await p.loadImages();A.equal(calls[0].src,Config.atlas);A.deepEqual(calls[0].region,p.mapData.sourceWindow);A.match(p.data.error,/加载失败/);
 await p.loadImages();A.equal(p.data.loading,false);A.equal(p.data.error,'');A.equal(p.loaded.atlas,true);
});
test('shared template stays identical across independent packages; native handlers and package budgets resolve',()=>{
 const bytes=p=>fs.readdirSync(p,{withFileTypes:true}).reduce((sum,f)=>sum+(f.isDirectory()?bytes(path.join(p,f.name)):fs.statSync(path.join(p,f.name)).size),0);
 global.wx={};const p=page({course:course.id});for(const [,handler] of fs.readFileSync(B+'/index.wxml','utf8').matchAll(/(?:bind|catch)[\w:]*="([a-zA-Z]+)"/g))A.equal(typeof p[handler],'function',handler);
 for(const name of fs.readdirSync(root+'/templates/course-map').filter(n=>!n.endsWith('.md')))for(const pkg of ['hole-map','sheshan-map'])A.deepEqual(fs.readFileSync(root+'/templates/course-map/'+name),fs.readFileSync(base+'/packages/'+pkg+'/'+name));
 const app=JSON.parse(fs.readFileSync(base+'/app.json'));for(const pkg of app.subPackages)A.ok(bytes(base+'/'+pkg.root)<2*1024*1024,pkg.root);const main=bytes(base)-bytes(base+'/packages');A.ok(main<2*1024*1024,'main package');
});
