'use strict';
/* Layout and navigation helpers only: scoring math remains in the shared engine. */
let mobileRosterExpanded=false,mobileFieldSequence=0,mobilePicker=null;
const mobileBaseScore=scorePage;
scorePage=function(){
 const html=mobileBaseScore(),r=round();if(!r)return html;
 const trigger=action('mobile-hole-picker',`<h1>第 ${r.currentHole} 洞</h1>${icon('chevron')}`,'hole-select-trigger',`aria-label="选择球洞，当前第${r.currentHole}洞" aria-haspopup="dialog"`);
 const roster=r.players.length>1?action('mobile-roster',mobileRosterExpanded?'收起同组记分卡':'查看同组记分卡','mobile-roster-toggle',`aria-expanded="${mobileRosterExpanded}"`):'';
 return html.replace(`<h1>第 ${r.currentHole} 洞</h1>`,trigger).replace(/(<section class="card score-panel compact-score-panel"[\s\S]*?<\/section>)/,'$1'+roster);
};
const mobileBaseCourse=courseDetail;
courseDetail=function(){const html=mobileBaseCourse().replace('全部洞段 Par 合计','Par 合计');return html.replace(/(<button class="btn primary full" data-action="go" data-path="(?:create\/|manual\?source=)[\s\S]*?<\/button>)$/, '<div class="dock course-start-dock">$1</div>');};
const mobileBaseActions=handleAction;
handleAction=async function(el,event){const a=el.dataset.action;
 if(a==='mobile-select-open'){
  const source=document.getElementById(el.dataset.select);if(!source||source.disabled)return;
  const root=document.querySelector('#modal-root'),fragment=document.createDocumentFragment(),hadModal=!!root.firstChild,priorFocus=lastFocus;
  if(hadModal)while(root.firstChild)fragment.appendChild(root.firstChild);
  mobilePicker={source,fragment,hadModal,priorFocus,trigger:el};
  modal(el.dataset.title,`<p>点击选项完成选择。</p><div class="mobile-choice-list" role="listbox" aria-label="${esc(el.dataset.title)}">${Array.from(source.options).map((option,index)=>action('mobile-select-choice',`<span>${esc(option.textContent)}</span>${option.selected?icon('check'):''}`,`mobile-choice-option ${option.selected?'active':''}`,`data-index="${index}" role="option" aria-selected="${option.selected}" ${option.disabled?'disabled':''}`)).join('')}</div>`);return;
 }
 if(a==='mobile-select-choice'){
  const state=mobilePicker,index=Number(el.dataset.index);if(!state||!state.source.options[index]||state.source.options[index].disabled)return;
  const changed=state.source.selectedIndex!==index;closeModal();
  if(changed){state.source.selectedIndex=index;state.source.dispatchEvent(new Event('change',{bubbles:true}));}
  improveMobileSemantics();return;
 }

 if(a==='mobile-roster'){mobileRosterExpanded=!mobileRosterExpanded;document.body.classList.toggle('show-score-roster',mobileRosterExpanded);el.textContent=mobileRosterExpanded?'收起同组记分卡':'查看同组记分卡';el.setAttribute('aria-expanded',String(mobileRosterExpanded));return;}
 if(a==='mobile-hole-picker'){
  const r=round();if(!r)return;
  modal('选择球洞',`<p>点击洞号切换，已记录的球洞带绿色圆点。</p><div class="mobile-hole-grid">${r.holes.map(h=>action('mobile-hole-set',`<b>${h.number}</b><small>Par ${h.par}</small>`,`mobile-hole-option ${r.currentHole===h.number?'active':''} ${r.scores[r.currentPlayer]?.[h.number]?'recorded':''}`,`data-hole="${h.number}" aria-label="切换到第${h.number}洞，Par ${h.par}" aria-pressed="${r.currentHole===h.number}"`)).join('')}</div>`);return;
 }
 if(a==='mobile-hole-set'){
  const r=round();if(!r||!r.holes.some(h=>h.number===Number(el.dataset.hole)))return;
  const rid=r.id,pid=r.currentPlayer,hole=el.dataset.hole;closeModal();
  const target=document.createElement('button');target.dataset.action='cell';target.dataset.rid=rid;target.dataset.id=pid;target.dataset.hole=hole;
  return mobileBaseActions(target,event);
 }
 return mobileBaseActions(el,event);
};
const mobileBaseCloseModal=closeModal;
closeModal=function(){
 if(!mobilePicker)return mobileBaseCloseModal();
 const state=mobilePicker;mobilePicker=null;
 mobileBaseCloseModal();
 if(state.hadModal)document.querySelector('#modal-root').appendChild(state.fragment);
 lastFocus=state.priorFocus;
 if(state.trigger.isConnected)state.trigger.focus({preventScroll:true});
};
function improveMobileSemantics(){
 document.querySelectorAll('.field>label,.hole-edit>label').forEach(label=>{const input=label.parentElement.querySelector('input,select,textarea');if(!input)return;if(!input.id)input.id='mobile-field-'+(++mobileFieldSequence);label.htmlFor=input.id;});
 document.querySelectorAll('input,select,textarea').forEach(input=>{if(!input.getAttribute('aria-label')&&!input.labels?.length&&input.placeholder)input.setAttribute('aria-label',input.placeholder);});
 document.querySelectorAll('select').forEach(source=>{
  if(!source.id)source.id='mobile-select-'+(++mobileFieldSequence);
  const label=source.labels?.[0],plainLabel=label?Array.from(label.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():'';
  const title=source.dataset.mobileTitle||source.getAttribute('aria-label')||label?.querySelector('span')?.textContent?.trim()||plainLabel||'选择选项';
  source.dataset.mobileTitle=title;if(label)label.htmlFor=source.id;
  let trigger=source.previousElementSibling;
  if(!trigger?.classList.contains('mobile-select-trigger')){trigger=document.createElement('button');trigger.type='button';trigger.className='mobile-select-trigger';trigger.dataset.action='mobile-select-open';source.before(trigger);source.hidden=true;}
  trigger.dataset.select=source.id;trigger.dataset.title=title;trigger.disabled=source.disabled;
  trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-label',title+'，当前'+(source.selectedOptions[0]?.textContent||'请选择'));
  trigger.innerHTML='<span>'+esc(source.selectedOptions[0]?.textContent||'请选择')+'</span>'+icon('chevron');
 });
 const pref=document.querySelector('[data-action="pref-tech"]');if(pref){pref.setAttribute('role','switch');pref.setAttribute('aria-checked',String(db.settings.technical));pref.setAttribute('aria-label','默认展开详细记录');}
 document.querySelectorAll('[data-action="unit"]').forEach(button=>{button.setAttribute('aria-pressed',String(db.settings.unit===button.dataset.value));});
 document.querySelectorAll('.scorecard-table tbody tr').forEach(row=>{row.classList.toggle('active-player-row',!!row.querySelector('.cell-btn.selected'));});
 const main=document.querySelector('main.page');if(main&&document.querySelector('.course-start-dock'))main.classList.add('with-dock');
 const live=document.querySelector('#toast');if(live){live.setAttribute('role','status');live.setAttribute('aria-live','polite');}
}
const mobileBaseRender=render;
render=function(){mobileBaseRender();improveMobileSemantics();};
const mobileBaseModal=modal;
modal=function(...args){mobileBaseModal(...args);improveMobileSemantics();};
function syncMobileViewport(){
 const viewport=window.visualViewport,height=viewport?.height||window.innerHeight,offset=viewport?.offsetTop||0;
 document.documentElement.style.setProperty('--mobile-visible-height',height+'px');
 document.documentElement.style.setProperty('--mobile-viewport-top',offset+'px');
 const focused=document.activeElement,editable=focused?.matches('input:not([type=checkbox]),textarea,select');
 const keyboard=!!editable&&window.innerHeight-height>130;document.body.classList.toggle('keyboard-open',keyboard);
 if(keyboard)focused.scrollIntoView({block:'nearest',inline:'nearest'});
}
window.visualViewport?.addEventListener('resize',syncMobileViewport);
window.visualViewport?.addEventListener('scroll',syncMobileViewport);
window.addEventListener('resize',syncMobileViewport);
document.addEventListener('focusin',syncMobileViewport);
document.addEventListener('focusout',()=>requestAnimationFrame(syncMobileViewport));
syncMobileViewport();render();

window.addEventListener('hashchange',()=>{mobilePicker=null;mobileBaseCloseModal();});
