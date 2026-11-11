(function (root) {
  'use strict';
  const MAX_PLAYERS = 16; // Historical scorecards retain all existing players.
  const GROUP_MAX_PLAYERS = 16;
  const VERSION = 'scoring-v3.1', ENGINE = '1.0.0';
  const clone = x => JSON.parse(JSON.stringify(x));
  const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
  const ids = r => r.players.map(p => p.id);
  const order = r => r.playOrder || r.holeOrder || r.holes.map(h => h.number);
  const isFinished = r => ['finished_complete','finished_incomplete','completed','finished'].includes(r.status);
  const topics = ['界外与遗失球','罚杆区','长草与树林','球车道','找球与抛球','短推与免推','连续失误与捡球'];
  const names = {record_only:'仅记分',stroke_play:'比杆赛',match_play:'比洞赛',points:'积分赛'};
  function defaultRules(type='record_only') {
    return {ruleVersion:VERSION,engineVersion:ENGINE,scoring:{type,basis:'gross',...(type==='points'?{pointsRule:'8421'}:{}),...(type==='stroke_play'?{cap:{enabled:false}}:{}),...(type==='match_play'?{tiePolicy:'allow_tie'}:{})},grouping:{type:'individual',teams:[]},handicap:{mode:'none'},penaltyPolicy:{mode:'official',localRules:[]},sideGames:[]};
  }
  const par = (r,pid,n) => r.players.find(p=>p.id===pid)?.holePars?.[n] ?? r.holes.find(h=>h.number===n)?.par;
  const si = (r,pid,n) => {const p=r.players.find(p=>p.id===pid);return p?.holeSI && Object.prototype.hasOwnProperty.call(p.holeSI,n)?p.holeSI[n]:r.holes.find(h=>h.number===n)?.si??null;};
  function validSI(values) {
    const n=values.length;
    return [9,18].includes(n) && values.every(v=>Number.isInteger(v)&&v>=1&&v<=18) && new Set(values).size===n && (n!==18 || Math.min(...values)===1&&Math.max(...values)===18);
  }
  function allocateStrokes(total, values) {
    if(!validSI(values)) fail('MISSING_SI','SI 缺失或不唯一。请核对记分卡，或改为逐洞指定让杆。');
    if(!Number.isInteger(total)||total<0||total>values.length*3)fail('INVALID_ALLOWANCE','本轮让杆须为 0–'+values.length*3+' 的整数');
    const sorted=[...values].sort((a,b)=>a-b);
    return values.map(v=>Math.floor(total/values.length)+(sorted.indexOf(v)<total%values.length?1:0));
  }
  function allowances(r) {
    const rule=r.ruleSnapshot, hc=rule.handicap, ns=order(r), out={};
    const totals=ids(r).map(id=>hc.totals?.[id]??0), min=rule.scoring.type==='match_play'?Math.min(...totals):0;
    r.players.forEach(p=>{
      let arr;
      if(hc.mode==='none') arr=ns.map(()=>0);
      else if(hc.mode==='manual_hole') arr=ns.map(n=>hc.perHole?.[p.id]?.[n]);
      else arr=allocateStrokes((hc.totals?.[p.id]??0)-min,ns.map(n=>si(r,p.id,n)));
      out[p.id]=Object.fromEntries(ns.map((n,i)=>[n,arr[i]]));
    }); return out;
  }
  function validateRuleConfig(r) {
    const rules=r.ruleSnapshot, players=r.players||[], ns=order(r), sc=rules?.scoring, gr=rules?.grouping, hc=rules?.handicap;
    if(!rules||!sc||!gr||!hc||!rules.penaltyPolicy||!Array.isArray(rules.sideGames))fail('RULES_INCOMPLETE','请完成五项规则设置');
    if(players.length<1||players.length>MAX_PLAYERS||new Set(ids(r)).size!==players.length) fail('INVALID_PLAYER_COUNT','每轮需要 1–16 位不同球友');
    if(!['individual','four_ball'].includes(gr.type))fail('INVALID_GROUPING','组队方式不支持');
    if(gr.type==='four_ball') {
      const all=(gr.teams||[]).flatMap(t=>t.playerIds||[]);
      if(players.length!==4||gr.teams?.length!==2||gr.teams.some(t=>t.playerIds.length!==2)||new Set(gr.teams.map(t=>t.teamId)).size!==2||new Set(all).size!==4||all.some(id=>!ids(r).includes(id)))fail('INVALID_PLAYER_COUNT','四球赛需要固定两队，每队两人且不重复');
    }
    if(!Object.keys(names).includes(sc.type)||!['gross','net'].includes(sc.basis))fail('INVALID_SCORING','记分方式或成绩口径无效');
    if(sc.type==='match_play'&&gr.type==='individual'&&players.length!==2)fail('INVALID_PLAYER_COUNT','个人比洞需要恰好两位球友');
    if(sc.type==='record_only'&&(gr.type!=='individual'||sc.basis!=='gross'))fail('INVALID_SCORING','仅记分使用个人实际总杆，不设四球主赛');
    if(sc.type==='points'&&!['stableford','8421'].includes(sc.pointsRule))fail('INVALID_POINTS','请选择标准积分或 8421');
    if(sc.type!=='points'&&sc.pointsRule)fail('INVALID_POINTS','非积分赛不能保留生效积分表');
    if(sc.cap?.enabled&&(sc.type!=='stroke_play'||gr.type!=='individual'))fail('INVALID_CAP','封顶只用于个人比杆');
    if(sc.cap?.enabled&&!['double_par','par_plus_three','fixed_ten','net_double_bogey'].includes(sc.cap.rule))fail('INVALID_CAP','封顶规则无效');
    if(sc.cap?.enabled&&sc.cap.rule==='net_double_bogey'&&sc.basis!=='net')fail('INVALID_CAP','净双柏忌需要净杆口径');
    if(![9,18].includes(ns.length)||new Set(ns).size!==ns.length||r.holes.length!==ns.length||ns.some(n=>!r.holes.some(h=>h.number===n)))fail('INVALID_HOLES','请选择一个或两个不同九洞段');
    if(r.holes.some(h=>!Number.isInteger(h.number)||![3,4,5,6].includes(h.par)))fail('INVALID_PAR','请核对逐洞标准杆');
    if(sc.basis==='net'||sc.type==='match_play'||gr.type==='four_ball') for(const n of ns) if(new Set(ids(r).map(id=>par(r,id,n))).size!==1)fail('TEE_PAR_MISMATCH','本轮比较需各球友对应球洞 Par 一致，请核对发球台');
    if(!['none','manual_round_total','manual_hole'].includes(hc.mode))fail('INVALID_ALLOWANCE','让杆方式无效');
    if(sc.basis==='gross'&&hc.mode!=='none')fail('GROSS_WITH_ALLOWANCE','总杆口径不能启用让杆，请确认改为不让杆');
    if(hc.mode==='manual_round_total') {
      for(const p of players){const vals=ns.map(n=>si(r,p.id,n));if(!validSI(vals)||r.holes.some(h=>h.siStatus==='invalid_18_hole_sequence'))fail('MISSING_SI','SI 缺失、重复或来源无效，不能按总数自动分配。请逐洞指定让杆。');if(!Number.isInteger(hc.totals?.[p.id])||hc.totals[p.id]<0||hc.totals[p.id]>ns.length*3)fail('INVALID_ALLOWANCE','请填写每位球友本轮 0–'+ns.length*3+' 让杆总数');}
      if(players.some(p=>JSON.stringify(ns.map(n=>si(r,p.id,n)))!==JSON.stringify(ns.map(n=>si(r,players[0].id,n)))))fail('SI_SCOPE_MISMATCH','自动分配需要统一 SI 顺序');
      if(r.courseSnapshot?.publicData&&!hc.siConfirmed)fail('SI_UNCONFIRMED','请确认本轮组合、发球台及现行记分卡的 SI 适用范围');
    }
    if(hc.mode==='manual_hole')for(const p of players)for(const n of ns){const v=hc.perHole?.[p.id]?.[n];if(!Number.isInteger(v)||v<0||v>3)fail('INVALID_ALLOWANCE','请为每位球友每洞明确填写 0–3 杆');}
    const policy=rules.penaltyPolicy;
    if(!['official','custom','small','large','legacy_unspecified'].includes(policy.mode))fail('RULES_INCOMPLETE','判罚约定无效');
    if(!['official','legacy_unspecified'].includes(policy.mode)) {
      if(!Array.isArray(policy.topics)||topics.some((_,i)=>!policy.topics[i]||!['action','outcome','area','note'].every(k=>String(policy.topics[i][k]||'').trim())))fail('RULES_INCOMPLETE','自定义与大小流氓模板须填写七项具体约定、处罚、范围和说明');
    }
    const sideIds=new Set();for(const g of rules.sideGames){
      if(!g.id||sideIds.has(g.id))fail('INVALID_SIDE_GAME','附加玩法标识重复'); sideIds.add(g.id);
      if(!['skins','nassau','birdie','nearest','longest'].includes(g.type))fail('INCOMPATIBLE_SIDE_GAME','此附加玩法尚不支持');
      if(g.type==='skins'&&(gr.type!=='individual'||players.length<2||sc.type==='match_play'||sc.cap?.enabled))fail('INCOMPATIBLE_SIDE_GAME','Skins 需要 2–16 人个人记分、常规比杆或积分赛');
      if(g.type==='nassau'&&(sc.type!=='match_play'||ns.length!==18||ns.some((n,i)=>n!==i+1)))fail('INCOMPATIBLE_SIDE_GAME','拿骚需要从第 1 洞顺序开始的 18 洞比洞');
      if(['nearest','longest'].includes(g.type)&&(!g.holeNumbers?.length||g.holeNumbers.some(n=>!ns.includes(n))||!['m','yd'].includes(g.unit)))fail('RULES_INCOMPLETE','奖项需要至少一个本轮球洞和距离单位');
      if(g.basis==='net'&&sc.basis!=='net')fail('INCOMPATIBLE_SIDE_GAME','净杆抓鸟奖励需先配置本轮净杆让杆');
    }
    allowances(r); return true;
  }
  function normalizeScore(s) {
    if(!s)return null;
    const completion=s.completion||'holed_out', gross=s.grossStrokes!==undefined?s.grossStrokes:s.strokes;
    return {...clone(s),completion,grossStrokes:['picked_up','skipped'].includes(completion)?null:gross,strokes:['picked_up','skipped'].includes(completion)?null:gross,putts:s.putts??null,penalties:s.penalties??0,fairway:s.fairway??null,green:s.green??s.gir??null,gir:s.green??s.gir??null};
  }
  function validateScore(score) {
    if(score&&score.strokes!==undefined&&score.grossStrokes!==undefined&&score.strokes!==score.grossStrokes)fail('INVALID_SCORE','原始总杆字段不一致');const s=normalizeScore(score);if(!s)return true;
    if(!['holed_out','conceded_next_stroke','picked_up','skipped'].includes(s.completion))fail('INVALID_SCORE','完洞状态无效');
    if(['holed_out','conceded_next_stroke'].includes(s.completion)&&(!Number.isInteger(s.grossStrokes)||s.grossStrokes<1||s.grossStrokes>30))fail('INVALID_SCORE','本洞总杆必须为 1–30 的整数');
    if(['picked_up','skipped'].includes(s.completion)&&score.grossStrokes!=null)fail('INVALID_SCORE','捡球与跳洞不能填入实际总杆');
    if(s.completion==='skipped'&&!s.reason?.trim())fail('INVALID_SCORE','跳洞需要填写原因');
    if(s.putts!==null&&(!Number.isInteger(s.putts)||s.putts<0))fail('INVALID_SCORE','推杆须为空或非负整数');
    if(!Number.isInteger(s.penalties)||s.penalties<0)fail('INVALID_SCORE','罚杆须为非负整数');
    if(s.grossStrokes!==null&&(s.putts??0)+s.penalties>s.grossStrokes)fail('INVALID_SCORE','推杆与罚杆之和不能超过总杆');
    if(s.strokesTaken!=null&&(!Number.isInteger(s.strokesTaken)||s.strokesTaken<0||s.strokesTaken>30))fail('INVALID_SCORE','已击球次数须为 0–30 的整数');
    if(![null,true,false].includes(s.fairway)||![null,true,false].includes(s.green))fail('INVALID_SCORE','命中状态无效');return true;
  }
  function capLimit(sc,p) {return ({double_par:p*2,par_plus_three:p+3,fixed_ten:10,net_double_bogey:p+2})[sc.cap?.rule];}
  function points(value,p,rule) { const d=value-p;return rule==='stableford'?Math.max(0,2-d):d<=-3?16:d===-2?8:d===-1?4:d===0?2:d===1?1:0; }
  function derivePlayerHole(r,pid,n,scoring,contestId) {
    const sc=scoring||r.ruleSnapshot.scoring, p=par(r,pid,n), a=allowances(r)[pid][n], raw=normalizeScore(r.scores[pid]?.[n]);
    const credited=contestId&&(r.events||[]).find(e=>e.contestId===contestId&&e.holeNumber===n&&e.type==='conceded_next_stroke'&&e.beneficiary===pid&&!e.voided);
    const s=credited?normalizeScore({completion:'conceded_next_stroke',grossStrokes:credited.creditedGross,concededStrokes:1}):raw;
    const base={playerId:pid,holeNumber:n,par:p,allowance:sc.basis==='net'?a:0,gross:raw?.completion==='holed_out'?raw.grossStrokes:null,raw:s};
    if(!s)return {...base,status:'pending',reason:'MISSING_SCORE',explanation:'尚未录入本洞成绩'};
    if(s.completion==='skipped')return {...base,status:'pending',reason:'SKIPPED',explanation:'本洞跳过，比赛结果未决'};
    if(s.completion==='conceded_next_stroke'&&!credited&&r.ruleSnapshot.penaltyPolicy.mode==='official'&&sc.type!=='match_play')return {...base,status:'pending',reason:'CONCESSION_SCOPE',explanation:'比洞认可成绩不能作为其他比赛的实际完洞成绩'};
    if(s.completion==='picked_up') {
      if(sc.type==='points')return {...base,status:'processed',value:0,net:null,explanation:'已捡球，本洞积分 0 分，实际总杆留空'};
      if(sc.cap?.enabled)return {...base,status:'processed',value:capLimit(sc,p),net:null,explanation:'已捡球，按本洞上限 '+capLimit(sc,p)+' 杆计赛，实际总杆留空'};
      return {...base,status:'processed',value:null,reason:'NO_VALID_SCORE',explanation:'已捡球，无可用实际杆数'};
    }
    const net=s.grossStrokes-a, basis=sc.basis==='net'?net:s.grossStrokes;
    const value=sc.type==='points'?points(basis,p,sc.pointsRule):sc.cap?.enabled?Math.min(basis,capLimit(sc,p)):basis;
    return {...base,status:'processed',net,value,explanation:`总杆 ${s.grossStrokes}${sc.basis==='net'?` − 本洞让 ${a} = 净杆 ${net}`:''}${sc.type==='points'?`；${sc.pointsRule==='8421'?'8421':'标准'}积分 ${value} 分`:sc.cap?.enabled?`；本洞上限 ${capLimit(sc,p)}，计 ${value} 杆`:''}`};
  }
  function deriveTeamHole(r,team,n,sc,contestId) {
    const rows=team.playerIds.map(id=>derivePlayerHole(r,id,n,sc,contestId));
    if(rows.some(x=>x.status==='pending'))return {id:team.teamId,status:'pending',reason:'TEAM_MEMBER_UNPROCESSED',rows,explanation:'还有队员未确认本洞状态'};
    const good=rows.filter(x=>x.value!==null), pts=(sc||r.ruleSnapshot.scoring).type==='points';
    if(!good.length)return {id:team.teamId,status:'processed',value:null,rows,reason:'NO_VALID_TEAM_SCORE',explanation:'本队没有有效成绩，需人工处理比赛事件'};
    const value=(pts?Math.max:Math.min)(...good.map(x=>x.value));
    return {id:team.teamId,status:'processed',value,usedPlayerIds:good.filter(x=>x.value===value).map(x=>x.playerId),rows,explanation:'队伍取'+(pts?'最高积分':'最低杆数')+' '+value};
  }
  const competitors = r => r.ruleSnapshot.grouping.type==='four_ball'?r.ruleSnapshot.grouping.teams.map(t=>({id:t.teamId,name:t.name||t.teamId,team:t})):r.players.map(p=>({id:p.id,name:p.name}));
  function contestHoles(r,contestId='main',ns=order(r)) {
    const cs=competitors(r), sc=r.ruleSnapshot.scoring;
    return ns.map(n=>{
      const events=(r.events||[]).filter(e=>e.contestId===contestId&&e.holeNumber===n&&!e.voided), override=events.find(e=>['concede_hole','loss_of_hole'].includes(e.type));
      if(override)return {number:n,status:'processed',winnerId:override.beneficiary,lead:override.beneficiary===cs[0].id?1:-1,explanation:override.type==='concede_hole'?'已明确让洞':'已裁定罚负本洞'};
      const rows=cs.map(c=>({...c,...(c.team?deriveTeamHole(r,c.team,n,sc,contestId):derivePlayerHole(r,c.id,n,sc,contestId))}));
      if(rows.some(x=>x.status==='pending'||x.value==null))return {number:n,status:'pending',rows,reason:'MISSING_SCORE',explanation:'仍有成绩或状态待确认'};
      const best=(sc.type==='points'?Math.max:Math.min)(...rows.map(x=>x.value)), winners=rows.filter(x=>x.value===best);
      return {number:n,status:'processed',rows,winnerId:winners.length===1?winners[0].id:null,lead:winners.length>1?0:winners[0].id===cs[0].id?1:-1,explanation:winners.length>1?'本洞打平':winners[0].name+'赢洞'};
    });
  }
  function evaluateContest(r,contestId='main',ns=order(r)) {
    const sc=r.ruleSnapshot.scoring, cs=competitors(r);
    if(sc.type==='record_only')return {contestId:null,status:'void',ranking:[],rows:[],explanation:'仅记录成绩，不设主赛冠军或排名'};
    const holes=contestHoles(r,contestId,ns);
    const dq=(r.events||[]).filter(e=>e.contestId===contestId&&['disqualified','withdrawn'].includes(e.type)&&!e.voided).map(e=>e.beneficiary);
    if(sc.type==='match_play') {
      const match=(r.events||[]).find(e=>e.contestId===contestId&&e.type==='concede_match'&&!e.voided);
      if(match)return {contestId,status:'decided',winnerId:match.beneficiary,holes,explanation:'已让出本场比赛',result:'让赛'};
      if(dq.length===1)return {contestId,status:'decided',winnerId:cs.find(c=>c.id!==dq[0])?.id,holes,result:'对手退出 / DQ',explanation:'比赛范围内裁定'};
      let lead=0,blocked=false,decided=null,processed=0,provisionalLead=0;
      for(let i=0;i<holes.length;i++) {const h=holes[i];if(h.status==='pending'){blocked=true;continue;}provisionalLead+=h.lead;if(blocked||decided)continue;processed++;lead+=h.lead;const remaining=holes.length-i-1;if(Math.abs(lead)>remaining)decided={winnerId:cs[lead>0?0:1].id,result:remaining?`${Math.abs(lead)}&${remaining}`:`${Math.abs(lead)} UP`,decidedAt:h.number};}
      return {contestId,holes,lead,provisionalLead,processed,...(decided?{...decided,status:'decided'}:blocked?{status:'incomplete',result:'未决'}:processed===holes.length?{status:'tied',result:'平局'}:{status:'in_progress',result:lead===0?'AS':`${cs[lead>0?0:1].name} ${Math.abs(lead)} UP`}),explanation:blocked?'存在更早的未决洞；后续只作暂算':'按出发顺序累计赢洞，领先洞数大于剩余洞数时结束'};
    }
    const rows=cs.map(c=>{const entries=ns.map(n=>c.team?deriveTeamHole(r,c.team,n,sc,contestId):derivePlayerHole(r,c.id,n,sc,contestId));const valid=entries.filter(x=>x.status==='processed'&&x.value!==null);return {...c,total:valid.reduce((a,x)=>a+x.value,0),played:valid.length,set:valid.map(x=>x.holeNumber??ns[entries.indexOf(x)]),disqualified:dq.includes(c.id),entries};});
    const comparable=rows.every(x=>!x.disqualified&&x.played>0&&JSON.stringify(x.set)===JSON.stringify(rows[0].set)), complete=rows.every(x=>x.played===ns.length);
    const sorted=[...rows];if(comparable)sorted.sort((a,b)=>sc.type==='points'?b.total-a.total:a.total-b.total);
    let rank=0;sorted.forEach((x,i)=>{if(!i||x.total!==sorted[i-1].total)rank=i+1;x.rank=comparable?rank:null;});
    return {contestId,status:complete?(sorted.length>1&&sorted[0].total===sorted[1].total?'tied':'decided'):rows.some(x=>x.played)?'in_progress':'pending',rows:sorted,comparable,final:complete,unit:sc.type==='points'?'分':'杆',holes,explanation:comparable?(complete?'本轮完整结算':'已记球洞相同，当前排序仅供参考'):'已记球洞或有效状态不同，不比较名次'};
  }
  function evaluateSideGame(r,g) {
    const ns=g.holeNumbers||order(r), sc=r.ruleSnapshot.scoring;
    if(g.type==='nassau') {
      const contests=[evaluateContest(r,'nassau-front',order(r).slice(0,9)),evaluateContest(r,'nassau-back',order(r).slice(9)),evaluateContest(r,'main')], totals=Object.fromEntries(competitors(r).map(c=>[c.id,0]));
      contests.forEach(c=>{if(c.status==='tied')Object.keys(totals).forEach(id=>totals[id]+=.5);if(c.status==='decided'&&c.winnerId)totals[c.winnerId]++;});return {id:g.id,type:g.type,contests,totals,unit:'分',status:contests.every(c=>['tied','decided'].includes(c.status))?'decided':'incomplete'};
    }
    if(g.type==='skins') {
      let pool=0,blocked=false;const totals=Object.fromEntries(ids(r).map(id=>[id,0])),holes=[];
      for(const n of ns){if((r.events||[]).some(e=>e.contestId===g.id&&e.type==='void_hole'&&e.holeNumber===n&&!e.voided)){holes.push({number:n,status:'void',pool});continue;}
        const entries=ids(r).map(id=>({id,s:normalizeScore(r.scores[id]?.[n])}));
        if(entries.some(e=>e.s?.completion!=='holed_out')){blocked=true;holes.push({number:n,status:'pending',reason:'MISSING_ACTUAL_SCORE',pool});continue;}
        pool++;const vals=entries.map(e=>({id:e.id,v:e.s.grossStrokes-(sc.basis==='net'?allowances(r)[e.id][n]:0)})),min=Math.min(...vals.map(e=>e.v)),wins=vals.filter(e=>e.v===min);
        if(wins.length===1){if(!blocked)totals[wins[0].id]+=pool;holes.push({number:n,status:blocked?'provisional':'decided',winnerId:wins[0].id,points:pool});pool=0;}
        else {holes.push({number:n,status:blocked?'provisional':'tied',pool});if(g.carry===false)pool=0;}
      }return {id:g.id,type:g.type,totals,holes,unallocated:pool,status:blocked?'incomplete':pool?'unallocated':'decided',unit:'点'};
    }
    if(g.type==='birdie') {
      const totals=Object.fromEntries(ids(r).map(id=>[id,0])),holes=[];
      for(const n of ns)for(const id of ids(r)){const s=normalizeScore(r.scores[id]?.[n]);if(s?.completion!=='holed_out'){holes.push({number:n,playerId:id,status:'pending'});continue;}const d=s.grossStrokes-(g.basis==='net'?allowances(r)[id][n]:0)-par(r,id,n),value=d<=-3?3:d===-2?2:d===-1?1:0;totals[id]+=value;holes.push({number:n,playerId:id,status:'processed',value});}return {id:g.id,type:g.type,totals,holes,status:holes.some(h=>h.status==='pending')?'incomplete':'decided',unit:'分'};
    }
    const totals=Object.fromEntries(ids(r).map(id=>[id,{numerator:0,denominator:1}]));
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    const holes=ns.map(n=>{const e=(r.awards||[]).find(x=>x.sideGameId===g.id&&x.holeNumber===n);if(!e||e.status==='pending')return {number:n,status:'pending'};if(e.status==='none')return {number:n,status:'processed',explanation:'无人达标'};for(const id of e.winnerIds){const a=totals[id],b=e.winnerIds.length,num=a.numerator*b+a.denominator,den=a.denominator*b,k=gcd(num,den);totals[id]={numerator:num/k,denominator:den/k};}return {...e,number:n,status:'processed'};});
    return {id:g.id,type:g.type,totals,holes,unit:'分',status:holes.some(h=>h.status==='pending')?'incomplete':'decided'};
  }
  function rawSummary(r,pid) {
    const out={total:0,par:0,played:0,processed:0,front:0,back:0,frontN:0,backN:0,putts:0,puttN:0,penalties:0,penaltyN:0,fw:0,fwN:0,gir:0,girN:0,types:{eagle:0,birdie:0,par:0,bogey:0,double:0,other:0},set:[]};
    for(const h of r.holes){const s=normalizeScore(r.scores[pid]?.[h.number]);if(!s)continue;out.processed++;if(s.completion!=='holed_out')continue;out.played++;out.total+=s.grossStrokes;const p=par(r,pid,h.number);out.par+=p;out.set.push(h.number);const half=h.number<=9?'front':'back';out[half]+=s.grossStrokes;out[half+'N']++;if(s.putts!==null&&s.technicalDataSource!=='legacy'){out.putts+=s.putts;out.puttN++;}out.penalties+=s.penalties;out.penaltyN++;if(p!==3&&s.fairway!==null){out.fwN++;out.fw+=Number(s.fairway);}if(s.green!==null){out.girN++;out.gir+=Number(s.green);}const d=s.grossStrokes-p;out.types[d<=-2?'eagle':d===-1?'birdie':d===0?'par':d===1?'bogey':d===2?'double':'other']++;}
    out.diff=out.total-out.par;out.totalText=out.played?String(out.total):'—';out.diffText=out.played?(out.diff===0?'E':out.diff>0?'+'+out.diff:String(out.diff)):'—';out.complete=out.played===r.holes.length;out.set.sort((a,b)=>a-b);out.fwRate=out.fwN?Math.round(out.fw/out.fwN*100)+'%':'—';out.girRate=out.girN?Math.round(out.gir/out.girN*100)+'%':'—';return out;
  }
  function strictEligible(r,pid) {return isFinished(r)&&rawSummary(r,pid).complete&&r.ruleSnapshot.penaltyPolicy.mode==='official'&&!r.ruleSnapshot.scoring.cap?.enabled&&!r.players.find(p=>p.id===pid)?.withdrawn&&!(r.events||[]).some(e=>e.type==='disqualified'&&!e.voided&&(e.beneficiary===pid||r.ruleSnapshot.grouping.teams?.some(t=>t.teamId===e.beneficiary&&t.playerIds.includes(pid))))&&!Object.values(r.scores[pid]||{}).some(s=>s.completionSource==='legacy_assumed');}
  function buildRoundSummary(r) {return {inputRevision:r.revision,ruleVersion:r.ruleSnapshot.ruleVersion,engineVersion:ENGINE,main:evaluateContest(r),sideGames:r.ruleSnapshot.sideGames.map(g=>evaluateSideGame(r,g)),players:r.players.map(p=>({...p,...rawSummary(r,p.id),strictEligible:strictEligible(r,p.id)}))};}
  function validateEvent(r,e) {
    if(!e.reason?.trim())fail('REASON_REQUIRED','赛事裁定需要填写原因');
    const scopes=[...(r.ruleSnapshot.scoring.type==='record_only'?[]:['main']),...(r.ruleSnapshot.sideGames.some(g=>g.type==='nassau')?['nassau-front','nassau-back']:[]),...r.ruleSnapshot.sideGames.map(g=>g.id)];
    if(!scopes.includes(e.contestId))fail('INVALID_SCOPE','请选择明确的比赛范围');
    if(e.type==='void_hole'){if(!r.ruleSnapshot.sideGames.some(g=>g.id===e.contestId&&g.type==='skins'))fail('INVALID_EVENT','只能对 Skins 整洞作废');}
    else if(!['concede_hole','loss_of_hole','concede_match','conceded_next_stroke','disqualified','withdrawn'].includes(e.type))fail('INVALID_EVENT','赛事事件无效');
    if(['concede_hole','loss_of_hole','concede_match','conceded_next_stroke'].includes(e.type)&&(r.ruleSnapshot.scoring.type!=='match_play'||!['main','nassau-front','nassau-back'].includes(e.contestId)))fail('INVALID_SCOPE','让步仅适用于选中的比洞范围');
    if(!['concede_match','disqualified','withdrawn'].includes(e.type)&&!order(r).includes(e.holeNumber))fail('INVALID_EVENT','事件球洞不存在');
    if(e.contestId==='nassau-front'&&e.holeNumber>9||e.contestId==='nassau-back'&&e.holeNumber<10)fail('INVALID_SCOPE','球洞不在该比赛范围内');
    if(e.type!=='void_hole'&&!(e.type==='conceded_next_stroke'?ids(r):competitors(r).map(c=>c.id)).includes(e.beneficiary))fail('INVALID_EVENT','请指定本范围的受益方或被裁定方');
    if(e.type==='conceded_next_stroke'&&(!Number.isInteger(e.creditedGross)||e.creditedGross<1||e.creditedGross>30))fail('INVALID_SCORE','认可后的总杆须为 1–30');
  }
  function validateAward(r,e) {
    const g=r.ruleSnapshot.sideGames.find(g=>g.id===e.sideGameId);if(!g||!['nearest','longest'].includes(g.type)||!g.holeNumbers.includes(e.holeNumber))fail('INVALID_AWARD','奖项或球洞无效');
    if(!['pending','winner','none','tie'].includes(e.status))fail('INVALID_AWARD','奖项状态无效');
    const winners=e.winnerIds||[];if(new Set(winners).size!==winners.length||winners.some(id=>!ids(r).includes(id))||e.status==='winner'&&winners.length!==1||e.status==='tie'&&winners.length<2||['pending','none'].includes(e.status)&&winners.length)fail('INVALID_AWARD','请明确指定赢家、并列或无人达标');
    if(e.measurement!=null&&(!Number.isFinite(e.measurement)||e.measurement<0))fail('INVALID_AWARD','距离应为空或非负数');
    if(g.qualification&&['winner','tie'].includes(e.status)&&e.qualified!==true)fail('INVALID_AWARD','请确认获奖者满足上果岭 / 上球道条件');
  }
  function applyOperation(round,op) {
    if(!op.operationId)fail('INVALID_OPERATION','操作缺少唯一编号');
    if((round.operations||[]).includes(op.operationId))return clone(round);
    if(op.baseRevision!==round.revision)fail('STALE_REVISION','成绩已在其他操作中更新，请刷新后重试');
    if(isFinished(round)&&!['correction','confirm_sources'].includes(op.type))fail('READ_ONLY','已结束球局请先进入更正模式');
    const r=clone(round),before={scores:clone(r.scores),events:clone(r.events||[]),awards:clone(r.awards||[]),ruleSnapshot:clone(r.ruleSnapshot),players:clone(r.players),holes:clone(r.holes)};
    if(op.type==='score'||op.type==='append_penalty') {
      if(!ids(r).includes(op.playerId)||!order(r).includes(op.holeNumber))fail('INVALID_SCORE','球友或球洞不存在');
      let s=op.score;
      if(op.type==='append_penalty') {const old=normalizeScore(r.scores[op.playerId][op.holeNumber]);if(!old||old.grossStrokes===null)fail('INVALID_SCORE','请先填写本洞总杆');if(!op.reason?.trim()||!Number.isInteger(op.amount)||op.amount<1)fail('REASON_REQUIRED','追加罚杆需填写正整数杆数及原因');s={...old,grossStrokes:old.grossStrokes+op.amount,strokes:old.grossStrokes+op.amount,penalties:old.penalties+op.amount};}
      if(s){s=normalizeScore(s);validateScore(s);if(s.completion==='conceded_next_stroke'&&r.ruleSnapshot.penaltyPolicy.mode==='official')fail('CONCESSION_SCOPE','正式比洞认可下一杆请使用“比赛事件”指定范围');r.scores[op.playerId][op.holeNumber]=s;}else delete r.scores[op.playerId][op.holeNumber];
    } else if(op.type==='event') {validateEvent(r,op.event);r.events=r.events||[];const e={...clone(op.event),eventId:op.event.eventId||op.operationId,revision:r.revision+1};if(r.events.some(x=>x.eventId===e.eventId))fail('DUPLICATE_EVENT','事件编号已存在');if(r.events.some(x=>!x.voided&&x.contestId===e.contestId&&x.holeNumber===e.holeNumber&&x.type===e.type&&x.beneficiary===e.beneficiary))fail('DUPLICATE_EVENT','此比赛事件已记录，请勿重复提交');if(r.events.some(x=>!x.voided&&x.contestId===e.contestId&&((e.type==='concede_match'&&x.type==='concede_match')||(x.holeNumber===e.holeNumber&&['concede_hole','loss_of_hole'].includes(x.type)&&['concede_hole','loss_of_hole'].includes(e.type)))))fail('CONFLICTING_EVENT','该范围已有让步或裁定；如属录入错误，请更正原事件');r.events.push(e);
    } else if(op.type==='award') {validateAward(r,op.award);r.awards=(r.awards||[]).filter(x=>!(x.sideGameId===op.award.sideGameId&&x.holeNumber===op.award.holeNumber));r.awards.push({...clone(op.award),eventId:op.operationId});
    } else if(op.type==='undo') {
      const log=(r.changeLog||[]).find(x=>x.operationId===op.targetId);if(!log)fail('INVALID_UNDO','找不到可撤销操作');
      if((r.changeLog||[]).some(x=>x.undoTarget===op.targetId))fail('INVALID_UNDO','此操作已撤销');
      if(log.newRevision!==r.revision)fail('STALE_REVISION','只能撤销最近一次变更');
      if(log.kind==='event'&&(!op.reason?.trim()||!op.entryError))fail('IRREVOCABLE_CONCESSION','实际让步不可撤回；仅录入错误可说明原因后更正');
      Object.assign(r,clone(log.before));
    } else if(op.type==='confirm_sources') {
      if(!op.reason?.trim()||op.actualConfirmed!==true)fail('REASON_REQUIRED','请确认旧记录均为实际完洞并说明核对来源');
      if(r.ruleSnapshot.penaltyPolicy.mode==='legacy_unspecified')fail('RULES_INCOMPLETE','请先通过整轮规则更正补充当时的判罚约定');
      for(const p of r.players)for(const s of Object.values(r.scores[p.id]||{}))if(s.completionSource==='legacy_assumed'){
        if(s.completion!=='holed_out')fail('INVALID_SCORE','请先更正并非实际完洞的旧记录');
        s.completionSource='user_verified';
      }
    } else if(op.type==='correction') {
      if(!op.reason?.trim())fail('REASON_REQUIRED','更正必须填写原因');
      Object.assign(r,clone(op.changes));validateRound(r);r.status=r.players.every(p=>rawSummary(r,p.id).processed===r.holes.length)?'finished_complete':'finished_incomplete';
    } else if(op.type==='rules') {
      if(!op.reason?.trim())fail('REASON_REQUIRED','整轮规则修订需要原因');
      r.ruleSnapshot=clone(op.rules);if(op.players)r.players=clone(op.players);if(op.holes)r.holes=clone(op.holes);validateRound(r);
    } else fail('INVALID_OPERATION','操作类型无效');
    r.mainContestId=r.ruleSnapshot.scoring.type==='record_only'?null:'main';r.revision++;r.updatedAt=op.time;r.operations=[...(r.operations||[]),op.operationId];r.ruleSnapshot.engineVersion=ENGINE;
    const after={scores:clone(r.scores),events:clone(r.events||[]),awards:clone(r.awards||[]),ruleSnapshot:clone(r.ruleSnapshot),players:clone(r.players),holes:clone(r.holes)};
    r.changeLog=[...(r.changeLog||[]),{operationId:op.operationId,kind:op.type,undoTarget:op.type==='undo'?op.targetId:null,actorId:op.actorId||'me',reason:op.reason||'记分员确认',before,after,time:op.time,baseRevision:op.baseRevision,newRevision:r.revision}];return r;
  }
  function validateRound(r) {
    if(!r?.id||!['draft','active','paused','finished_complete','finished_incomplete','cancelled'].includes(r.status)||!Number.isInteger(r.revision)||r.revision<0||!r.scores)fail('INVALID_ROUND','球局结构无效');
    validateRuleConfig(r);
    for(const p of r.players){if(!p.name||!r.scores[p.id])fail('INVALID_ROUND','球友快照不完整');for(const [n,s] of Object.entries(r.scores[p.id])){if(!order(r).includes(Number(n)))fail('INVALID_SCORE','成绩引用未知球洞');validateScore(s);}}
    for(const e of r.events||[])validateEvent(r,e);for(const e of r.awards||[])validateAward(r,e);return true;
  }
  function migrateRound(old) {
    if(old.schemaVersion===3){validateRound(old);return clone(old);}
    const r=clone(old);r.schemaVersion=3;r.revision=old.revision||0;r.ruleSnapshot=defaultRules('stroke_play');r.ruleSnapshot.penaltyPolicy.mode='legacy_unspecified';r.playOrder=old.playOrder||old.holes.map(h=>h.number);r.holeOrder=[...r.playOrder];r.mainContestId='main';r.courseSnapshot=old.courseSnapshot||{id:old.courseId,name:old.courseName,holes:clone(old.holes)};
    r.events=[];r.awards=[];r.operations=[];r.changeLog=[];r.players=r.players.map(p=>({...p,tee:p.tee||old.tee||'未指定',holePars:Object.fromEntries(r.holes.map(h=>[h.number,h.par])),holeSI:Object.fromEntries(r.holes.map(h=>[h.number,null]))}));
    r.players.forEach(p=>{r.scores[p.id]=r.scores[p.id]||{};Object.keys(r.scores[p.id]).forEach(n=>{r.scores[p.id][n]={...normalizeScore(r.scores[p.id][n]),completionSource:'legacy_assumed',technicalDataSource:'legacy'};});});
    if(isFinished(old))r.status=r.players.every(p=>rawSummary(r,p.id).complete)?'finished_complete':'finished_incomplete';r.currentPlayer=r.currentPlayer||r.players[0].id;r.date=r.date||new Date(r.createdAt).toISOString().slice(0,10);validateRound(r);return r;
  }
  function migrateV1(data) {
    if(!data||![1,2,3].includes(data.version)||!Array.isArray(data.rounds)||!data.profile||data.profile.id!=='me'||typeof data.profile.name!=='string'||!data.profile.name.trim()||!Array.isArray(data.friends)||data.friends.some(p=>!p.id||p.id==='me'||typeof p.name!=='string')||new Set(data.friends.map(p=>p.id)).size!==data.friends.length)fail('INVALID_BACKUP','数据格式不正确或版本高于当前应用');
    const d=clone(data);d.rounds=d.rounds.map(migrateRound);if(new Set(d.rounds.map(r=>r.id)).size!==d.rounds.length)fail('INVALID_BACKUP','球局编号重复');d.version=3;d.settings=d.settings||{unit:'yd',technical:false};d.favorites=d.favorites||[];d.courses=d.courses||[];d.templates=d.templates||[];return d;
  }
  const api={MAX_PLAYERS,GROUP_MAX_PLAYERS,VERSION,ENGINE,topics,names,clone,defaultRules,order,isFinished,par,si,validSI,allocateStrokes,allowances,validateRuleConfig,normalizeScore,validateScore,points,derivePlayerHole,deriveTeamHole,competitors,contestHoles,evaluateContest,evaluateSideGame,rawSummary,strictEligible,buildRoundSummary,validateEvent,validateAward,applyOperation,validateRound,migrateRound,migrateV1};
  if(typeof module!=='undefined')module.exports=api;else root.GolfRules=api;
})(typeof globalThis==='undefined'?this:globalThis);
