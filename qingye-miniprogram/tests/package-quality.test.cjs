const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram'),B=base+'/packages/sheshan-map',Raster=require(B+'/raster-image'),C=require(B+'/course-config'),manifest=require(B+'/image-tiles');
const flush=()=>new Promise(r=>setImmediate(r));
function fakeCanvas(){const images=[];return {images,createImage(){const i={width:1024,height:1024,finished:false};images.push(i);return i;}};}
async function finish(canvas){for(let pass=0;pass<100;pass++){const waiting=canvas.images.filter(i=>!i.finished);if(!waiting.length){await flush();if(canvas.images.every(i=>i.finished))return;continue;}for(const i of waiting){i.finished=true;i.onload();}await flush();}throw new Error('Image queue did not settle');}
test('compressed catalog preserves every field and leaves headroom below 1.5 MiB',()=>{
 A.deepEqual(require(base+'/services/courses-data'),JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/courses.json'))));
 const files=[];function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);f.isDirectory()?walk(p):files.push(p);}}walk(base);
 const app=JSON.parse(fs.readFileSync(base+'/app.json'));
 for(const root of ['',...app.subPackages.map(x=>x.root)]){
  const group=files.filter(f=>root?f.startsWith(base+'/'+root+'/'):!app.subPackages.some(x=>f.startsWith(base+'/'+x.root+'/')));
  const bytes=group.reduce((n,f)=>n+fs.statSync(f).size,0);
  A.ok(bytes<(root?1.5*1024*1024:1300000),(root||'main')+': '+bytes+' bytes');
 }
 const media=files.filter(f=>/\.(png|jpe?g|webp|mp3|wav|mp4)$/i.test(f));
 // Match the Developer Tools 200 K media check conservatively using decimal bytes.
 // Keep local JPEG/transparent PNG compatibility assets within this actual budget.
 A.ok(media.reduce((n,f)=>n+fs.statSync(f).size,0)<200000,'all packaged image/audio bytes must remain below 200 K');
});
test('GPS catalog readers live with their map pages and city geometry stays outside the main package',()=>{
 const app=require(base+'/app.json');
 A.equal(fs.existsSync(base+'/services/gps-maps.js'),false);
 A.equal(fs.existsSync(base+'/services/location-cities-data.js'),false);
 A.ok(app.subPackages.some(p=>p.root==='packages/location-data'));
 A.ok(fs.existsSync(base+'/packages/location-data/location-cities-data.js'));
 const source=fs.readFileSync(path.resolve(__dirname,'../../templates/map-ui/gps-maps.js'));
 for(const {root} of app.subPackages.filter(p=>p.root.endsWith('-map'))){
  const dir=base+'/'+root;
  const callers=fs.readdirSync(dir).filter(file=>file.endsWith('.js')&&file!=='gps-maps.js')
    .map(file=>fs.readFileSync(dir+'/'+file,'utf8')).filter(code=>code.includes('gps-maps'));
  for(const code of callers)A.match(code,/require\('\.\/gps-maps'\)/,root);
  if(callers.length)A.deepEqual(fs.readFileSync(dir+'/gps-maps.js'),source,root);
 }
});
test('course-map controls share vector Tianma HUD and any remaining picker icons come from the main package',()=>{
 const app=JSON.parse(fs.readFileSync(base+'/app.json'));
 for(const pkg of app.subPackages.filter(p=>p.root.endsWith('-map'))){
  const w=fs.readFileSync(base+'/'+pkg.root+'/'+(pkg.pages.includes('index')?'index':pkg.pages[0])+'.wxml','utf8');
  const icons=[...w.matchAll(/src="(\/assets\/map-icons\/[^"{}]+\.png)"/g)].map(m=>m[1]);
  A.match(w,/class="atlas-hit"/,pkg.root+' vector control hit targets');
  A.deepEqual(fs.readFileSync(base+'/'+pkg.root+'/atlas-hud.js'),fs.readFileSync(path.resolve(__dirname,'../../templates/map-ui/atlas-hud.js')));
  for(const icon of icons)A.ok(fs.existsSync(base+icon),icon);
  A.doesNotMatch(w,/\{\{assetRoot\}\}\/icons\//);
  A.equal(fs.existsSync(base+'/'+pkg.root+'/icons'),false,pkg.root+' duplicated icons');
 }
});
test('a single hole decodes only intersecting tiles, with bounded concurrency and cache reuse',async()=>{
 const canvas=fakeCanvas(),loader=Raster.createLoader(canvas),region=C.defaultMap.sourceWindow,all=manifest[C.atlas].tiles;
 const task=loader.load(C.atlas,region);A.ok(canvas.images.length<=4);await finish(canvas);const image=await task;
 A.ok(image.tiles.length<all.length);A.ok(image.tiles.every(t=>Raster.intersects(t,region)));A.equal(image.width,C.overview.width);
 const before=canvas.images.length;await loader.load(C.atlas,region);A.equal(canvas.images.length,before);
 const full=loader.load(C.atlas);await finish(canvas);A.equal((await full).tiles.length,all.length);loader.close();
});
test('a failed tile can be retried without accepting its stale callback',async()=>{
 const canvas=fakeCanvas(),loader=Raster.createLoader(canvas),t=manifest[C.atlas].tiles[0],region={x:t.x,y:t.y,width:1,height:1};
 const first=loader.load(C.atlas,region);const old=canvas.images[0];old.finished=true;old.onerror();await A.rejects(first);
 const retry=loader.load(C.atlas,region);old.onload();A.equal(loader.ready(C.atlas,region),false);await finish(canvas);await retry;A.equal(loader.ready(C.atlas,region),true);
});
test('tile drawing preserves crop coordinates and destination scale across a seam',()=>{
 const calls=[],ctx={drawImage(...args){calls.push(args);}},a={},b={},image={tiles:[{image:a,x:0,y:0,width:512,height:512,left:0,top:0},{image:b,x:512,y:0,width:512,height:512,left:496,top:0}]};
 Raster.draw(ctx,image,500,100,40,50,0,0,80,100);
 A.deepEqual(calls,[[a,500,100,12,50,0,0,24,100],[b,16,100,28,50,24,0,56,100]]);
});
