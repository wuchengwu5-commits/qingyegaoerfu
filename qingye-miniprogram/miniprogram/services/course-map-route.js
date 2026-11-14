const routes={cn_bg_1379:'/packages/anying-forest-map/atlas',cn_bg_24212:'/packages/anying-links-map/atlas',cn_bg_581:'/packages/tianhong-map/atlas',cn_bg_583:'/packages/xubao-map/atlas',cn_bg_2529:'/packages/anting-map/index',cn_bg_575:'/packages/tomson-map/index',cn_bg_587:'/packages/palmbeach-map/index',cn_bg_579:'/packages/xiehe-map/index',cn_bg_3981:'/packages/dongzhuang-links-map/index',cn_bg_2533:'/packages/dongzhuang-garden-map/index',cn_bg_611:'/packages/jiulongshan-map/index',cn_bg_585:'/packages/hole-map/atlas',cn_bg_2525:'/packages/sheshan-map/atlas',cn_bg_577:'/packages/tianma-map/trial',cn_bg_565:'/packages/huakai-map/atlas',cn_bg_567:'/packages/links-map/atlas',cn_bg_569:'/packages/meilan-masters-map/atlas',cn_bg_9127:'/packages/meilan-nicklaus-map/atlas',cn_bg_571:'/packages/qizhong-map/index'};
const suzhou=require('./suzhou-gps-maps');
for(const [id,map] of Object.entries(suzhou))routes[id]='/packages/'+map.package+'/atlas';
function route(id){return routes[id]||'/packages/hole-map/index';}
function openFromPage(page,courseId,roundId,hole,round){
 if(page.openingCourseMap)return;
 const context=require('./map-round');
 context.prepare(round&&round.id===roundId&&round.courseId===courseId?round:null);
 page.openingCourseMap=true;
 const url=route(courseId)+'?course='+encodeURIComponent(courseId)
  +(roundId?'&round='+encodeURIComponent(roundId)+'&hole='+encodeURIComponent(hole):'')
  +(!gpsAvailable(courseId)?'&view=overview':'');
 wx.navigateTo({url,fail(){page.openingCourseMap=false;context.prepare(null);}});
}
function available(id){return !!routes[id];}
function gpsCount(id){return suzhou[id]?.gpsHoles||({cn_bg_1379:18,cn_bg_24212:18,cn_bg_579:18,cn_bg_9127:18,cn_bg_569:18,cn_bg_581:27,cn_bg_583:36,cn_bg_2529:18,cn_bg_575:18,cn_bg_587:18,cn_bg_3981:18,cn_bg_2533:18,cn_bg_565:18,cn_bg_567:18,cn_bg_611:27,cn_bg_585:18,cn_bg_2525:18,cn_bg_571:18,cn_bg_577:27})[id]||0;}
function gpsAvailable(id){return gpsCount(id)>0;}
function referenceCount(id){return ({cn_bg_577:27,cn_bg_585:18,cn_bg_611:27,cn_bg_2525:18})[id]||0;}
// Single public vocabulary for directory badges, course details and future map entries.
function overviewAvailable(id){return !!suzhou[id]||gpsAvailable(id)||['cn_bg_569','cn_bg_9127','cn_bg_579'].includes(id);}
function mapInfo(id){
 const gps=overviewAvailable(id),gpsHoles=gpsCount(id),artHoles=referenceCount(id),types=[];
 const total=suzhou[id]?.catalogHoles;
 if(gps)types.push({id:'gps',label:'GPS 卫星图',count:gpsHoles,coverage:gpsHoles?(total&&gpsHoles<total?gpsHoles+' / '+total:gpsHoles)+' 洞':'仅全览'});
 if(artHoles)types.push({id:'art',label:'精修图',count:artHoles,coverage:artHoles+' 洞'});
 return {available:types.length>0,types,gpsHoles,artHoles,overviewOnly:gps&&!gpsHoles};
}
module.exports={mapInfo,overviewAvailable,route,openFromPage,available,gpsAvailable,gpsCount,referenceCount};
