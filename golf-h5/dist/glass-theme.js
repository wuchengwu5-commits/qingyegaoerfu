'use strict';
/* Presentation adapters only. The round engine and stored data schema stay intact. */
let glassPosition=null,glassLocationMessage='',glassLocating=false;
const glassOriginalCourses=coursesPage;
coursesPage=function(){
 let html=glassOriginalCourses();
 const hint=glassLocating?'正在定位…':glassLocationMessage||(glassPosition?'来源点估算直线距离 · 近处优先':'附近优先推荐');
 const locate=action('glass-locate',icon('pin')+'<span><b>'+ (glassPosition?'当前位置 · 附近球场':'开启定位')+'</b><small>'+esc(hint)+'</small></span>'+icon('chevron'),'glass-location','aria-label="定位并按附近球场排序"');
 html=html.replace(/<div class="directory-banner">[\s\S]*?<\/div>/,locate);
 return html.replace('配图为示意插画','配图为 AI 意境图，非球场实拍');
};
const glassFilteredCourses=filteredCourses;
function glassCourseKm(c){if(!glassPosition||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return null;const rad=n=>n*Math.PI/180,dlat=rad(c.latitude-glassPosition.latitude),dlon=rad(c.longitude-glassPosition.longitude),a=Math.sin(dlat/2)**2+Math.cos(rad(glassPosition.latitude))*Math.cos(rad(c.latitude))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));}
filteredCourses=function(){const cs=glassFilteredCourses();return glassPosition?cs.slice().sort((a,b)=>(glassCourseKm(a)??Infinity)-(glassCourseKm(b)??Infinity)):cs;};
courseThumbnail=function(c){let hash=0;for(const ch of c.id)hash=(hash*31+ch.charCodeAt(0))>>>0;return 'assets/glass/course-'+hash%3+'.jpg';};
const glassCourseCards=courseCards;
courseCards=function(){let html=glassCourseCards();for(const c of filteredCourses().slice(0,directoryLimit)){if(!C.canScore(c))continue;const km=glassCourseKm(c),label=km===null?'距离待补充':'约 '+(km<1?Math.round(km*1000/10)*10+' 米':km.toFixed(1)+' 公里');const name=esc(c.name),start=html.indexOf('aria-label="'+(route.q.has('select')&&C.canScore(c)?'选择':'查看')+name+'"'),end=html.indexOf('</button>',start);if(start>=0&&end>start){const chunk=html.slice(start,end).replace(/(<span class="course-segments[^>]*>)[\s\S]*?<\/span>/,'$1'+label+'</span>');html=html.slice(0,start)+chunk+html.slice(end);}}const first=html.indexOf('<article'),last=html.lastIndexOf('</article>');return first<0?html:html.slice(0,first)+'<div class="glass-course-list">'+html.slice(first,last+10)+'</div>'+html.slice(last+10);};
const glassActions=handleAction;
handleAction=async function(el,event){if(el.dataset.action!=='glass-locate')return glassActions(el,event);if(glassLocating)return;if(!navigator.geolocation){glassLocationMessage='此设备暂不支持定位，可手动选择地区';render();return;}glassLocating=true;glassLocationMessage='';render();navigator.geolocation.getCurrentPosition(p=>{glassPosition={latitude:p.coords.latitude,longitude:p.coords.longitude};glassLocating=false;glassLocationMessage='约数来自来源点，非导航或球道测距';render();},()=>{glassLocating=false;glassLocationMessage='定位未开启，可手动选择地区';render();},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});};
/* The home is a scene, rather than a dashboard with a photo inserted into it. */
home=function(){
 const a=active(),c=db.courses.find(c=>c.id===a?.courseId)||db.courses.find(c=>c.id==='cn_bg_585')||db.courses.find(c=>C.canScore(c));
 const holes=c?C.sections(c).flatMap(s=>s.holes):[],name=a?.courseName||c?.name||'下一场，去哪里？';
 const detail=c?[holes.length+'洞','Par '+holes.reduce((n,h)=>n+h.par,0),c.city||c.province].filter(Boolean).join(' · '):'发现更多值得一打的球场';
 return `<section class="home-immersive"><img class="home-scene" src="assets/glass/home-landscape.jpg" alt="晨光中的湖畔球道，青野 AI 意境图"><div class="home-opening"><img class="home-wordmark" src="assets/glass/wordmark.webp" alt="青野 QINGYE GOLF"><h1>走进绿意，把心放慢。</h1><p>沿着球道走一走，让呼吸慢下来。</p></div><div class="home-bottom-panel">${go(c?'course/'+c.id:'courses',`<span class="home-feature-copy"><strong>${esc(name)}</strong><small>${esc(detail)}</small></span><span class="home-feature-arrow">${icon('chevron')}</span>`,'home-feature-link')}${action(a?'resume':'start',icon('flag')+`<span>${a?'继续这一场好球':'开始一场好球'}</span>`+icon('arrow'),'btn primary full home-start',a?`data-id="${a.id}"`:'')}${action('community-about','木圣 AI · 让技术服务热爱','home-support')}${mode==='demo'?action('switch-mode','示例体验 · 使用我的记录 →','home-demo'):''}</div><small class="home-scene-credit">AI 意境 · 非球场实拍</small></section>`;
};
const glassRender=render;
render=function(){glassRender();document.body.dataset.view=route.name;document.body.classList.toggle('glass-courses',route.name==='courses');document.body.classList.toggle('glass-home',route.name==='home');};
render();
