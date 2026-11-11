// Shared directory; the picker returns a course without leaving its creation form.
module.exports=function createCourseDirectory({picking=false}={}){
const Maps=require('./course-map-route');
const Media=require('./media');
const Feed=require('./course-feed');
const Scene=require('./scene');
const Slogans=require('./slogans');
const {S,run,go}=require('./ui'),C=require('./catalog'),L=require('./location'),Remote=require('./remote');
const regionGroups=[
 ['华东',['上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省']],
 ['华北',['北京市','天津市','河北省','山西省','内蒙古自治区']],
 ['华南',['广东省','广西壮族自治区','海南省']],
 ['华中',['河南省','湖北省','湖南省']],
 ['东北',['辽宁省','吉林省','黑龙江省']],
 ['西南',['重庆市','四川省','贵州省','云南省','西藏自治区']],
 ['西北',['陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区']],
 ['港澳台',['香港特别行政区','澳门特别行政区','台湾省']]
].map(([name,ids])=>({name,items:ids.filter(id=>C.regions.includes(id)).map(id=>({id,name:id.replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/,'')}))}));
return {data:{pickerMode:picking,selectedCourseId:'',regionOpen:false,regionGroups,moreRegionLabel:'更多',moreRegionActive:false,quickRegions:[{id:'all',name:'全部'},{id:'上海市',name:'上海'},{id:'江苏省',name:'江苏'},{id:'浙江省',name:'浙江'}],query:'',province:'all',items:[],count:0,location:{status:'idle'},visible:10,page:1,feedMode:'nearby',filter:'all'},onLoad(options={}){this.setData({selectedCourseId:picking?(options.selected||''):''});this.destroyed=false;this.thumbnailCache=new Map();this.thumbnailJobs=new Set();this.ranks=Feed.randomRanks(S.courses);this.setData({topInset:picking?0:Scene.topInset()});this.off=L.subscribe(()=>this.refresh());},onReady(){if(L.state().status==='idle')L.request();},onShow(){this.setData({page:1,visible:10});this.setData({slogan:picking?{title:'选择比赛球场',subtitle:'选好球场，继续创建你的赛事。'}:Slogans.get('courses')});if(!picking)Scene.selectTab(this,2);this.refresh();if(L.state().status==='ready')L.request();Remote.sync().then(()=>{if(!this.destroyed)this.refresh();}).catch(()=>{});},onHide(){this.closeRegions();},onUnload(){this.destroyed=true;Scene.setTabHidden(this,false);if(this.off)this.off();},onReachBottom(){if(this.data.items.length>=this.data.count)return;this.setData({page:this.data.page+1});this.refresh();},more(){this.onReachBottom();},refresh(){run(()=>{let cs=C.search(S.courses,this.data.query,this.data.province),loc=L.state(),d=S.read();if(picking)cs=cs.filter(c=>c.tees?.length&&C.canScore(c));if(this.data.filter==='favorite')cs=cs.filter(c=>d.favorites.includes(c.id));let firstCount=10,feedMode='nearby';if(loc.fix)cs=L.sort(cs,loc.fix,false);else{const feed=Feed.withoutLocation(cs,d.rounds,this.ranks||Feed.randomRanks(S.courses));cs=feed.courses.map(c=>L.locateCourse(c,null));firstCount=feed.firstCount;feedMode=feed.mode;}const visible=firstCount+(this.data.page-1)*10;const nearest=loc.fix?L.nearest(S.courses,loc.fix):null;const moreRegionActive=!this.data.quickRegions.some(r=>r.id===this.data.province),selectedRegion=regionGroups.flatMap(g=>g.items).find(r=>r.id===this.data.province);this.setData({moreRegionActive,moreRegionLabel:moreRegionActive?selectedRegion?.name||'更多':'更多',location:loc,nearest:nearest?{id:nearest.id,name:nearest.name,distanceText:nearest.distanceText}:null,feedMode,visible,count:cs.length,total:S.courses.length,items:cs.slice(0,visible).map(c=>({id:c.id,name:c.name,mapTypes:Maps.mapInfo(c.id).types,thumbnail:this.thumbnailCache?.get(Scene.courseThumbnail(c.id))||'',thumbnailSource:Scene.courseThumbnail(c.id),city:c.city||c.province,holes:c.holes,par:c.par,distanceText:c.distanceText,distanceKm:c.distanceKm,canScore:C.canScore(c),favorite:d.favorites.includes(c.id)}))});this.loadThumbnails();});},loadThumbnails(){for(const source of new Set(this.data.items.map(x=>x.thumbnailSource))){if(this.thumbnailCache?.has(source)||this.thumbnailJobs?.has(source))continue;this.thumbnailJobs?.add(source);Media.local(source).then(local=>{if(this.destroyed)return;this.thumbnailCache?.set(source,local);this.setData({items:this.data.items.map(item=>item.thumbnailSource===source?{...item,thumbnail:local}:item)});}).catch(()=>{}).finally(()=>this.thumbnailJobs?.delete(source));}},quickProvince(e){this.setData({province:e.currentTarget.dataset.id,visible:10,page:1});this.refresh();},search(e){this.setData({query:e.detail.value,visible:10,page:1});this.refresh();},openRegions(){Scene.setTabHidden(this,true);this.setData({regionOpen:true});},closeRegions(){this.setData({regionOpen:false});Scene.setTabHidden(this,false);},noop(){},chooseRegion(e){const id=e.currentTarget.dataset.id;if(id!=='all'&&!C.regions.includes(id))return;this.setData({province:id,visible:10,page:1});this.closeRegions();this.refresh();},filter(e){this.setData({filter:e.currentTarget.dataset.id,visible:10,page:1});this.refresh();},locate(){if(L.state().status==='denied')L.settings();else L.request(true);},select(e){
 const id=e.currentTarget.dataset.id;
 if(!picking)return go('course','?id='+id);
 const course=S.courses.find(c=>c.id===id);
 if(this.returning||!course?.tees?.length||!C.canScore(course))return;
 const channel=this.getOpenerEventChannel?.();
 if(!channel?.emit)return wx.showToast({title:'请从赛事创建页重新选择球场',icon:'none'});
 this.returning=true;
 channel.emit('courseSelected',{id});
 wx.navigateBack({delta:1,fail:()=>{this.returning=false;wx.showToast({title:'返回失败，请点击左上角返回',icon:'none'});}});
},favorite(e){const id=e.currentTarget.dataset.id;run(()=>{S.mutate(d=>d.favorites=d.favorites.includes(id)?d.favorites.filter(x=>x!==id):d.favorites.concat(id));this.refresh();});}};
};
