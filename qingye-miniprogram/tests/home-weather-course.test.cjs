const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('homepage weather follows the visible course and its timer never refreshes phone GPS',()=>{
 let def,timer,locationRequests=0;const course={id:'course-1',name:'目标球场',latitude:31.1,longitude:121.2,city:'上海市',distanceText:'约 8 公里'},requests=[];
 const loc={status:'ready',fix:{latitude:31.3,longitude:121.5}};
 const S={read:()=>({profile:{}}),active:()=>null,stats:()=>({}),courses:[course]};
 const W={state:()=>({}),view:s=>s,updateCourse:c=>requests.push(c),refreshDelay:()=>3600000};
 const dependencies={backgrounds:{FALLBACK_THEME:{}},scene:{},weather:W,slogans:{},ui:{S,run:fn=>fn()},location:{state:()=>loc,sort:c=>c,nearest:()=>course,request:()=>locationRequests++},remote:{},catalog:{sections:()=>[]}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/index.js'),'utf8'),{Page:p=>def=p,require:id=>dependencies[id.split('/').at(-1)],setTimeout:fn=>(timer=fn,1),clearTimeout(){}});
 const p={...def,shown:true,data:{},setData(data){Object.assign(this.data,data);}};p.refresh();A.equal(p.data.featured.id,course.id);A.equal(requests[0],course);A.notEqual(requests[0].latitude,loc.fix.latitude);
 p.scheduleWeather({});timer();A.equal(locationRequests,0);A.equal(requests.length,2);A.equal(requests[1],course);
});
