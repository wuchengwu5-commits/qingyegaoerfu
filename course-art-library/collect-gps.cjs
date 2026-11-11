// Collect map data and existing media without changing the mini program or cloud.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),app=path.join(root,'qingye-miniprogram'),packages=path.join(app,'miniprogram/packages');
const catalog=require(path.join(root,'shared-golf/courses.json')).courses;
const Geo=require(path.join(packages,'qizhong-map/map-core'));
const bundles=[];
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function mediaFile(src){
 if(src.startsWith('cloud://')){
  const marker=['hole-gps-v1','hole-reference-v1','media-v1'].find(key=>src.includes('/'+key+'/'));
  if(!marker)return null;
  let relative=src.split('/'+marker+'/')[1];if(marker==='media-v1')relative=relative.replaceAll('__','/');
  return path.join(app,'cloud-assets',marker,relative);
 }
 return path.join(app,'cloud-assets/media-v1',src.replace(/^\//,''));
}
for(const name of fs.readdirSync(packages)){
 const folder=path.join(packages,name),configFile=path.join(folder,'course-config.js');
 if(!fs.existsSync(configFile))continue;
 const config=require(configFile),course=catalog.find(c=>c.id===config.courseId);if(!course)continue;
 const files={};
 function attach(name,file){if(file&&fs.existsSync(file)&&fs.statSync(file).isFile()){files[name]=file;return name;}return null;}
 const document={courseId:course.id,name:course.name,revision:'archive-20261105',kind:'overview',crs:'EPSG:4326',holes:[],reviewStatus:'历史卫星资料，待按新版流程复核',sources:{mapNote:config.mapNote,attribution:config.attribution},media:{}};
 const atlasConfigFile=path.join(folder,'atlas-config.js');
 let rows,atlas,photo,manifest;
 if(fs.existsSync(atlasConfigFile)){
  const cfg=require(atlasConfigFile);rows=require(path.join(folder,'atlas-catalog.js'));atlas=cfg.atlas;photo=cfg.photo;manifest=require(path.join(folder,'atlas-tiles.js'));document.boundary=require(path.join(folder,'atlas-boundary.js'));
  const dataset=path.join(app,'data/maps',name.replace('-map','-atlas'));
  if(fs.existsSync(path.join(dataset,'tee-review.json'))){document.teeReview=readJson(path.join(dataset,'tee-review.json'));document.reviewStatus='发球台已复核，终点与定位仍为卫星参考';}
  if(fs.existsSync(path.join(dataset,'sources.json')))document.sources=readJson(path.join(dataset,'sources.json'));
 }else if(config.courseId==='cn_bg_577'){
  rows=readJson(path.join(app,'data/maps/tianma-gps/database.json'));atlas=require(path.join(folder,'overview-data.js'));photo=config.atlas;manifest=require(path.join(folder,'image-tiles.js'));
  const mask=fs.readFileSync(path.join(folder,'atlas-mask.js'),'utf8'),outer=mask.match(/const outer = (\[[\s\S]*?\]);/),inner=mask.match(/const residential = (\[[\s\S]*?\]);/);
  if(outer){const scale=atlas.width/1200;document.boundary={outer:JSON.parse(outer[1]).map(p=>p.map(v=>v*scale)),exclusions:inner?[JSON.parse(inner[1]).map(p=>p.map(v=>v*scale))]:[]};}
  attach('sources/perimeter.js',path.join(folder,'atlas-mask.js'));
 }else{
  rows=Object.values(config.holes||{}).filter(h=>h.extent&&!h.diagram).map(h=>({id:h.id,courseId:course.id,number:h.number,par:h.par,tee:Geo.toGeo(h.defaultOrigin,h),target:Geo.toGeo(h.defaultTarget,h),green:Geo.toGeo(h.greenCenter,h),greenOutline:h.features.find(f=>f.id==='green').points.map(p=>Geo.toGeo(p,h)),route:(h.focusRoute||[h.defaultOrigin,h.defaultTarget,h.greenCenter]).map(p=>Geo.toGeo(p,h)),sourceCrop:{width:h.width,height:h.height,extent:h.extent},verified:!!h.verified}));
  atlas=config.overview;photo=config.atlas;manifest=fs.existsSync(path.join(folder,'image-tiles.js'))?require(path.join(folder,'image-tiles.js')):{};
 }
 document.atlas=atlas;document.atlasMedia=photo;
 document.revision=rows[0]?.revision||document.revision;document.kind=rows.length?'gps':'overview';
 const known=new Map(course.segments.flatMap(segment=>segment.holes.map(h=>[h.id,{...h,sectionId:segment.id,sectionName:segment.name}])));
 const previewFolder=config.courseId==='cn_bg_571'?path.join(root,'outputs/qizhong-tee-review/qizhong'):config.courseId==='cn_bg_611'?path.join(root,'outputs/qizhong-jiulongshan-atlas/jiulongshan'):null;
 document.preview=previewFolder?attach('previews/overview.png',path.join(previewFolder,'总览.png')):null;
 if(config.courseId==='cn_bg_577')document.preview=attach('previews/overview.png',path.join(root,'outputs/tianma-map-tone/微信总览.png'));
 for(const r of rows){
  const id=r._id||r.id,identity=known.get(id);if(!identity)throw Error('Unknown hole '+id);
  const h={...r,_id:id,sectionId:identity.sectionId,displayName:identity.sectionName+' '+identity.label+' 号洞'};
  if(previewFolder&&fs.existsSync(previewFolder)){
   const file=fs.readdirSync(previewFolder).find(f=>f.startsWith(String(h.number).padStart(2,'0')+'-')&&f.endsWith('.png'));
   if(file)h.preview=attach('previews/'+id+'.png',path.join(previewFolder,file));
  }
  document.holes.push(h);
 }
 const sources=new Set([photo,...Object.values(manifest).flatMap(m=>m.tiles.map(t=>t.src))]);
 if(fs.existsSync(atlasConfigFile))sources.add(require(atlasConfigFile).surround.src);
 if(config.courseId==='cn_bg_577')sources.add(require(path.join(folder,'atlas-context.js')).src);
 if(fs.existsSync(path.join(folder,'atlas-levels.js'))){const levels=require(path.join(folder,'atlas-levels.js'));document.imageLevels=levels;sources.add(levels.overview.src);sources.add(levels.surround.src);attach('package/atlas-levels.js',path.join(folder,'atlas-levels.js'));}
 for(const src of sources){if(typeof src!=='string')continue;const file=mediaFile(src);const logical='media/'+(src.startsWith('cloud://')?src.split('/').slice(3).join('/'):src.replace(/^\//,''));const stored=attach(logical,file);if(stored)document.media[src]=stored;}
 document.imageTiles=manifest;
 const sourceKey=name==='hole-map'?'yintao':name.replace('-map','');
 const original=path.join(root,'outputs/satellite-quality-2026-11-02',sourceKey);
 attach('sources/high-resolution.jpg',path.join(original,'satellite.jpg'));
 attach('sources/high-resolution-metadata.json',path.join(original,'imagery.json'));
 for(const dataKey of [sourceKey+'-atlas',sourceKey+'-gps']){
  const directory=path.join(app,'data/maps',dataKey);
  if(fs.existsSync(directory))for(const file of fs.readdirSync(directory))if(file.endsWith('.json'))attach('sources/'+dataKey+'/'+file,path.join(directory,file));
 }
 if(sourceKey==='qizhong')attach('sources/course-layout.jpg',path.join(root,'outputs/gps-rework-2026-11-02/qizhong-layout-reference.jpg'));
 if(sourceKey==='jiulongshan')attach('sources/high-resolution-4326.jpg',path.join(root,'outputs/jiulongshan-gps/research/hq-atlas.jpg'));
 attach('sources/course-config.js',configFile);
 bundles.push({document,files,title:document.kind==='gps'?config.shortName+' GPS 当前存档':config.shortName+' 卫星总览存档'});
}
const target=path.join(__dirname,'import-data/gps-manifests.json');fs.writeFileSync(target,JSON.stringify(bundles,null,2));
console.log(bundles.map(b=>({course:b.document.name,holes:b.document.holes.length,files:Object.keys(b.files).length})));
