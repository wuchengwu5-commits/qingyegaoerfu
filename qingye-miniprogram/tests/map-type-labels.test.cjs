const {test}=require('node:test'),A=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../miniprogram'),Maps=require(base+'/services/course-map-route');
function capture(name){let def;global.Page=x=>def=x;const file=base+'/pages/'+name+'/index';delete require.cache[require.resolve(file)];require(file);return {...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};}
test('map types use only the two public names, omit unavailable types, and include all Tianma art',()=>{
 A.deepEqual(Maps.mapInfo('unknown').types,[]);A.equal(Maps.mapInfo('unknown').available,false);
 for(const [id,pkg,artCount] of [['cn_bg_577','tianma-map',27],['cn_bg_585','hole-map',18],['cn_bg_611','jiulongshan-map',27],['cn_bg_2525','sheshan-map',18]]){
 const actual=['cn_bg_577','cn_bg_2525'].includes(id)?require(base+'/packages/'+pkg+'/atlas-art-data'):require(base+'/packages/'+pkg+'/reference-holes');A.equal(Object.keys(actual).length,artCount);const info=Maps.mapInfo(id);A.equal(info.artHoles,artCount);A.deepEqual(info.types.map(t=>t.label),['GPS 卫星图','精修图']);A.equal(info.types[1].coverage,artCount+' 洞');}
 A.deepEqual(Maps.mapInfo('cn_bg_2525').types.map(t=>t.label),['GPS 卫星图','精修图']);
 for(const id of ['cn_bg_569','cn_bg_9127','cn_bg_579']){const info=Maps.mapInfo(id),count=Maps.gpsCount(id);A.equal(info.overviewOnly,count===0);A.deepEqual(info.types.map(t=>t.label),['GPS 卫星图']);A.equal(info.types[0].coverage,count?count+' 洞':'仅全览');}
});
test('directory refresh and detail page use identical map types, including favorites and no-map courses',()=>{
 const memory={};global.wx={getStorageSync:k=>memory[k],setStorageSync:(k,v)=>memory[k]=structuredClone(v),showToast:o=>{throw Error(o.title)}};const S=require(base+'/services/store');S.init();
 const noMap=S.courses.find(c=>!Maps.available(c.id));
 for(const id of ['cn_bg_577','cn_bg_585','cn_bg_2525','cn_bg_569',noMap.id]){
  const c=S.courses.find(c=>c.id===id),list=capture('courses');list.loadThumbnails=()=>{};list.data.query=c.name;list.refresh();const item=list.data.items.find(c=>c.id===id);A.ok(item,id);A.deepEqual(item.mapTypes,Maps.mapInfo(id).types);
  const detail=capture('course');detail.onLoad({id});A.deepEqual(detail.data.mapInfo.types,item.mapTypes);A.equal(detail.data.mapInfo.available,item.mapTypes.length>0);
  S.mutate(d=>d.favorites=[id]);list.data.filter='favorite';list.refresh();A.deepEqual(list.data.items[0].mapTypes,item.mapTypes);
 }
});
test('list and detail render one shared badge style without hard-coded per-course copy',()=>{
 const list=fs.readFileSync(base+'/pages/courses/index.wxml','utf8'),detail=fs.readFileSync(base+'/pages/course/index.wxml','utf8');A.match(list,/item.mapTypes.length/);A.match(detail,/wx:if="\{\{mapInfo.available\}\}"/);A.match(detail,/item.coverage/);A.doesNotMatch(detail,/27 洞卫星总览|球道参考图|cn_bg_577|可切换 GPS 图/);A.match(list,/course-map-badge/);A.match(detail,/course-map-badge/);
});
