const {test}=require('node:test'),A=require('node:assert/strict');
const C=require('../miniprogram/services/catalog'),courses=require('../miniprogram/services/courses-data').courses,Scene=require('../miniprogram/services/scene');
const event=id=>({currentTarget:{dataset:{id}}});
function setup(t){
 const names=['../miniprogram/services/ui','../miniprogram/services/location','../miniprogram/services/remote','../miniprogram/pages/courses/index'];
 const paths=names.map(require.resolve),saved=paths.map(p=>require.cache[p]),oldPage=global.Page,oldWx=global.wx;
 let definition,unsubscribed=false;const favorites=[],bar={data:{hidden:false},setData(d){Object.assign(this.data,d);}};
 const stubs=[{S:{courses,read:()=>({favorites})},run:fn=>fn()},{state:()=>({status:'denied'}),locateCourse:c=>c,subscribe:()=>()=>unsubscribed=true},{sync:()=>Promise.resolve()}];
 stubs.forEach((exports,i)=>require.cache[paths[i]]={id:paths[i],filename:paths[i],loaded:true,exports});
 global.Page=p=>definition=p;global.wx={getWindowInfo:()=>({statusBarHeight:20})};delete require.cache[paths[3]];require(paths[3]);
 const page={...definition,data:structuredClone(definition.data),setData(d){Object.assign(this.data,d);},getTabBar:()=>bar};
 page.onLoad();page.refresh();
 t.after(()=>{paths.forEach((p,i)=>saved[i]?require.cache[p]=saved[i]:delete require.cache[p]);global.Page=oldPage;global.wx=oldWx;});
 return {page,bar,favorites,unsubscribed:()=>unsubscribed};
}
test('every region is selectable and filters the real catalog with pagination reset',t=>{
 const {page,bar}=setup(t),ids=page.data.regionGroups.flatMap(g=>g.items.map(r=>r.id));
 A.equal(ids.length,34);A.equal(new Set(ids).size,34);A.deepEqual([...ids].sort(),[...C.regions].sort());
 for(const id of ids){
  page.data.visible=90;page.openRegions();A.equal(bar.data.hidden,true);page.chooseRegion(event(id));
  const expected=courses.filter(c=>c.province===id);
  A.equal(page.data.count,expected.length);A.deepEqual(page.data.items.map(c=>c.id),expected.slice(0,30).map(c=>c.id));
  A.equal(page.data.visible,30);A.equal(page.data.regionOpen,false);A.equal(bar.data.hidden,false);
  const quick=page.data.quickRegions.some(r=>r.id===id);A.equal(page.data.moreRegionActive,!quick);
  if(!quick)A.equal(page.data.moreRegionLabel,page.data.regionGroups.flatMap(g=>g.items).find(r=>r.id===id).name);
 }
 page.chooseRegion(event('all'));A.equal(page.data.count,courses.length);A.equal(page.data.moreRegionLabel,'更多');A.equal(page.data.moreRegionActive,false);
});
test('region changes preserve search and favorite filters; invalid selections leave the sheet open',t=>{
 const {page,bar,favorites}=setup(t),course=courses.find(c=>c.province==='广东省');favorites.push(course.id);
 page.search({detail:{value:course.name}});page.filter(event('favorite'));page.openRegions();page.chooseRegion(event('广东省'));
 A.deepEqual(page.data.items.map(c=>c.id),[course.id]);A.equal(page.data.query,course.name);A.equal(page.data.filter,'favorite');
 page.chooseRegion(event('北京市'));A.equal(page.data.count,0);A.deepEqual(page.data.items,[]);
 page.chooseRegion(event('all'));A.equal(page.data.count,1);
 page.openRegions();page.chooseRegion(event('unknown'));A.equal(page.data.province,'all');A.equal(page.data.regionOpen,true);A.equal(bar.data.hidden,true);
});
test('closing, hiding and unloading the region sheet restore navigation without changing the filter',t=>{
 const {page,bar,unsubscribed}=setup(t);page.chooseRegion(event('新疆维吾尔自治区'));
 for(const close of ['closeRegions','onHide']){page.openRegions();page[close]();A.equal(page.data.regionOpen,false);A.equal(bar.data.hidden,false);A.equal(page.data.province,'新疆维吾尔自治区');}
 page.openRegions();page.onUnload();A.equal(bar.data.hidden,false);A.equal(unsubscribed(),true);
 bar.data.hidden=true;Scene.selectTab(page,3);A.equal(bar.data.hidden,false);A.equal(bar.data.selected,3);
});
test('directory thumbnails resolve to the configured cloud assets',t=>{
 const {page}=setup(t);A.ok(page.data.items.length);for(const course of page.data.items)A.match(course.thumbnail,/^cloud:\/\/[^/]+\/media-v1\/assets__course-[0-2]\.jpg$/);
});
