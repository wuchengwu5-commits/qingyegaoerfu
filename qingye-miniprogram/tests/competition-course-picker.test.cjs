const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../miniprogram/services/catalog'),courses=require('../miniprogram/services/courses-data').courses;
const event=id=>({currentTarget:{dataset:{id}}});
const instance=definition=>({...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p);}});
function fixture(){
 let form,navigation,back=0;const routes=[];
 const S={courses,id:()=> 'draft-1',read:()=>({rounds:[],favorites:[]})};
 const wx={hideKeyboard(){},showToast(){},navigateTo:o=>{routes.push(o.url);navigation=o;},navigateBack:()=>back++};
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/packages/competition/index.js'),'utf8'),{
  Page:d=>form=instance(d),wx,clearTimeout(){},setTimeout:()=>0,
  require(name){if(name.endsWith('/dialog'))return {}; if(name.endsWith('/account'))return {user:()=>({uid:'test'}),needLogin:()=>true,call:async()=>[]};if(name.endsWith('/catalog'))return C;if(name.endsWith('/invite-code'))return {};if(name.endsWith('/ui'))return {S};throw Error(name);}
 });
 form.onLoad();form.beginSetup();form.setData({title:'我们的周末赛',date:'2026-11-15',localRules:'以当日球场公告为准'});
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/services/course-directory-page'),'utf8'),{module,wx,
  require(name){if(name.endsWith('/dialog'))return {}; if(name==='./ui')return {S,run:fn=>fn(),go:(...args)=>routes.push(args)};if(name==='./catalog')return C;
   if(name==='./location')return {state:()=>({status:'denied'}),locateCourse:c=>c,subscribe:()=>()=>{}};
   if(name==='./remote')return {sync:async()=>{}};if(name==='./course-map-route')return {mapInfo:()=>({types:[]})};
   if(name==='./media')return {local:async()=>''};if(name==='./scene')return {topInset:()=>30,selectTab(){},setTabHidden(){},courseThumbnail:()=>''};
   if(name==='./slogans')return {get:()=>({title:'球场'})};if(name==='./course-feed')return require('../miniprogram/services/course-feed');throw Error(name);}
 });
 const picker=()=>{const p=instance(module.exports({picking:true}));p.getOpenerEventChannel=()=>({emit:(name,selection)=>navigation.events[name](selection)});p.onLoad({selected:form.data.course?.id||''});p.onShow();return p;};
 return {form,picker,routes,get back(){return back;},get navigation(){return navigation;},directory:()=>instance(module.exports())};
}
test('full-page course selection returns to the existing event draft and preserves its fields',()=>{
 const f=fixture(),form=f.form;form.openCoursePicker();form.openCoursePicker();A.equal(f.routes.length,1);A.match(f.routes[0],/^\/packages\/competition\/course-picker\?/);
 const picker=f.picker();picker.search({detail:{value:'佘山'}});A.ok(picker.data.items.length);A.ok(picker.data.items.every(c=>c.canScore));
 const id=picker.data.items[0].id;picker.select(event(id));picker.select(event(id));A.equal(f.back,1);A.equal(form.data.course.id,id);
 A.equal(form.data.title,'我们的周末赛');A.equal(form.data.date,'2026-11-15');A.equal(form.data.localRules,'以当日球场公告为准');A.equal(form.data.setup,true);A.equal(form.data.sections.length>0,true);
 form.onShow();form.secondSegment({detail:{value:0}});form.openCoursePicker();const same=f.picker();A.equal(same.data.selectedCourseId,id);same.select(event(id));A.equal(form.data.second,0);
});
test('cancelling or returning a stale picker cannot replace a draft; normal course browsing is unchanged',()=>{
 const f=fixture(),form=f.form;form.chooseCourse(event('cn_bg_2525'));form.openCoursePicker();const before=JSON.stringify(form.data);f.picker().onUnload();A.equal(JSON.stringify(form.data),before);
 const callback=f.navigation.events.courseSelected;form.createId='a-new-draft';callback({id:'cn_bg_577'});A.equal(form.data.course.id,'cn_bg_2525');
 const regular=f.directory();regular.select(event('cn_bg_577'));A.deepEqual(Array.from(f.routes.at(-1)),['course','?id=cn_bg_577']);
});
test('only complete scoreable courses can be selected, and automatic titles follow a changed course',()=>{
 const f=fixture();f.form.data.title='';f.form.chooseCourse(event('cn_bg_2525'));A.match(f.form.data.title,/佘山/);f.form.chooseCourse(event('cn_bg_577'));A.match(f.form.data.title,/天马/);
 f.form.openCoursePicker();const picker=f.picker();const invalid=courses.find(c=>!c.tees?.length||!C.canScore(c));A.ok(invalid);picker.select(event(invalid.id));A.equal(f.back,0);A.equal(f.form.data.course.id,'cn_bg_577');
 A.ok(picker.data.items.every(item=>{const c=courses.find(c=>c.id===item.id);return c.tees.length&&C.canScore(c);}));
});
