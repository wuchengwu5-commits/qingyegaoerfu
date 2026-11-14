const R=require('./rules');
// Basic WHS score-differential aggregation, not a certified Handicap Index.
// Missing ratings/adjusted gross scores are never replaced with Par or raw total.
const TABLE=[[3,1,-2],[4,1,-1],[5,1,0],[6,2,-1],[8,2,0],[11,3,0],[14,4,0],[16,5,0],[18,6,0],[19,7,0],[20,8,0]];
const tenth=x=>Math.round((x+Number.EPSILON)*10)/10;
function differential(r,pid){
 const v=r.handicapInputs?.[pid];
 if(r.holes.length!==18||!R.strictEligible(r,pid))return null;
 if(!v||v.tee!==r.players.find(p=>p.id===pid)?.tee||v.confirmed!==true)return null;
 if(!Number.isFinite(v.courseRating)||v.courseRating<50||v.courseRating>90||!Number.isFinite(v.slopeRating)||v.slopeRating<55||v.slopeRating>155||!Number.isFinite(v.adjustedGross)||v.adjustedGross<18||v.adjustedGross>400||!Number.isFinite(v.pcc)||v.pcc< -1||v.pcc>3)return null;
 return tenth(113/v.slopeRating*(v.adjustedGross-v.courseRating-v.pcc));
}
function aggregate(values){
 const recent=values.slice(-20);if(recent.length<3)return null;
 const [,count,adjust]=TABLE.find(([max])=>recent.length<=max);
 return {value:Math.min(54,tenth(recent.slice().sort((a,b)=>a-b).slice(0,count).reduce((a,b)=>a+b,0)/count+adjust)),count,total:recent.length};
}
function format(v){return Number.isFinite(v)?v<0?'+'+Math.abs(v).toFixed(1):v.toFixed(1):'—';}
function recordsFor(data,pid='me'){
 const rounds=(pid==='me'?require('./service').personalRecords(data):data.rounds.filter(r=>r.players.some(p=>p.id===pid)&&R.isFinished(r)).map(r=>({r,pid}))).sort((a,b)=>String(a.r.date).localeCompare(String(b.r.date))||(a.r.finishedAt||0)-(b.r.finishedAt||0));
 return rounds;
}
function summary(data,pid='me'){
 const rounds=recordsFor(data,pid);
 const records=rounds.map(({r,pid:player})=>{const personal=pid==='me'?data.personalHandicapInputs?.[r.id]:null;if(personal)r={...r,handicapInputs:{...r.handicapInputs,[player]:personal}};return {r,player,value:differential(r,player)};}),valid=records.filter(x=>x.value!==null),automatic=aggregate(valid.map(x=>x.value));
 const person=pid==='me'?data.profile:data.friends.find(p=>p.id===pid)||{},manual=person.handicapSetting?.mode==='manual'?person.handicapSetting.value:null;
 const value=Number.isFinite(manual)?manual:automatic?.value??null;
 return {value,display:format(value),automatic:automatic?.value??null,automaticDisplay:format(automatic?.value),mode:Number.isFinite(manual)?'手动设置':'自动计算',validCount:valid.length,used:automatic?.count||0,missing:records.filter(x=>x.r.holes.length===18&&R.strictEligible(x.r,x.player)&&x.value===null).length,needed:Math.max(0,3-valid.length),note:automatic?'最近 '+automatic.total+' 轮合格记录，采用最低 '+automatic.count+' 轮分差。':'需要至少 3 轮完整 18 洞成绩，并补全对应 Tee 的评级、调整总杆与 PCC。',official:false};
}
function setManual(person,input){
 const raw=String(input).trim();if(!/^(?:\+\d+(?:\.\d)?|-?\d+(?:\.\d)?)$/.test(raw))throw Error('请输入一位小数以内的差点，例如 18.4；正差点可填 +2.0');
 const value=raw.startsWith('+')?-Number(raw.slice(1)):Number(raw);if(value< -10||value>54)throw Error('请输入 +10.0 到 54.0 之间的差点');
 person.handicapSetting={mode:'manual',value,updatedAt:Date.now()};return person.handicapSetting;
}
module.exports={differential,aggregate,summary,format,setManual,recordsFor};
