// Identity switching is a local UI simulation, not authentication or network sync.
function ensureMembers() {
  if (!store.round) { store.actor = 0; return; }
  if (!Number.isInteger(store.actor) || !store.round.config.players[store.actor]) store.actor = 0;
  store.round.history ||= [];
  store.round.cursors ||= {};
}
function activeIndex() { return store.actor || 0; }
function isOwner() { return activeIndex() === 0; }
function canEdit(i) { return !!store.round && !store.round.finished && (isOwner() || i === activeIndex()); }
function ownerOnly() {
  if (isOwner()) return true;
  toast('此操作由创建者完成，可切换演示身份体验');
  return false;
}
function recordLabel(r) {
  return !r ? '未记' : r.kind === 'pickup' ? '捡球' : r.gross + ' 杆' + (r.kind === 'given' ? '（含免推）' : '');
}
function sameRecord(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function addHistory(type,changes=[],extra={}) {
  const r=store.round;
  r.history.push({id:(r.history.at(-1)?.id||0)+1,at:Date.now(),actor:activeIndex(),name:c().players[activeIndex()].name,type,changes:G.clone(changes),...extra});
  r.updated=Date.now();
}
function changedCells(previous) {
  const r=store.round, changes=[];
  r.records.forEach((row,i)=>row.forEach((value,h)=>{
    if(!sameRecord(previous[i][h],value)) changes.push({player:i,hole:h,from:G.clone(previous[i][h]),to:G.clone(value)});
  }));
  return changes;
}
function latestEdit(i,h) {
  return [...store.round.history].reverse().find(event=>event.changes.some(x=>x.player===i&&x.hole===h));
}
function identityBar() {
  if(store.creating || !store.round) return '';
  const p=c().players[activeIndex()];
  return `<button class="identity-switch" data-action="members"><span class="identity-dot">${esc(p.name[0])}</span><span><small>当前演示身份 · ${isOwner()?'创建者':'组员'}</small><b>${esc(p.name)}</b></span><span class="identity-link">切换身份 ⇄</span></button><div class="identity-caption">${isOwner()?'可代记全组':'可独立记、改自己的成绩'}<span>本机模拟 · 非联网同步</span></div>`;
}
function membersModal() {
  if(!store.round) { toast('创建球局后即可切换组员身份'); return; }
  modal('每位球友，都能自己记',`<p>选择一个身份体验。创建者可代记全组；组员可独立保存、修改自己的成绩，全组成绩都能查看。</p><div class="member-options">${c().players.map((p,i)=>`<button class="member-option ${i===activeIndex()?'active':''}" data-actor="${i}" aria-pressed="${i===activeIndex()}"><span class="avatar">${esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${i===0?'创建者 · 可代记全组':'组员 · 只记改自己'}</small></span><span class="member-check">${i===activeIndex()?'✓':'切换'}</span></button>`).join('')}</div><div class="simulation-note">这是同一浏览器内切换身份的演示，不代表多台手机已联网同步，也没有真实登录认证。</div>`);
}
function switchActor(i) {
  if(!Number.isInteger(i)||!c().players[i]) return;
  if(i===activeIndex()) { closeModal(); return; }
  guard(()=>{
    const r=store.round;
    r.cursors[activeIndex()]=r.hole;
    store.actor=i;
    r.hole=r.cursors[i]??G.holes(c()).find(h=>!r.records[i][h])??G.holes(c())[0];
    r.view='score';store.creating=false;selected=i;before=null;
    loadScores();closeModal();persist();render(true);
    toast('现在以 '+c().players[i].name+' 的身份记分');
  });
}
function historyModal() {
  const events=[...store.round.history].reverse(),labels={save:'保存成绩',undo:'撤销修改',seed:'载入演示成绩',outcome:'更正洞结果',finish:'确认结束本轮',unlock:'解锁成绩'};
  modal('记分与修改记录',`<p>全组可以查看谁在什么时间记分、改分。记录保存在当前浏览器中。</p>${events.length?`<ol class="history-list">${events.slice(0,50).map(e=>`<li><div class="history-head"><b>${esc(e.name)}</b><span>${labels[e.type]||'更新记录'}${e.actor===0?' · 创建者':''}</span></div><time>${new Date(e.at).toLocaleString('zh-CN',{hour12:false})}</time>${e.changes.map(x=>`<div class="history-change"><span>${esc(c().players[x.player].name)} · 第 ${x.hole+1} 洞</span><strong>${recordLabel(x.from)} → ${recordLabel(x.to)}</strong></div>`).join('')}${e.detail?`<p>${esc(e.detail)}</p>`:''}</li>`).join('')}</ol>${events.length>50?'<p>显示最近 50 次操作，全部记录仍保存在本机。</p>':''}`:'<div class="history-empty">还没有记分记录<br><small>保存第一笔成绩后，会显示在这里。</small></div>'}`);
}
function saveMemberScores() {
  const r=store.round,conf=c(),h=r.hole;
  if(r.finished) return;
  const ids=isOwner()?conf.players.map((_,i)=>i):[activeIndex()];
  const changes=ids.filter(i=>!sameRecord(r.records[i][h],draftScores[i])).map(i=>({player:i,hole:h,from:G.clone(r.records[i][h]),to:G.clone(draftScores[i])}));
  if(!changes.length&&!ids.some(i=>r.records[i][h])&&!(isOwner()&&r.overrides[h]!==undefined)) {
    selected=activeIndex();toast(isOwner()?'请先填写至少一位球友的成绩':'请先填写自己的本洞成绩');render();return;
  }
  if(changes.length) {
    changes.forEach(x=>r.records[x.player][h]=G.clone(x.to));
    before={actor:activeIndex(),hole:h,changes:G.clone(changes)};
    addHistory('save',changes);
  }
  const hs=G.holes(conf),at=hs.indexOf(h);
  if(at<hs.length-1) r.hole=hs[at+1];else {r.view='card';cardHalf=h>=9?1:0;}
  r.cursors[activeIndex()]=r.hole;
  loadScores();selected=isOwner()?-1:activeIndex();
  const saved=persist();render(true);
  if(saved) toast(changes.length?'第 '+(h+1)+' 洞已保存'+(isOwner()?'':' · 其他球友可各自补记'):'已查看本洞，继续下一洞');
}
function undoMemberSave() {
  const r=store.round,op=before;
  if(!op||op.actor!==activeIndex()||r.finished) return;
  guard(()=>{
    if(op.changes.some(x=>!sameRecord(r.records[x.player][x.hole],x.to))) {before=null;toast('成绩已有新修改，请直接核对后更正');render();return;}
    const changes=op.changes.map(x=>({...x,from:G.clone(x.to),to:G.clone(x.from)}));
    changes.forEach(x=>r.records[x.player][x.hole]=G.clone(x.to));
    if(op.override) {const {hole,from}=op.override;if(from===undefined)delete r.overrides[hole];else r.overrides[hole]=from;}
    addHistory('undo',changes,op.override?{detail:'撤销第 '+(op.override.hole+1)+' 洞的结果录入'}:{});
    r.hole=op.hole;r.cursors[activeIndex()]=r.hole;r.view='score';before=null;selected=isOwner()?-1:activeIndex();
    loadScores();persist();render(true);toast('已撤销上次保存，修改记录已保留');
  });
}
function scoreDock() {
  const r=store.round;
  if(r.view==='score') return `<button class="primary" data-action="${r.finished?'result':'save'}">${r.finished?'查看本场结果':(isOwner()?'保存本洞':'保存我的成绩')+(r.hole===G.holes(c()).at(-1)?' · 查看记分卡':' · 下一洞')}　→</button>`;
  if(!isOwner()) return `<button class="primary" data-view="score">${r.finished?'返回查看记分':'返回记我的成绩'}　→</button>`;
  return `<button class="back" data-view="score">记分</button><button class="primary" data-action="${r.finished?'unlock':'finish'}">${r.finished?'更正误录 · 解锁成绩':'核对成绩 · 结束本轮'}</button>`;
}
