/* Mobile selection sheet for the browser preview of WeChat <picker>. */
window.PreviewPicker=(()=>{
 let active=null;
 function close(){if(active)active();}
 function attach(trigger,{options,chosen,title,id,disabled,onChange}){
  trigger.type='button';trigger.id=id;trigger.classList.add('native-picker-preview');
  trigger.disabled=disabled||!options.length;trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label',title+'：'+(options[chosen]??'暂无可选项'));
  trigger.onclick=()=>{
   if(trigger.disabled)return;close();
   let pending=Math.max(0,Math.min(chosen,options.length-1));
   const host=document.querySelector('.phone'),overlay=document.createElement('div'),sheet=document.createElement('section');
   overlay.className='picker-overlay';sheet.className='picker-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','picker-sheet-title');
   const grip=document.createElement('div');grip.className='picker-grip';grip.setAttribute('aria-hidden','true');
   const header=document.createElement('div');header.className='picker-heading';
   const heading=document.createElement('h2');heading.id='picker-sheet-title';heading.textContent=title;
   const cancel=document.createElement('button');cancel.type='button';cancel.className='picker-cancel';cancel.textContent='取消';header.append(heading,cancel);
   const list=document.createElement('div');list.className='picker-options';list.setAttribute('role','radiogroup');list.setAttribute('aria-label',title);
   const buttons=options.map((label,i)=>{const b=document.createElement('button');b.type='button';b.className='picker-option';b.setAttribute('role','radio');const text=document.createElement('span');text.textContent=label;const mark=document.createElement('span');mark.className='picker-mark';mark.setAttribute('aria-hidden','true');b.append(text,mark);b.onclick=()=>choose(i);list.append(b);return b;});
   const footer=document.createElement('div');footer.className='picker-footer';const confirm=document.createElement('button');confirm.type='button';confirm.className='picker-confirm';confirm.textContent='确认选择';footer.append(confirm);sheet.append(grip,header,list,footer);overlay.append(sheet);
   const hidden=[...host.children].map(el=>[el,el.inert]);const content=document.getElementById('content'),oldOverflow=content.style.overflowY;hidden.forEach(([el])=>el.inert=true);content.style.overflowY='hidden';host.append(overlay);trigger.setAttribute('aria-expanded','true');
   function choose(i){pending=i;buttons.forEach((b,n)=>{b.setAttribute('aria-checked',String(n===i));b.tabIndex=n===i?0:-1;});}
   function done(){overlay.remove();hidden.forEach(([el,inert])=>el.inert=inert);content.style.overflowY=oldOverflow;trigger.setAttribute('aria-expanded','false');active=null;requestAnimationFrame(()=>{if(document.getElementById('modal').style.display!=='flex')document.getElementById(id)?.focus({preventScroll:true});});}
   active=done;cancel.onclick=done;overlay.onclick=e=>{if(e.target===overlay)done();};
   confirm.onclick=()=>{const changed=pending!==chosen;done();if(changed)onChange(pending);};
   sheet.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();done();return;}if(e.target.getAttribute('role')==='radio'&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();choose(e.key==='Home'?0:e.key==='End'?buttons.length-1:(pending+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+buttons.length)%buttons.length);buttons[pending].focus();}if(e.key==='Tab'){const focusable=[cancel,buttons[pending],confirm],i=focusable.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();confirm.focus();}else if(!e.shiftKey&&i===2){e.preventDefault();cancel.focus();}}};
   choose(pending);buttons[pending].focus({preventScroll:true});buttons[pending].scrollIntoView({block:'nearest'});
  };
 }
 return {attach,close};
})();
