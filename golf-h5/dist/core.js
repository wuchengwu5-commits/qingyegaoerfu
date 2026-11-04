(function(root){
'use strict';
const pars=[4,5,3,4,4,5,3,4,4,4,3,5,4,4,3,5,4,4];
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const clone=x=>JSON.parse(JSON.stringify(x));
const date=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const courses=[
 {id:'pine',name:'松林湖高尔夫俱乐部',city:'杭州',subtitle:'湖光与松影之间',tag:'湖畔球场',holes:18,par:72,tees:['白色发球台','蓝色发球台','红色发球台'],demo:true,photo:0,pars:[...pars],lengths:[368,492,156,402,385,510,172,390,410,375,163,505,389,406,178,522,397,420]},
 {id:'hill',name:'青山高尔夫球会',city:'上海',subtitle:'在山野间，尽情挥杆',tag:'山地球场',holes:18,par:72,tees:['白色发球台','蓝色发球台','红色发球台'],demo:true,photo:1,pars:[...pars],lengths:[...Array(18)].map((_,i)=>pars[i]===3?160:pars[i]===5?510:380)},
 {id:'bay',name:'云湾高尔夫俱乐部',city:'苏州',subtitle:'给自己半日好时光',tag:'滨水球场',holes:9,par:36,tees:['白色发球台','红色发球台'],demo:true,photo:2,pars:pars.slice(0,9),lengths:[368,492,156,402,385,510,172,390,410]}
];
function initial(demo=false){return {version:2,profile:{id:'me',name:demo?'林然':'高球爱好者',bio:'享受挥杆，也享受沿途风景',handicap:null},settings:{unit:'yd',technical:false},friends:demo?[{id:'f1',name:'张伟'},{id:'f2',name:'小夏'},{id:'f3',name:'陈宇'}]:[],courses:clone(courses),favorites:demo?['pine']:[],rounds:[],draft:null};}
function makeRound(course,players,options={}){
 if(!course||![9,18].includes(course.holes))throw Error('请选择有效球场');
 if(!Array.isArray(players)||players.length<1||players.length>4)throw Error('每场支持 1–4 位球友');
 if(new Set(players.map(p=>p.id)).size!==players.length)throw Error('不能重复添加同一位球友');
 const mode=course.holes===9?'front':options.holes||'all';
 if(!['all','front','back'].includes(mode))throw Error('球洞范围无效');
 const holes=course.pars.map((par,i)=>({number:i+1,par})).filter(h=>mode==='all'||(mode==='front'?h.number<=9:h.number>9));
 if(![9,18].includes(holes.length)||holes.some(h=>![3,4,5].includes(h.par)))throw Error('请核对球洞标准杆');
 let playOrder=holes.map(h=>h.number);if(playOrder.length===18&&Number(options.start)===10)playOrder=[...playOrder.slice(9),...playOrder.slice(0,9)];
 const ps=players.map(p=>({...p,name:String(p.name||'').trim(),tee:p.tee||course.tees[0]||'未指定',withdrawn:false}));
 if(ps.some(p=>!p.name||p.name.length>20))throw Error('球友昵称为 1–20 个字符');
 return {id:uid(),courseId:course.id,courseName:course.name,city:course.city,photo:course.photo||0,courseDemo:!!course.demo,date:options.date||date(),time:options.time||'08:30',holes,playOrder,players:ps,scores:Object.fromEntries(ps.map(p=>[p.id,{}])),status:'active',currentHole:playOrder[0],currentPlayer:ps[0].id,createdAt:Date.now(),updatedAt:Date.now(),revision:0,corrections:[]};
}
function validate(s,par){
 if(!s||!Number.isInteger(s.strokes)||s.strokes<1||s.strokes>30)throw Error('总杆需要是 1–30 的整数');
 for(const [k,n] of [['putts','推杆'],['penalties','罚杆']])if(s[k]!==null&&(!Number.isInteger(s[k])||s[k]<0||s[k]>s.strokes))throw Error(`${n}需要是 0–总杆之间的整数`);
 if(s.putts!==null&&s.penalties!==null&&s.putts+s.penalties>s.strokes)throw Error('推杆与罚杆之和不能超过总杆');
 if(![true,false,null].includes(s.fairway)||![true,false,null].includes(s.gir))throw Error('命中状态无效');
 if(par===3&&s.fairway!==null)throw Error('Par 3 不统计球道命中');
 return s;
}
function setScore(round,pid,num,score){
 const h=round.holes.find(x=>x.number===Number(num));
 if(!h||!round.players.some(p=>p.id===pid))throw Error('球员或球洞不存在');
 if(round.status==='completed')throw Error('请先进入更正成绩模式');
 if(score)validate(score,h.par);
 const r=clone(round);if(score)r.scores[pid][num]=clone(score);else delete r.scores[pid][num];r.updatedAt=Date.now();r.revision++;return r;
}
function summary(r,pid){
 const out={total:0,par:0,played:0,front:0,back:0,frontN:0,backN:0,putts:0,puttN:0,penalties:0,penaltyN:0,fw:0,fwN:0,gir:0,girN:0,types:{eagle:0,birdie:0,par:0,bogey:0,double:0,other:0},set:[]};
 r.holes.forEach(h=>{const s=r.scores[pid]?.[h.number];if(!s)return;out.played++;out.total+=s.strokes;out.par+=h.par;out.set.push(h.number);const half=h.number<=9?'front':'back';out[half]+=s.strokes;out[half+'N']++;if(s.putts!==null){out.putts+=s.putts;out.puttN++;}if(s.penalties!==null){out.penalties+=s.penalties;out.penaltyN++;}if(h.par!==3&&s.fairway!==null){out.fwN++;if(s.fairway)out.fw++;}if(s.gir!==null){out.girN++;if(s.gir)out.gir++;}const diff=s.strokes-h.par;out.types[diff===-2?'eagle':diff===-1?'birdie':diff===0?'par':diff===1?'bogey':diff===2?'double':'other']++;});
 out.diff=out.total-out.par;out.totalText=out.played?String(out.total):'—';out.diffText=out.played?(out.diff===0?'E':out.diff>0?'+'+out.diff:String(out.diff)):'—';out.complete=out.played===r.holes.length;out.set.sort((a,b)=>a-b);return out;
}
function ranking(r){
 let rows=r.players.map(p=>({...p,...summary(r,p.id)}));
 const comparable=rows.length>0&&rows.every(p=>!p.withdrawn&&p.played>0&&JSON.stringify(p.set)===JSON.stringify(rows[0].set));
 const final=r.status==='completed'&&rows.every(p=>p.complete&&!p.withdrawn);
 if(comparable&&r.status!=='completed'||final){rows.sort((a,b)=>a.total-b.total);let rank=0;rows=rows.map((p,i)=>{if(i===0||p.total!==rows[i-1].total)rank=i+1;return {...p,rank};});}
 return {rows,comparable:comparable&&r.status!=='completed'||final,final};
}
function stats(data,size=18,days=0){
 const min=days?date(new Date(Date.now()-days*86400000)):'0000';
 const rounds=data.rounds.filter(r=>r.status==='completed'&&r.date>=min&&r.players.some(p=>p.id==='me'));
 const relevant=rounds.filter(r=>r.holes.length===size);const complete=relevant.filter(r=>summary(r,'me').complete&&!r.players.find(p=>p.id==='me').withdrawn);const sums=relevant.map(r=>summary(r,'me'));const totals=complete.map(r=>summary(r,'me').total);const all=rounds.map(r=>summary(r,'me'));
 const sum=k=>sums.reduce((n,s)=>n+s[k],0);return {rounds:rounds.filter(r=>summary(r,'me').played).length,holes:all.reduce((n,s)=>n+s.played,0),best:totals.length?Math.min(...totals):null,average:totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null,complete:complete.length,courseCount:new Set(rounds.filter(r=>summary(r,'me').played).map(r=>r.courseId)).size,fw:sum('fw'),fwN:sum('fwN'),gir:sum('gir'),girN:sum('girN'),putts:sum('putts'),puttN:sum('puttN'),penalties:sum('penalties'),penaltyN:sum('penaltyN'),trend:complete.sort((a,b)=>a.date.localeCompare(b.date)).slice(-8).map(r=>({date:r.date,total:summary(r,'me').total,id:r.id})),types:sums.reduce((o,s)=>{for(const k in o)o[k]+=s.types[k];return o;},{eagle:0,birdie:0,par:0,bogey:0,double:0,other:0})};
}
function seeded(){
 const d=initial(true);const players=[{id:'me',name:'林然'},{id:'f1',name:'张伟'},{id:'f2',name:'小夏'},{id:'f3',name:'陈宇'}];
 for(let j=0;j<4;j++){
  const day=new Date();day.setDate(day.getDate()-(4-j)*7);let r=makeRound(d.courses[j%2],players,{date:date(day),holes:'all'});r.id='demo-round-'+j;
  r.holes.forEach((h,i)=>players.forEach((p,pi)=>{const extra=pi===0?(i<(15-j)?1:0):pi===1?(i<16?1:0):pi===2?(i<12?1:0):(i<8?2:1);r.scores[p.id][h.number]={strokes:h.par+extra,putts:i%5===0?1:2,penalties:i===4?1:0,fairway:h.par===3?null:i%3!==0,gir:i%3===0};}));r.status='completed';d.rounds.push(r);
 }
 const a=makeRound(d.courses[0],players,{holes:'all'});a.id='demo-active';a.currentHole=6;a.holes.slice(0,5).forEach((h,i)=>players.forEach((p,pi)=>a.scores[p.id][h.number]={strokes:h.par+(pi+i)%2,putts:2,penalties:0,fairway:h.par===3?null:i%2===0,gir:i%3===0}));d.rounds.unshift(a);return d;
}
function distance(a,b){const rad=x=>x*Math.PI/180;for(const p of [a,b])if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw Error('坐标无效');const f=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,f)),Math.sqrt(Math.max(0,1-f)));}
function validateBackup(d){
 if(!d||d.version!==2||!d.profile||!Array.isArray(d.rounds)||!Array.isArray(d.courses)||!Array.isArray(d.friends)||!Array.isArray(d.favorites)||!['yd','m'].includes(d.settings?.unit))throw Error('备份格式或版本不兼容');
 const unique=a=>a.every(x=>typeof x.id==='string'&&x.id)&&new Set(a.map(x=>x.id)).size===a.length;
 if(!unique(d.rounds)||!unique(d.courses)||!unique(d.friends)||d.rounds.length>5000)throw Error('备份包含重复 ID 或超出数量限制');
 if(typeof d.profile.name!=='string'||d.profile.name.length>20)throw Error('个人资料无效');
 for(const c of d.courses)if(typeof c.name!=='string'||!Array.isArray(c.pars)||![9,18].includes(c.pars.length)||c.pars.some(p=>![3,4,5].includes(p))||!Array.isArray(c.tees))throw Error('球场资料不完整');
 for(const r of d.rounds){
  if(!['active','paused','completed'].includes(r.status)||!Array.isArray(r.players)||!unique(r.players)||r.players.length<1||r.players.length>4||!Array.isArray(r.holes)||![9,18].includes(r.holes.length)||new Set(r.holes.map(h=>h.number)).size!==r.holes.length||r.holes.some(h=>![3,4,5].includes(h.par)||!Number.isInteger(h.number)||h.number<1||h.number>18)||!Array.isArray(r.playOrder)||r.playOrder.length!==r.holes.length||new Set(r.playOrder).size!==r.holes.length||r.playOrder.some(n=>!r.holes.some(h=>h.number===n))||typeof r.courseName!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!r.scores)throw Error('球局结构无效');
  for(const p of r.players){if(typeof p.name!=='string'||!p.name||p.name.length>20||!r.scores[p.id])throw Error('球员资料无效');for(const n of Object.keys(r.scores[p.id])){const h=r.holes.find(h=>h.number===Number(n));if(!h)throw Error('备份引用了不存在的球洞');validate(r.scores[p.id][n],h.par);}}
 }
 return clone(d);
}
const api={pars,courses,uid,date,clone,initial,seeded,makeRound,validate,setScore,summary,ranking,stats,distance,validateBackup};if(typeof module!=='undefined')module.exports=api;else root.Golf=api;
})(globalThis);
