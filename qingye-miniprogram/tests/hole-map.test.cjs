const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram'),D=require(base+'/packages/hole-map/data'),M=require(base+'/packages/hole-map/map-core');
test('image grid and geographic coordinates round trip without coordinate-system shift',()=>{for(const p of [[0,0],[768,1536],D.defaultOrigin,D.greenCenter]){const q=M.toPixel(M.toGeo(p,D),D);A.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<.00001);}A.ok(M.toGeo(D.greenCenter,D)[1]>M.toGeo(D.defaultOrigin,D)[1]);});
test('geodesic distance is symmetric, zero at same point and plausible for one degree',()=>{A.equal(M.meters([0,0],[0,0]),0);A.ok(Math.abs(M.meters([0,0],[1,0])-111195)<1);A.equal(M.distance(D.defaultOrigin,D.greenCenter,D),M.distance(D.greenCenter,D.defaultOrigin,D));});
test('front/back refer to line of approach, including approach from opposite side',()=>{const poly=[[0,0],[10,0],[10,20],[0,20]],c=[5,10];A.deepEqual(M.greenEdges([5,30],c,poly),{front:[5,20],back:[5,0]});A.deepEqual(M.greenEdges([5,-20],c,poly),{front:[5,0],back:[5,20]});});
test('sample front, center, back ordered; two legs are at least direct distance',()=>{const v=M.measure({origin:D.defaultOrigin,target:D.defaultTarget},D);A.ok(v.front<v.center&&v.center<v.back);A.ok(v.first+v.second>=v.center-.01);A.ok(v.center>300&&v.center<370);});
test('origin on green suppresses ambiguous front/back instead of misleading values',()=>{const v=M.measure({origin:D.greenCenter,target:D.defaultTarget},D);A.equal(v.onGreen,true);A.equal(v.center,0);A.equal(v.front,null);A.equal(v.back,null);});
test('unit conversion and out-of-bounds rejection are explicit',()=>{A.equal(M.value(91.44,'yd'),100);A.equal(M.value(91.44,'m'),91);A.equal(M.value(null,'m'),'—');A.equal(M.inBounds([-1,30],D),false);A.equal(M.inBounds([NaN,1],D),false);A.equal(M.inBounds([0,0],D),true);});
test('camera transformations do not change measurement coordinates',()=>{const c={scale:2.31,x:112,y:791},p=[130,700];const q=M.world(M.screen(p,c,D),c,D);A.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8);});
test('portrait focus rotation preserves geography and keeps the whole hole beside the distance rail',()=>{
  for(const [w,h] of [[390,758],[375,580],[440,620]]){
    const c=M.focusFit(w,h,D),origin=M.screen(D.defaultOrigin,c,D),green=M.screen(D.greenCenter,c,D);
    A.ok(Math.abs(origin[0]-green[0])<.001,'hole aligned vertically');
    A.ok(origin[0]>w*.36&&origin[0]<w-22);A.ok(green[1]>20&&origin[1]<h-40);
    for(const p of [D.defaultOrigin,D.defaultTarget,D.greenCenter]){const q=M.world(M.screen(p,c,D),c,D);A.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8);}
    const pixel=[w*.65,h*.4],anchor=M.world(pixel,c,D),before=M.distance(D.defaultOrigin,D.greenCenter,D);
    M.zoomCamera(c,1.7,pixel,D,c.scale,c.scale*5);const after=M.screen(anchor,c,D);
    A.ok(Math.hypot(after[0]-pixel[0],after[1]-pixel[1])<1e-8,'zoom remains anchored under pointer');
    A.equal(M.distance(D.defaultOrigin,D.greenCenter,D),before);
  }
});
test('draft remains identified and exactly five main-hole bunkers are present',()=>{A.equal(D.verified,false);A.equal(D.features.filter(f=>f.kind==='bunker').length,5);A.equal(D.imageryDate,'2025-04-25');A.equal(D.features.find(f=>f.id==='green').points.every(p=>M.inBounds(p,D)),true);A.ok(M.inside(D.greenCenter,D.features.find(f=>f.id==='green').points));});
test('native tiling preserves H5 geographic data, imagery and measured distances while allowing native focus styling',()=>{const web=path.resolve(base,'../../golf-h5/dist/yintao-hole1'),old=require(web+'/map-core');
 // The native portrait view has its own visual focus mask; geographic and measurement data must remain identical.
 const visual=new Set(['focusSolidBuffer','focusFeather','edgeFeather','maskStep','focusBoundary']);
 const geographic=data=>Object.fromEntries(Object.entries(data).filter(([key])=>!visual.has(key)));
 A.deepEqual(geographic(D),geographic(require(web+'/data')));
 A.deepEqual(fs.readFileSync(path.resolve(base,'../../outputs/package-quality-2026-11-03/before/images/packages/hole-map/satellite.jpg')),fs.readFileSync(web+'/satellite.jpg'));for(const target of [D.defaultTarget,D.greenCenter,[200,400]]){const state={origin:D.defaultOrigin,target};A.deepEqual(M.measure(state,D),old.measure(state,D));}});
function page(o={}){let def;global.Page=d=>def=d;delete require.cache[require.resolve(base+'/packages/hole-map/index')];require('./helpers/legacy-map.cjs').load(base+'/packages/hole-map/index.js');const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};p.onLoad({mode:'gps',...o});return p;}
test('location explicitly requests WGS84, never saves location; poor/outside fixes do not replace origin',()=>{let request;const messages=[];global.wx={requirePrivacyAuthorize:o=>o.success(),getLocation:o=>request=o,showToast:o=>messages.push(o.title)};const p=page(),original=p.state.origin.slice();p.locate();A.equal(request.type,'wgs84');request.success({longitude:0,latitude:0,accuracy:2});A.deepEqual(p.state.origin,original);A.match(messages.pop(),/附近/);p.locate();const g=M.toGeo(D.defaultTarget,D);request.success({longitude:g[0],latitude:g[1],accuracy:45});A.deepEqual(p.state.origin,original);A.match(messages.pop(),/偏差/);p.locate();request.success({longitude:g[0],latitude:g[1],accuracy:8});A.ok(Math.hypot(p.state.origin[0]-D.defaultTarget[0],p.state.origin[1]-D.defaultTarget[1])<.001);A.equal(p.state.accuracy,8);});
test('stale location callback cannot overwrite a reset or unloaded page',()=>{let request;global.wx={getLocation:o=>request=o,showToast:()=>{}};const p=page();p.locate();const g=M.toGeo(D.defaultTarget,D);p.reset();request.success({longitude:g[0],latitude:g[1],accuracy:3});A.deepEqual(p.state.origin,D.defaultOrigin);p.locate();p.onUnload();request.success({longitude:g[0],latitude:g[1],accuracy:3});A.deepEqual(p.state.origin,D.defaultOrigin);});
test('round Tee and unit are fixed on the map and player-specific',()=>{
  const {roundContext}=require(base+'/packages/hole-map/round-context');
  const r={distanceUnit:'m',currentPlayer:'me',players:[{id:'me',tee:'Blue'},{id:'p2',tee:'White'}]},before=JSON.stringify(r);
  A.deepEqual(roundContext(r),{unit:'m',teeLabel:'蓝 Tee',teeColor:'#5d87aa',hasRound:true});
  A.equal(roundContext({...r,currentPlayer:'p2'}).teeLabel,'白 Tee');A.equal(JSON.stringify(r),before);
  A.equal(roundContext(null).hasRound,false);A.equal(roundContext(null).teeLabel,'未开局');
  A.equal(roundContext({...r,distanceUnit:undefined}).unit,'yd');
  const p=page();A.equal(p.units,undefined);A.equal(p.tee,undefined);A.deepEqual(p.state.origin,D.defaultOrigin);
});
test('dragging the origin or target changes only that marker, even in the rotated map',()=>{
  global.wx={showToast:()=>{}};const p=page();p.ctx={};p.draw=()=>{};p.state.camera=M.focusFit(390,758,D);p.baseScale=p.state.camera.scale;
  const event=(xy,end=false)=>({touches:end?[]:[{x:xy[0],y:xy[1]}],changedTouches:[{x:xy[0],y:xy[1]}]});
  for(const name of ['origin','target']){
    const other=name==='origin'?'target':'origin',before=p.state[other].slice(),point=M.screen(p.state[name],p.state.camera,D),dest=[point[0]+10,point[1]-32];
    p.touchStart(event(point));p.touchMove(event(dest));p.touchEnd(event(dest,true));
    const expected=M.world(dest,p.state.camera,D);A.ok(Math.hypot(p.state[name][0]-expected[0],p.state[name][1]-expected[1])<1e-8);A.deepEqual(p.state[other],before);
  }
});
test('focus opacity fades continuously across a compact band and vanishes at image borders',()=>{
  const d={width:1000,height:1000,features:[{kind:'rough',points:[[400,300],[600,300],[600,700],[400,700]]}]};
  A.equal(M.focusOpacity([500,500],d),1);A.equal(M.focusOpacity([0,500],d),0);A.equal(M.focusOpacity([1000,500],d),0);
  const values=[610,630,660,700,735,745].map(x=>M.focusOpacity([x,500],d));
  A.ok(values.every((v,i)=>i===0||v<=values[i-1]));A.ok(values[0]>.9&&values[4]<.02);A.equal(values[5],0);
  for(let x=600;x<740;x++)A.ok(Math.abs(M.focusOpacity([x+1,500],d)-M.focusOpacity([x,500],d))<.012,'no hard opacity step');
});
test('subpackage and all native event handlers resolve; packages stay within 2 MiB',()=>{const app=JSON.parse(fs.readFileSync(base+'/app.json'));A.ok(app.subPackages.some(p=>p.root==='packages/hole-map'));const p=page(),w=fs.readFileSync(base+'/packages/hole-map/index.wxml','utf8');for(const [,h] of w.matchAll(/(?:bind|catch)[\w:]*="([a-zA-Z]+)"/g))A.equal(typeof p[h],'function',h);function bytes(dir){return fs.readdirSync(dir,{withFileTypes:true}).reduce((s,f)=>s+(f.isDirectory()?bytes(path.join(dir,f.name)):fs.statSync(path.join(dir,f.name)).size),0);}for(const pkg of app.subPackages)A.ok(bytes(base+'/'+pkg.root)<2*1024*1024,pkg.root);});
test('selector covers all 18 holes and maps round order back to course hole IDs',()=>{
 const S=require(base+'/services/store'),{holeContext}=require(base+'/packages/hole-map/hole-context'),c=S.courses.find(c=>c.id==='cn_bg_585');
 const ctx=holeContext(c,null,10);A.equal(ctx.holes.length,18);A.equal(ctx.groups.length,2);A.equal(ctx.selected.sourceId,'cn_bg_585_s2_h01');A.equal(ctx.selected.mapAvailable,true);
 const round={currentHole:1,holes:[{number:1,sourceHoleId:'cn_bg_585_s2_h01'},{number:2,sourceHoleId:'cn_bg_585_s2_h02'}]};
 A.equal(holeContext(c,round,1).selected.number,10);A.equal(holeContext(c,round,2).selected.number,11);
 A.equal(ctx.holes.filter(h=>h.mapAvailable).length,18);A.deepEqual(ctx.holes.filter(h=>h.enhancedAvailable).map(h=>h.number),[1]);
});
test('switching holes resets both markers, suppresses stale GPS and permits enhancement only on A1',()=>{
 let pending;global.wx={showToast:()=>{},getLocation:o=>pending=o};const p=page();p.locate();const a1Request=pending;p.selectHole(2);
 const d=p.mapData;A.equal(p.data.mapAvailable,true);A.equal(p.data.enhancedAvailable,false);A.equal(p.state.layer,'satellite');A.deepEqual(p.state.origin,d.defaultOrigin);A.deepEqual(p.state.target,d.defaultTarget);A.notDeepEqual(p.state.origin,D.defaultOrigin);
 a1Request.success({longitude:M.toGeo(D.defaultTarget,D)[0],latitude:M.toGeo(D.defaultTarget,D)[1],accuracy:3});A.deepEqual(p.state.origin,d.defaultOrigin);
 p.toggleLayer();A.equal(p.state.layer,'satellite');p.locate();const geo=M.toGeo(d.defaultTarget,d);pending.success({longitude:geo[0],latitude:geo[1],accuracy:3});A.ok(Math.hypot(...p.state.origin.map((v,i)=>v-d.defaultTarget[i]))<.001);
 p.locate();p.overview();const origin=p.state.origin.slice();pending.success({longitude:geo[0],latitude:geo[1],accuracy:3});A.deepEqual(p.state.origin,origin);const last=pending;p.locate();A.notEqual(pending,last);pending.success({longitude:geo[0],latitude:geo[1],accuracy:3});A.ok(p.overviewFix?.point);
 p.selectHole(10);A.equal(p.data.mapAvailable,true);A.equal(p.mapData.id,'cn_bg_585_s2_h01');p.selectHole(1);A.equal(p.mapData,D);A.equal(p.state.layer,'satellite');p.toggleLayer();A.equal(p.state.layer,'satellite');
});
test('overview frame includes the A1 image extent, fits on phones and preserves zoom anchors',()=>{
 const O=require(base+'/packages/hole-map/overview-core'),d=O.data,f=d.frame;
 for(const geo of [M.toGeo([0,0],D),M.toGeo([D.width,D.height],D)]){const p=M.toPixel(geo,d);A.ok(p[0]>=f.x&&p[0]<=f.x+f.width&&p[1]>=f.y&&p[1]<=f.y+f.height);}
 for(const [w,h] of [[390,758],[375,580]]){const c=O.fit(w,h);for(const p of [[f.x,f.y],[f.x+f.width,f.y],[f.x,f.y+f.height],[f.x+f.width,f.y+f.height]]){const q=M.screen(p,c,d);A.ok(q[0]>=0&&q[0]<=w&&q[1]>100&&q[1]<h-60);}
 const tap=[w/2,h/2],p=M.world(tap,c,d);M.zoomCamera(c,2,tap,d,c.scale,c.scale*5);A.ok(Math.hypot(...M.screen(p,c,d).map((x,i)=>x-tap[i]))<1e-8);}
});
test('old guide deep links redirect to the new map with course, round and hole intact',()=>{
 let def,route;global.Page=x=>def=x;global.wx={redirectTo:o=>route=o.url};const f=base+'/packages/course-guide/index.js';delete require.cache[require.resolve(f)];require(f);def.onLoad({course:'cn_bg_585',round:'a&b',hole:'10'});A.equal(route,'/packages/hole-map/atlas?course=cn_bg_585&round=a%26b&hole=10');
});
test('17 satellite crops preserve atlas geography, distinct greens and physical hole numbering',()=>{
 const O=require(base+'/packages/hole-map/overview-data'),H=require(base+'/packages/hole-map/satellite-holes').holes,ds=Object.values(H);
 A.equal(ds.length,17);A.equal(new Set(ds.map(d=>d.greenOsmId)).size,17);
 A.equal(H.cn_bg_585_s1_h04.greenOsmId,'650569356');A.equal(H.cn_bg_585_s1_h05.greenOsmId,'650569347');
 const S=require(base+'/services/store'),ctx=require(base+'/packages/hole-map/hole-context').holeContext(S.courses.find(c=>c.id===D.courseId));
 for(const d of ds){
  const f=d.sourceWindow;A.equal(d.par,ctx.holes.find(h=>h.sourceId===d.id).par);A.equal(d.satelliteOnly,true);A.equal(d.verified,false);
  A.ok(f.x>=0&&f.y>=0&&f.x+f.width<=O.width&&f.y+f.height<=O.height);
  const green=d.features.find(f=>f.id==='green');A.ok(M.inside(d.greenCenter,green.points));
  for(const p of [d.defaultOrigin,d.defaultTarget,d.greenCenter,...green.points,...d.focusRoute]){
   A.ok(M.inBounds(p,d),d.id);const geo=M.toGeo(p,d),atlasPixel=M.toPixel(geo,O);
   A.ok(Math.hypot(atlasPixel[0]-f.x-p[0],atlasPixel[1]-f.y-p[1])<1e-6,'crop pixels retain geographic coordinates');
   const q=M.toPixel(geo,d);A.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-6);
  }
  const v=M.measure({origin:d.defaultOrigin,target:d.defaultTarget},d);A.ok(v.front<v.center&&v.center<v.back);A.ok(v.center>100&&v.center<550);
  for(const [w,h] of [[390,758],[375,580]]){const camera=M.focusFit(w,h,d);for(const p of d.focusRoute){const q=M.screen(p,camera,d);A.ok(q[0]>w*.36&&q[0]<w-22&&q[1]>26&&q[1]<h-48,d.id);A.ok(M.focusOpacity(p,d)>.99);}const green=M.screen(d.greenCenter,camera,d),origin=M.screen(d.defaultOrigin,camera,d);A.ok(Math.abs(green[0]-origin[0])<1e-8);A.ok(green[1]<origin[1]);}
 }
});
test('satellite fallback crops the atlas rather than stretching the full course or painting a refined layer',()=>{
 const ds=Object.values(require(base+'/packages/hole-map/satellite-holes').holes),image={width:2048,height:2048};
 for(const d of ds){const calls=[],ctx=new Proxy({drawImage:(...args)=>calls.push(args),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  M.draw(ctx,image,390,758,{layer:'enhanced',camera:M.focusFit(390,758,d),clean:true},d);
  const f=d.sourceWindow;A.deepEqual(calls,[[image,f.x,f.y,f.width,f.height,0,0,d.width,d.height]]);
 }
});
test('other courses remain unavailable and never receive Yintao coordinates',()=>{
 global.wx={showToast:()=>{}};const S=require(base+'/services/store'),course=S.courses.find(c=>c.id!==D.courseId),p=page({course:course.id});
 A.equal(p.data.mapAvailable,false);A.equal(p.data.hasOverview,false);A.equal(p.mapData,null);A.equal(p.canMeasure(),false);p.locate();
});

test('par-three default views use comparable real-world scale to par-four holes at each phone size',()=>{
 const maps=[D,...Object.values(require(base+'/packages/hole-map/satellite-holes').holes)],reference=maps.find(d=>d.number===2);
 const density=(d,c)=>{const a=M.screen(d.defaultOrigin,c,d),b=M.screen(d.greenCenter,c,d);return Math.hypot(a[0]-b[0],a[1]-b[1])/M.distance(d.defaultOrigin,d.greenCenter,d);};
 for(const [w,h] of [[390,758],[375,580],[440,900]]){
  const usual=density(reference,M.focusFit(w,h,reference));
  for(const d of maps.filter(d=>d.par===3)){
   const old=M.focusFit(w,h,d),c=M.focusFit(w,h,d,maps),ratio=density(d,c)/usual;
   A.ok(ratio>.90&&ratio<1.10,'same physical distance has comparable screen length: hole '+d.number);
   A.ok(c.scale<=old.scale,'never enlarge a short hole beyond its whole-hole fit');
   for(const p of [d.defaultOrigin,d.defaultTarget,d.greenCenter]){const pixel=M.screen(p,c,d);A.ok(pixel[0]>w*.36&&pixel[0]<w-22&&pixel[1]>26&&pixel[1]<h-48);const back=M.world(pixel,c,d);A.ok(Math.hypot(back[0]-p[0],back[1]-p[1])<1e-8);}
  }
  for(const d of maps.filter(d=>d.par!==3))A.deepEqual(M.focusFit(w,h,d,maps),M.focusFit(w,h,d),'long-hole framing unchanged');
 }
 const short=maps.find(d=>d.number===5),unrelated=maps.filter(d=>d.par===4).map(d=>({...d,courseId:'another-course'}));
 A.deepEqual(M.focusFit(390,758,short,unrelated),M.focusFit(390,758,short),'do not borrow a different course scale');
});

test('native short-hole entry and reset keep the shared default scale while manual zoom remains available',()=>{
 global.wx={showToast:()=>{}};const p=page();p.ctx={};p.width=390;p.height=758;p.draw=()=>{};p.selectHole(5);
 const camera={...p.state.camera},origin=p.state.origin.slice(),target=p.state.target.slice(),measurement=M.measure(p.state,p.mapData);
 A.ok(camera.scale<M.focusFit(p.width,p.height,p.mapData).scale*.7,'actual page uses the smaller par-three default');
 p.zoomAt(1.8,[250,380]);A.ok(p.state.camera.scale>camera.scale);A.deepEqual(p.state.origin,origin);A.deepEqual(p.state.target,target);A.deepEqual(M.measure(p.state,p.mapData),measurement);
 p.reset();A.deepEqual(p.state.camera,camera);p.selectHole(6);p.selectHole(5);A.deepEqual(p.state.camera,camera);
});
