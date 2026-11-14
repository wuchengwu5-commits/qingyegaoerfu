const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),{createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),app=root+'/qingye-miniprogram/miniprogram',layer=require(app+'/services/map-layer');
test('only an explicit artwork request selects artwork; default and explicit GPS win over old preferences',()=>{
 for(const options of [{},{hole:1},{view:'focus'},{defaultFocusLayer:'art'},{layer:'gps',mode:'reference'},{layer:'art',mode:'gps'}])A.equal(layer.artRequested(options),false);
 for(const options of [{layer:'art'},{mode:'reference'}])A.equal(layer.artRequested(options),true);
});
function page(config){
 const file=app+'/packages/sheshan-map/atlas.js',native=createRequire(file);let def;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:p=>def=p,wx:{},setTimeout,clearTimeout,require:id=>id==='./atlas-config'?config:native(id)});
 return {...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)},fetchHoles(){},paint(){}};
}
test('adding artwork or restoring a stale course setting cannot change Sheshan default GPS',()=>{
 const real=require(app+'/packages/sheshan-map/atlas-config');
 for(const config of [{...real,art:{}},{...real},{...real,defaultFocusLayer:'art'}]){
  const p=page(config);p.onLoad({hole:1});p.hole={id:Object.keys(real.art)[0]};p.canvas={createImage(){throw Error('unexpected artwork decode')}};p.syncArt();
  A.equal(p.preferArt,false);A.equal(p.artEntry,undefined);
 }
 const explicit=page(real);explicit.onLoad({hole:1,layer:'art'});A.equal(explicit.preferArt,true);
 const reopened=page(real);reopened.onLoad({hole:1});A.equal(reopened.preferArt,false);
});
test('ordinary course/score entries and legacy bookmarks reach the default GPS layer without art parameters',()=>{
 const routes=require(app+'/services/course-map-route'),file=app+'/packages/sheshan-map/index.js',native=createRequire(file),oldWx=global.wx;let url,def;
 global.wx={navigateTo:o=>url=o.url};
 try{
  for(const args of [['cn_bg_2525'],['cn_bg_2525','round-1',3]]){
   routes.openFromPage({},...args);const parsed=new URL(url,'https://local.invalid');A.equal(parsed.pathname,'/packages/sheshan-map/atlas');
   A.equal(layer.artRequested(Object.fromEntries(parsed.searchParams)),false);
  }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:p=>def=p,require:native,wx:{redirectTo:o=>url=o.url},setTimeout,clearTimeout});
  const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad({course:'cn_bg_2525',hole:4});
  const parsed=new URL(url,'https://local.invalid');A.equal(parsed.pathname,'/packages/sheshan-map/atlas');A.equal(layer.artRequested(Object.fromEntries(parsed.searchParams)),false);
 }finally{global.wx=oldWx;}
});
test('regenerating registered artwork preserves assets and keeps an unqualified entry on GPS',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qingye-map-default-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const script=path.join(temp,'tools/gps-atlas/build-art-overlays.py'),maps=path.join(temp,'qingye-miniprogram/data/maps'),pkg=path.join(temp,'qingye-miniprogram/miniprogram/packages/sheshan-map');
 for(const dir of [path.dirname(script),maps,pkg])fs.mkdirSync(dir,{recursive:true});
 fs.copyFileSync(root+'/tools/gps-atlas/build-art-overlays.py',script);
 const art=require(app+'/packages/sheshan-map/atlas-art-data');
 fs.writeFileSync(path.join(maps,'sheshan-art-overlay.json'),JSON.stringify({package:'sheshan-map',revision:'test',registeredArt:art}));
 fs.writeFileSync(path.join(pkg,'atlas-config.js'),'module.exports={courseId:"cn_bg_2525"};\n// Registered artwork over the GPS canvas.\nObject.assign(module.exports,{defaultFocusLayer:"art"});\n');
 const result=spawnSync('python3',[script],{encoding:'utf8'});A.equal(result.status,0,result.stderr);
 const config=require(path.join(pkg,'atlas-config.js'));A.equal(Object.keys(config.art).length,18);A.deepEqual(config.art,art);A.notEqual(config.defaultFocusLayer,'art');
 const p=page(config);p.onLoad({hole:1});A.equal(p.preferArt,false);
});
