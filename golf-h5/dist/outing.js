'use strict';
let storyState=null,storySequence=0,storyPhotoPromise=null;
const storyPhotoPath='assets/share/morning-fairway-original.png';
function courseNavigation(id){
 const c=db.courses.find(c=>c.id===id);if(!c)return toast('球场资料暂不可用');
 const links=GolfOuting.navigationLinks(c),location=[c.address,c.city||c.province].filter(Boolean)[0];
 modal('到球场去',`<div class="navigation-place">${icon('pin')}<div><h3>${esc(c.name)}</h3><p>${esc(location||'地址尚未补充，可按球场名称查找')}</p></div></div><div class="navigation-apps">${links.map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="navigation-app"><span class="navigation-app-symbol ${l.id}" aria-hidden="true">${icon(l.id==='apple'?'pin':'arrow')}</span><span><b>${l.name}</b><small>${l.hint}</small></span>${icon('chevron')}</a>`).join('')}</div>${action('copy-course-location',icon('copy')+' 复制球场名称与地址','btn outline full',`data-id="${esc(c.id)}"`)}<p class="navigation-note">在地图中确认球场及到达入口后，即可开始导航。未安装 App 或浏览器不支持唤起时，可使用地图网页或复制地址。</p>`);
 document.querySelector('.modal')?.classList.add('course-navigation-modal');
}
function storyPhoto(){if(!storyPhotoPromise){storyPhotoPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('图片加载失败'));image.src=storyPhotoPath;});storyPhotoPromise.catch(()=>{storyPhotoPromise=null;});}return storyPhotoPromise;}
function storyText(x,text,px,py,size,color,options={}){x.fillStyle=color;x.textAlign=options.align||'left';x.font=`${options.weight||400} ${size}px ${options.serif?'"Songti SC", "Noto Serif SC", serif':'-apple-system, "PingFang SC", sans-serif'}`;x.fillText(text,px,py);}
function storyLines(x,text,maxWidth,size){x.font=`400 ${size}px -apple-system, "PingFang SC", sans-serif`;const lines=[];let line='';for(const char of String(text)){if(x.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
function storyDialog(){
 const state=storyState;if(!state)return;const theme=GolfOuting.themes.find(t=>t.id===state.theme)||GolfOuting.themes[0];
 modal('分享球场时光',`<div class="share-story-preview" ${state.busy?'aria-busy="true"':''}>${state.url?`<img src="${state.url}" alt="高尔夫时光明信片：${esc(theme.title.join(''))}，${state.includeScore?'附我的成绩':'不展示成绩'}">`:`<div class="story-loading"><span>${icon('leaf')}</span><p>${state.error?'图片暂未准备好':'正在收下这片好风景…'}</p>${state.error?action('story-retry','重新生成','btn outline'):''}</div>`}</div><div class="share-story-customize ${state.previewOnly?'preview-only':''}"><div class="story-themes" aria-label="选择明信片文案">${GolfOuting.themes.map(t=>action('story-theme',t.name,t.id===state.theme?'active':'',`data-value="${t.id}" aria-pressed="${t.id===state.theme}"`)).join('')}</div><div class="story-options"><label><input type="checkbox" id="story-score" ${state.includeScore?'checked':''}><span>附上我的成绩</span></label><span>风景和心情，才是主角</span></div><div class="story-save-row">${action('save-share',icon('download')+' 保存明信片','btn primary full',state.busy||!state.url?'disabled':'')}</div><p class="story-save-help" role="status">${state.error?'生成未完成，请重试。':state.busy?'正在更新明信片…':'长按图片或保存后分享 · 仅包含自己的留念'}</p></div>`);
 document.querySelector('.modal')?.classList.add('share-story-modal');
 document.querySelector('.share-story-modal h2')?.insertAdjacentHTML('afterend',action('story-preview',state.previewOnly?'返回编辑':'看大图','story-preview-button'));
}
showShare=async function(id,keep=false){
 const r=db.rounds.find(r=>r.id===id);if(!r)return;
 if(!keep||storyState?.id!==id)storyState={id,theme:'wild',includeScore:false,url:null};
 const state=storyState,sequence=++storySequence;state.busy=true;state.error=false;shareImage=null;storyDialog();
 try{
  const photo=await storyPhoto();if(sequence!==storySequence||!document.querySelector('.share-story-modal'))return;
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1620;const x=canvas.getContext('2d'),theme=GolfOuting.themes.find(t=>t.id===state.theme)||GolfOuting.themes[0];
  x.drawImage(photo,0,0,photo.naturalWidth,photo.naturalHeight,0,0,1080,1620);
  const sky=x.createLinearGradient(0,0,0,590);sky.addColorStop(0,'rgba(248,247,236,.55)');sky.addColorStop(1,'rgba(248,247,236,0)');x.fillStyle=sky;x.fillRect(0,0,1080,590);
  storyText(x,'青 野',74,82,29,'#254937',{weight:600});storyText(x,'Q I N G Y E   G O L F',192,79,17,'#385441');
  x.strokeStyle='#4d695449';x.lineWidth=1;x.beginPath();x.moveTo(74,108);x.lineTo(1006,108);x.stroke();
  theme.title.forEach((line,i)=>storyText(x,line,73,221+i*95,77,'#234533',{serif:true}));
  theme.lines.forEach((line,i)=>storyText(x,line,78,391+i*41,24,'#415d49'));
  const paper=x.createLinearGradient(0,1195,0,1420);paper.addColorStop(0,'rgba(247,247,237,0)');paper.addColorStop(.64,'rgba(247,247,237,.94)');paper.addColorStop(1,'#f7f7ed');x.fillStyle=paper;x.fillRect(0,1195,1080,425);x.fillStyle='#f7f7ed';x.fillRect(0,1420,1080,200);
  storyText(x,'一 场 高 尔 夫 ， 一 段 好 时 光',78,1302,19,'#69806a');
  const courseLines=storyLines(x,r.courseName,920,32).slice(0,2);courseLines.forEach((line,i)=>storyText(x,line,76,1354+i*41,32,'#284b38'));const contentBottom=1354+(courseLines.length-1)*41;
  storyText(x,`${r.date.replaceAll('-','.')}  /  与青野一起，留住今天`,78,contentBottom+46,22,'#667b66');
  storyText(x,db.profile.name+' 的球场时光'+(mode==='demo'?' · 示例留念':''),78,contentBottom+88,24,'#416049');
  if(state.includeScore){const mine=r.players.find(p=>p.id==='me');const summary=mine?R.rawSummary(r,mine.id):null;storyText(x,GolfOuting.scoreCaption(summary,r.holes.length),78,contentBottom+129,23,'#637963');}
  x.strokeStyle='#58705a33';x.beginPath();x.moveTo(78,1550);x.lineTo(1002,1550);x.stroke();
  storyText(x,'青野  /  自在挥杆',78,1590,20,'#45634a');storyText(x,'AI 意境配图 · 非球场实拍',1002,1590,22,'#7b8877',{align:'right'});
  if(sequence!==storySequence||!document.querySelector('.share-story-modal'))return;
  state.url=canvas.toDataURL('image/png');state.busy=false;shareImage={canvas,url:state.url,id,filename:`青野-球场时光-${r.date}.png`};storyDialog();
 }catch(e){if(sequence===storySequence&&document.querySelector('.share-story-modal')){state.busy=false;state.error=true;state.url=null;storyDialog();}}
};
const outingResult=resultPage;resultPage=function(){return outingResult().replace(/>分享我的成绩<\/button>/,'>分享球场时光</button>');};
const outingActions=handleAction;handleAction=async function(el,event){const a=el.dataset.action;
 if(a==='course-navigate'){courseNavigation(el.dataset.id);return;}
 if(a==='copy-course-location'){const c=db.courses.find(c=>c.id===el.dataset.id);if(!c)return;const text=[c.name,c.address||c.city||c.province].filter(Boolean).join('\n');try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);toast('球场名称与地址已复制');}catch(e){modal('复制球场地址',`<p>长按下面的文字即可复制。</p><textarea class="copy-location" readonly aria-label="球场名称与地址">${esc(text)}</textarea>`);}return;}
 if(a==='story-preview'){if(storyState){storyState.previewOnly=!storyState.previewOnly;storyDialog();}return;}
 if(a==='story-theme'){if(!storyState||storyState.theme===el.dataset.value)return;storyState.theme=el.dataset.value;return showShare(storyState.id,true);}
 if(a==='story-retry'){if(storyState)return showShare(storyState.id,true);return;}
 if(a==='save-share'&&shareImage?.filename){const current=shareImage;current.canvas.toBlob(blob=>{if(blob){downloadBlob(blob,current.filename);toast('明信片已准备下载，可自行分享');}else toast('图片保存未完成，请长按图片保存');},'image/png');return;}
 if(a==='close'&&document.querySelector('.share-story-modal'))storySequence++;
 return outingActions(el,event);
};
document.addEventListener('change',e=>{if(e.target.id==='story-score'&&storyState){storyState.includeScore=e.target.checked;showShare(storyState.id,true);}});
render();
