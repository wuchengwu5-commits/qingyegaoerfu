const Golf = (() => {
  const PAR=[4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4];
  const SI=[9,3,13,17,1,15,7,5,11,8,2,16,6,12,4,18,10,14];
  const YARDS=[410,530,385,175,420,165,405,550,430,395,440,160,520,410,545,180,425,435];
  const NAMES=['林知远','陈亦川','周予安','许望','陆景行','宋沐言'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const sum=a=>a.reduce((s,v)=>s+v,0);
  const fmt=n=>n===0?'E':n>0?'+'+n:String(n);
  const holes=c=>c.segment==='front'?Array.from({length:9},(_,i)=>i):c.segment==='back'?Array.from({length:9},(_,i)=>i+9):Array.from({length:18},(_,i)=>i);
  const defaults=()=>({name:'周末青野球局',course:'青野湖畔球场',segment:'18',players:NAMES.slice(0,4).map((name,i)=>({id:i,name,team:Math.floor(i/2),handicap:0,manual:Array(18).fill(0)})),mode:'record',group:'individual',basis:'gross',points:'stableford',handicap:'round',cap:'none',policy:{type:'official',ob:'official',water:'official',rough:'official',relief:'official',search:'official',putt:'hole',pickup:'follow',notes:'',confirmed:false},sides:{birdie:false,skins:false},birdieBasis:'gross',skinsCarry:true});
  const modeName=c=>({record:'仅记分',stroke:'比杆赛',match:'比洞赛',points:c.points==='8421'?'8421 积分赛':'标准积分赛'})[c.mode];
  const capName={none:'不封顶',double:'双倍标准杆',par3:'标准杆加 3',ten:'固定 10 杆',netdouble:'净双柏忌'};
  const policyName={official:'正式规则',small:'小流氓 · 自定约定',large:'大流氓 · 自定约定',custom:'球友自定约定'};
  function normalize(c){
    if(c.mode==='record'){c.group='individual';c.basis='gross'}
    if(c.group==='pairs'&&![4,6].includes(c.players.length))c.group='individual';
    if(c.mode!=='stroke'||c.group==='pairs')c.cap='none';
    if(c.basis==='gross'&&c.cap==='netdouble')c.cap='none';
    if(c.basis==='gross'){c.players.forEach(p=>{p.handicap=0;p.manual=Array(18).fill(0)});c.birdieBasis='gross'}
    if(c.mode==='match'||c.group==='pairs'||c.cap!=='none')c.sides.skins=false;
    if(c.policy.type==='official'){Object.assign(c.policy,{ob:'official',water:'official',rough:'official',relief:'official',search:'official',putt:c.mode==='match'?'opponent':'hole',pickup:'follow',notes:''})}
    if(c.mode!=='match'&&c.policy.putt==='opponent')c.policy.putt='hole';
    return c;
  }
  function validate(c){
    const errors=[],n=holes(c).length;
    if(!c.name.trim())errors.push('请填写球局名称');
    if(c.players.length<2||c.players.length>6)errors.push('请选择 2–6 位球友');
    if(c.players.some(p=>!p.name.trim()))errors.push('请填写每位球友的名字');
    if(new Set(c.players.map(p=>p.name.trim())).size!==c.players.length)errors.push('球友名字请加以区分，避免记错人');
    if(c.mode==='match'&&!((c.group==='individual'&&c.players.length===2)||(c.group==='pairs'&&c.players.length===4)))errors.push('比洞赛请选择 2 人个人对抗，或 4 人两队对抗');
    if(c.group==='pairs'){
      if(![4,6].includes(c.players.length))errors.push('两人一队需要 4 或 6 人');
      const teams=Object.values(c.players.reduce((a,p)=>(a[p.team]=(a[p.team]||0)+1,a),{}));
      if(teams.length!==c.players.length/2||teams.some(x=>x!==2))errors.push('请确保每队恰好有 2 人');
    }
    if(c.mode==='record'&&(c.group!=='individual'||c.basis!=='gross'))errors.push('仅记分不使用组队排名或让杆');
    if(c.cap!=='none'&&(c.mode!=='stroke'||c.group!=='individual'))errors.push('封顶仅用于个人比杆赛');
    if(c.cap==='netdouble'&&c.basis!=='net')errors.push('净双柏忌封顶需要净杆口径');
    if(c.sides.skins&&(c.group!=='individual'||c.mode==='match'||c.cap!=='none'))errors.push('Skins 需要个人仅记分、常规比杆或积分赛');
    if(c.basis==='net'){
      if(c.handicap==='round'&&c.players.some(p=>!Number.isInteger(p.handicap)||p.handicap<0||p.handicap>3*n))errors.push(`本轮让杆数需为 0–${3*n} 的整数`);
      if(c.handicap==='manual'&&c.players.some(p=>holes(c).some(h=>!Number.isInteger(p.manual[h])||p.manual[h]<0||p.manual[h]>3)))errors.push('逐洞让杆需为 0–3 的整数');
    }
    if(c.policy.type!=='official'){
      if(!c.policy.confirmed)errors.push('请勾选已确认全部球友约定');
      if(Object.values(c.policy).includes('custom')&&c.policy.notes.trim().length<5)errors.push('自定义条目请填写处理动作、罚杆或洞结果等具体说明');
    }
    return errors;
  }
  function allowances(c,i){
    const a=Array(18).fill(0),hs=holes(c);if(c.basis!=='net')return a;
    if(c.handicap==='manual'){hs.forEach(h=>a[h]=c.players[i].manual[h]);return a}
    let total=c.players[i].handicap;
    if(c.mode==='match')total-=Math.min(...c.players.map(p=>p.handicap));
    const order=[...hs].sort((a,b)=>SI[a]-SI[b]);
    hs.forEach(h=>a[h]=Math.floor(total/hs.length));order.slice(0,total%hs.length).forEach(h=>a[h]++);
    return a;
  }
  const points=(d,table)=>table==='8421'?(d<=-3?16:d===-2?8:d===-1?4:d===0?2:d===1?1:0):Math.max(0,2-d);
  const ceiling=(c,h)=>c.cap==='double'?2*PAR[h]:c.cap==='par3'?PAR[h]+3:c.cap==='ten'?10:c.cap==='netdouble'?PAR[h]+2:Infinity;
  function derived(c,i,h,r){
    const handicap=allowances(c,i)[h];
    if(!r)return {ready:false,gross:null,handicap,net:null,value:null};
    if(r.kind==='pickup')return {ready:true,gross:null,handicap,net:null,value:c.mode==='points'?0:c.cap!=='none'?ceiling(c,h):null,kind:'pickup'};
    const net=r.gross-handicap,s=c.basis==='net'?net:r.gross;
    return {ready:true,gross:r.gross,handicap,net,value:c.mode==='points'?points(s-PAR[h],c.points):Math.min(s,ceiling(c,h)),kind:r.kind};
  }
  function units(c){return c.group==='pairs'?[...new Set(c.players.map(p=>p.team))].sort().map(t=>({id:t,name:String.fromCharCode(65+t)+' 队',members:c.players.map((p,i)=>p.team===t?i:-1).filter(i=>i>=0)})):c.players.map((p,i)=>({id:i,name:p.name,members:[i]}))}
  function unitHole(c,records,u,h){
    const d=u.members.map(i=>derived(c,i,h,records[i][h]));
    if(d.some(x=>!x.ready))return null;
    const valid=d.map(x=>x.value).filter(x=>x!==null);
    if(!valid.length)return null;
    return c.mode==='points'?Math.max(...valid):Math.min(...valid);
  }
  function summary(c,records,i){
    const hs=holes(c),a=hs.map(h=>derived(c,i,h,records[i][h]));
    const recorded=a.filter(d=>d.gross!==null),valid=a.filter(d=>d.value!==null);
    return {done:a.filter(d=>d.ready).length,actual:recorded.length,gross:sum(recorded.map(d=>d.gross)),par:sum(hs.filter((h,j)=>a[j].gross!==null).map(h=>PAR[h])),value:sum(valid.map(d=>d.value)),count:valid.length,net:sum(recorded.map(d=>d.net)),given:a.some(d=>d.kind==='given')};
  }
  function standings(c,records){
    let list=units(c).map(u=>{let vals=holes(c).map(h=>({h,value:unitHole(c,records,u,h)})).filter(x=>x.value!==null);return {...u,done:vals.length,total:sum(vals.map(x=>x.value)),relative:sum(vals.map(x=>x.value-PAR[x.h]))}});
    if(c.mode==='record')return list;
    list.sort((a,b)=>a.done===0&&b.done===0?0:a.done===0?1:b.done===0?-1:c.mode==='points'?b.total-a.total:a.relative-b.relative);
    const metric=x=>c.mode==='points'?x.total:x.relative;
    return list.map(x=>({...x,rank:!x.done?'—':(list.filter(y=>y.done&&metric(x)===metric(y)).length>1?'T':'')+(list.findIndex(y=>y.done&&metric(x)===metric(y))+1)}));
  }
  function match(c,records,overrides={}){
    const us=units(c),hs=holes(c);let lead=0,played=0,finished=false,result='AS',winner=null;const byHole=[];
    for(const h of hs){
      if(finished)break;
      let a=unitHole(c,records,us[0],h),b=unitHole(c,records,us[1],h),outcome;
      if(overrides[h]!==undefined)outcome=overrides[h];
      else if(a===null||b===null)break;
      else outcome=a<b?1:a>b?-1:0;
      lead+=outcome;played++;byHole.push({h,outcome,lead});let remain=hs.length-played;
      if(Math.abs(lead)>remain||remain===0){finished=true;winner=lead===0?null:lead>0?0:1;result=lead===0?'AS':remain>0?`${Math.abs(lead)} & ${remain}`:`${Math.abs(lead)} UP`}
    }
    if(!finished)result=lead===0?'AS':`${Math.abs(lead)} UP`;
    return {lead,played,remaining:hs.length-played,finished,result,winner,byHole,units:us};
  }
  function sideResults(c,records){
    const birdies=c.players.map(()=>0),birdieHoles=c.players.map(()=>0),skins=c.players.map(()=>0);let pot=0,skinDone=0,skinBlocked=false;
    for(const h of holes(c)){
      c.players.forEach((p,i)=>{const r=records[i][h];if(!r||r.kind!=='holed')return;birdieHoles[i]++;const gross=r.gross-(c.birdieBasis==='net'?allowances(c,i)[h]:0),d=gross-PAR[h];birdies[i]+=d<0?Math.min(3,-d):0});
      if(!c.sides.skins||skinBlocked)continue;
      const ds=c.players.map((p,i)=>derived(c,i,h,records[i][h]));
      if(ds.some(d=>d.gross===null||d.kind==='given')){skinBlocked=true;continue}
      skinDone++;pot++;const vals=ds.map(d=>c.basis==='net'?d.net:d.gross),low=Math.min(...vals),wins=vals.map((v,i)=>v===low?i:-1).filter(i=>i>=0);
      if(wins.length===1){skins[wins[0]]+=pot;pot=0}else if(!c.skinsCarry)pot=0;
    }
    return {birdies,birdieHoles,skins,pot,skinDone,skinBlocked};
  }
  function newRound(c){return {config:clone(c),records:c.players.map(()=>Array(18).fill(null)),overrides:{},hole:holes(c)[0],view:'score',finished:false,updated:Date.now()}}
  function seed(r){const deltas=[[0,1,0,0,-1,0,1,-1,1,0,1,0,-1,1,0,0,1,0],[1,0,1,0,0,1,0,0,1,1,0,0,0,1,0,1,0,0],[1,1,0,1,0,1,1,0,0,0,1,1,0,1,0,1,0,1],[0,2,1,0,1,0,1,1,0,1,1,0,1,0,2,0,1,0],[1,0,0,1,1,1,0,1,0,1,0,1,0,2,1,0,1,1],[2,1,1,0,1,1,0,1,2,0,1,1,0,0,1,1,0,1]];r.config.players.forEach((p,i)=>holes(r.config).forEach(h=>{if(!r.records[i][h])r.records[i][h]={gross:PAR[h]+deltas[i][h],kind:'holed'}}));return r}
  return {PAR,SI,YARDS,NAMES,clone,sum,fmt,holes,defaults,modeName,capName,policyName,normalize,validate,allowances,points,ceiling,derived,units,unitHole,summary,standings,match,sideResults,newRound,seed};
})();
if(typeof module!=='undefined')module.exports=Golf;
