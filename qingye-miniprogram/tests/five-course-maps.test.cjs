const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram'),M=require(base+'/packages/tianma-map/map-core'),L=require(base+'/packages/tianma-map/location-policy'),Routes=require(base+'/services/course-map-route');
const entries=[['xubao','cn_bg_583',36],['tianhong','cn_bg_581',27],['meilan-masters','cn_bg_569',18],['meilan-nicklaus','cn_bg_9127',18]];
test('the four requested courses expose complete GPS atlases with cloud imagery and independent endpoints',()=>{
 let total=0;for(const [key,id,count] of entries){const dir=base+'/packages/'+key+'-map',cfg=require(dir+'/atlas-config'),rows=require(dir+'/atlas-catalog'),Data=require(dir+'/atlas-data');A.equal(Routes.route(id),'/packages/'+key+'-map/atlas');A.equal(Routes.gpsCount(id),count);A.equal(Routes.mapInfo(id).overviewOnly,false);A.equal(rows.length,count);A.equal(Data.parse(rows).length,count);A.equal(new Set(rows.map(h=>h._id)).size,count);A.ok(rows.every(h=>h.courseId===id&&h.teeOutline.length>=3&&h.greenOutline.length>=3&&!h.verified));const manifest=require(dir+'/atlas-tiles');A.ok(manifest[cfg.photo].tiles.every(t=>fs.existsSync(path.resolve(base,'../cloud-assets/media-v1')+t.src)));total+=count;}A.equal(total,99);
});
test('the two historical Meilan overview links redirect to their complete atlas',()=>{
 for(const [key,id] of entries.filter(x=>x[0].startsWith('meilan'))){let definition,url;global.Page=p=>definition=p;global.wx={redirectTo:o=>url=o.url};const f=base+'/packages/'+key+'-map/index';delete require.cache[require.resolve(f)];require(f);definition.onLoad({course:id,hole:11});A.match(url,new RegExp('/packages/'+key+'-map/atlas'));A.match(url,/hole=11/);}
});
test('automatic hole matching requires one unambiguous geographic corridor',()=>{
 const cfg=require(base+'/packages/sheshan-map/course-config'),d=Object.values(cfg.holes)[0],geo=M.toGeo(d.defaultTarget,d),fix={longitude:geo[0],latitude:geo[1],accuracy:3};A.equal(L.resolveHole(fix,[d]).hole.id,d.id);A.equal(L.resolveHole(fix,[d,{...d,id:'ambiguous'}]),null);A.equal(L.resolveHole({...fix,accuracy:100},[d]),null);A.equal(L.resolveHole(fix,[{diagram:true}]),null);
});
test('north-up satellite view covers the viewport, while whole-course view contains all image corners',()=>{
 const O=require(base+'/packages/tianma-map/overview-core'),cfg=require(base+'/packages/tianma-map/course-config'),d=cfg.overview;A.equal(d.northUp,true);for(const [w,h] of [[390,758],[375,580]]){const c=O.fit(w,h,d),top=M.screen([0,0],c,d),bottom=M.screen([d.width,d.height],c,d);A.equal(c.angle,0);A.ok(top[0]<=0&&top[1]<=0&&bottom[0]>=w&&bottom[1]>=h);const whole=O.fit(w,h,{...d,fillViewport:false}),a=M.screen([0,0],whole,d),b=M.screen([d.width,d.height],whole,d);A.ok(a[0]>=0&&a[1]>=0&&b[0]<=w&&b[1]<=h);}
});
