const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base=root+'/miniprogram';
function fixture(){
 const file=require.resolve('../miniprogram/services/dialog');delete require.cache[file];const D=require(file);let page={id:'one'};global.getCurrentPages=()=>[page];
 const load=name=>{let definition;global.Component=d=>definition=d;const f=require.resolve('../miniprogram/components/'+name+'/index');delete require.cache[f];require(f);const c={...definition.methods,data:structuredClone(definition.data||{}),setData(p){Object.assign(this.data,p);}};return {c,definition};};
 const {c,definition}=load('qy-dialog');definition.lifetimes.attached.call(c);
 return {D,c,definition,load,page,setPage:p=>page=p};
}
const choose=index=>({currentTarget:{dataset:{index}}});
test('confirmation and complete run once; cancellation does not save and hidden-page queues are cleared',()=>{
 const {D,c,definition}=fixture();const results=[];
 D.modal({title:'结束本组',success:r=>results.push(r),complete:()=>results.push('complete')});
 A.equal(c.data.open,true);c.confirm();c.confirm();A.deepEqual(results,[{confirm:true,cancel:false,content:''},'complete']);A.equal(c.data.open,false);
 D.modal({title:'清空本洞',success:r=>results.push(r.confirm)});D.modal({title:'后续',success:r=>results.push(r.confirm)});
 definition.pageLifetimes.hide.call(c);A.deepEqual(results.slice(-2),[false,false]);A.equal(c.data.open,false);
 definition.pageLifetimes.show.call(c);A.equal(c.data.open,false);
});
test('action menu can open a text popup immediately; text is returned only on confirm and complete always follows',()=>{
 const {D,c}=fixture();const received=[];
 D.actionSheet({itemList:['手动球友','常用球友'],success:r=>{received.push(r.tapIndex);D.modal({title:'姓名',editable:true,value:'球友',message:'输入姓名',success:r=>received.push(r)});}});
 c.choose(choose(0));A.equal(c.data.kind,'modal');A.equal(c.data.inputValue,'球友');A.equal(c.data.message,'输入姓名');
 c.input({detail:{value:'张先生'}});c.confirm();A.equal(received[1].content,'张先生');
 D.actionSheet({itemList:['操作'],fail:r=>received.push(r.errMsg),complete:()=>received.push('done')});c.close();A.deepEqual(received.slice(-2),['dialog:fail cancel','done']);
});
test('selection previews never mutate values on cancel, emits original index on confirmation, ignores disabled rows',()=>{
 const {D,c}=fixture(),values=[];const options={title:'先打',value:0,items:[{label:'老场'},{label:'天马场'},{label:'新场',disabled:true}],success:r=>values.push(r.value)};
 D.select(options);c.choose(choose(1));c.close();A.deepEqual(values,[]);D.select(options);A.equal(c.data.selected,0);c.choose(choose(2));A.equal(c.data.selected,0);c.choose(choose(1));c.confirm();A.deepEqual(values,[1]);
});
test('requests made before attachment wait; returning to previous page never revives a stale dialog',()=>{
 const file=require.resolve('../miniprogram/services/dialog');delete require.cache[file];const D=require(file),first={},second={};let page=first;global.getCurrentPages=()=>[page];const shown=[],results=[];
 D.modal({title:'first',success:r=>results.push(r.confirm)});A.deepEqual(shown,[]);
 const a=D.register(first,{show:r=>shown.push(r.options.title),hide(){}});A.deepEqual(shown,['first']);a.hide();page=second;
 const b=D.register(second,{show:r=>shown.push(r.options.title),hide(){}});D.modal({title:'second',success:r=>results.push(r.confirm)});b.detach();page=first;a.show();
 A.deepEqual(shown,['first','second']);A.deepEqual(results,[false,false]);
});
test('date selector handles leap days, month boundaries and bounds; time uses HH:mm',()=>{
 const {D,c}=fixture(),V=require('../miniprogram/services/dialog-values'),values=[];
 A.equal(V.calendar('2024-02-01').days.filter(d=>d.value).length,29);A.equal(V.calendar('2025-02-01').days.filter(d=>d.value).length,28);
 D.date({value:'2026-12-31',start:'2026-12-10',end:'2027-02-20',success:r=>values.push(r.value)});c.changeMonth({currentTarget:{dataset:{delta:1}}});A.equal(c.data.year,2027);A.equal(c.data.month,1);A.equal(c.data.date,'2026-12-31');
 c.chooseDate({currentTarget:{dataset:{value:'2027-01-02'}}});c.confirm();A.equal(values[0],'2027-01-02');
 D.date({value:'2026-12-01',start:'2026-12-10',end:'2026-12-20'});A.equal(c.data.date,'2026-12-10');c.chooseDate({currentTarget:{dataset:{value:'2026-12-21'}}});A.equal(c.data.date,'2026-12-10');c.close();
 D.time({value:'08:00',success:r=>values.push(r.value)});c.chooseTime({currentTarget:{dataset:{part:'hour',value:'09'}}});c.chooseTime({currentTarget:{dataset:{part:'minute',value:'35'}}});c.confirm();A.equal(values[1],'09:35');
});
test('picker forwards original selection event and disabled/empty fields do not open',()=>{
 const {c:host,load}=fixture(),{c:p}=load('qy-picker'),events=[];p.data={range:[{name:'A场'},{name:'C场'}],rangeKey:'name',value:0,mode:'selector',title:'再打'};p.triggerEvent=(type,detail)=>events.push({type,detail});
 p.open();host.choose(choose(1));host.confirm();A.deepEqual(events,[{type:'change',detail:{value:1}}]);
 p.data.disabled=true;p.open();A.equal(host.data.open,false);p.data.disabled=false;p.data.range=[];p.open();A.equal(host.data.open,false);
});

test('picker ignores stale option lists and double taps, and detached components cannot save',()=>{
 const {c:host,load}=fixture(),{c:p,definition}=load('qy-picker'),events=[],toasts=[];global.wx={showToast:o=>toasts.push(o.title)};
 p.data={range:['A场','B场'],rangeKey:'',value:0,mode:'selector',title:'洞段'};p.triggerEvent=(type,detail)=>events.push({type,detail});
 p.open();p.open();p.data.range=['B场','C场'];host.choose(choose(1));host.confirm();A.deepEqual(events,[]);A.equal(host.data.open,false);A.match(toasts[0],/选项已更新/);
 p.open();definition.lifetimes.detached.call(p);host.confirm();A.deepEqual(events,[]);
});
test('business dialogs have no native UI calls, all registered pages and map templates mount one host',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(path.join(dir,f.name)):[path.join(dir,f.name)]);}
 for(const file of [...walk(base),...walk(root+'/../templates')].filter(f=>/\.(js|wxml)$/.test(f))){const text=fs.readFileSync(file,'utf8');A.doesNotMatch(text,/\bwx\s*\.\s*(showModal|showActionSheet)\b|<picker(?=[\s>])/,'Native business UI in '+file);}
 const app=require(base+'/app.json'),pages=[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(page=>p.root+'/'+page))];
 for(const page of pages){const text=fs.readFileSync(base+'/'+page+'.wxml','utf8');A.equal((text.match(/<qy-dialog\b/g)||[]).length,1,page);}
 for(const template of ['course-map/index','gps-atlas/atlas'])A.match(fs.readFileSync(root+'/../templates/'+template+'.wxml','utf8'),/<qy-dialog\b/);
});
