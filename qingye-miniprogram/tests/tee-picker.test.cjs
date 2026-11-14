const Dialog=require('../miniprogram/services/dialog');
const {test}=require('node:test'),A=require('node:assert/strict');
function picker(range,value){let def;global.Component=c=>def=c;const f=require.resolve('../miniprogram/components/tee-picker/index');delete require.cache[f];require(f);const events=[];const c={...def.methods,data:{...def.data,range,value},setData(p){Object.assign(this.data,p);},triggerEvent(name,detail){events.push({name,detail});}};def.observers['range,value'].call(c,range,value);return {c,events};}
test('TEE choices have distinct colors, white is white and original values/indices are preserved',()=>{
 const {c,events}=picker(['Gold','Blue','White','Red','Black','Silver','自定义'],1);
 A.equal(c.data.current.name,'Blue');A.equal(c.data.options[2].color,'#ffffff');A.equal(new Set(c.data.options.map(x=>x.color)).size,7);
 let popup;Dialog.select=o=>popup=o;c.show();A.equal(popup.title,'选择发球台');A.equal(popup.value,1);A.equal(popup.items[2].color,'#ffffff');A.deepEqual(events,[]);A.equal(c.data.value,1);popup.success({value:3});A.deepEqual(events,[{name:'change',detail:{value:3}}]);
});
test('Chinese color names are supported and empty ranges do not open a selector',()=>{
 const {c}=picker(['蓝色','白梯','红 Tee'],0);A.equal(c.data.options[0].color,'#4086c6');A.equal(c.data.options[1].color,'#ffffff');A.equal(c.data.options[2].color,'#d65a55');
 const empty=picker([],0).c;let opened=false;Dialog.select=()=>opened=true;empty.show();A.equal(opened,false);
});
test('ended and cancelled competitions appear under ended history and never active',()=>{
 const H=require('../miniprogram/services/round-history');const items=H.cloud([],['ended','cancelled','published','active'].map((status,i)=>({id:String(i),status,title:'比赛',date:'2026-11-11'})));
 A.equal(H.select(items,'finished').length,3);A.equal(H.select(items,'active').length,1);
});
