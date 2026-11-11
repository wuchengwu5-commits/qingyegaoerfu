// Mobile map controls. Drawn on the same native canvas as the map; hit areas use items().
const ink='#193f31',paper='rgba(247,250,240,.88)',dark='rgba(28,65,47,.96)';
function box(c,x,y,w,h,r,color){
 c.save();c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
 let fill=color;
 if(typeof c.createLinearGradient==='function'&&(color===paper||color===dark)){
  fill=c.createLinearGradient(x,y,x+w*.55,y+h);
  fill.addColorStop(0,color===dark?'rgba(68,118,70,.97)':'rgba(252,255,246,.94)');
  fill.addColorStop(1,color===dark?'rgba(29,77,46,.98)':'rgba(233,243,222,.83)');
 }
 c.shadowColor='rgba(11,37,22,.16)';c.shadowBlur=7;c.shadowOffsetY=2;c.fillStyle=fill;c.fill();
 c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle=color===dark?'rgba(249,255,236,.3)':'rgba(255,255,245,.65)';c.lineWidth=1;c.stroke();c.restore();
}
function label(c,s,x,y,size,color=ink,bold=false,align='center'){c.fillStyle=color;c.font=(bold?'bold ':'')+size+'px sans-serif';c.textAlign=align;c.textBaseline='middle';c.fillText(String(s),x,y);}
function teeIcon(c,x,y){
 c.save();c.lineJoin='round';c.lineCap='round';c.beginPath();c.moveTo(x-3.4,y-3.8);c.lineTo(x+3.4,y-3.8);c.lineTo(x,y);c.closePath();c.strokeStyle='#244836';c.lineWidth=2.2;c.stroke();c.fillStyle='#f1e9cc';c.fill();c.beginPath();c.arc(x,y-6.3,3.45,0,Math.PI*2);c.fillStyle='#fffdf4';c.fill();c.strokeStyle='#294638';c.lineWidth=1.35;c.stroke();c.restore();
}
function locationIcon(c,x,y){
 c.save();c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=1.7;c.lineCap='round';c.beginPath();c.arc(x,y,6,0,Math.PI*2);c.stroke();c.beginPath();
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){c.moveTo(x+dx*7,y+dy*7);c.lineTo(x+dx*10,y+dy*10);}c.stroke();c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();c.restore();
}
function items(w,h,mode,safe,hasArt=false,hasReference=false,options={}){
 const b=h-safe-28,compact=h<560,wide=w>=600&&h<430;
 const common=[{key:'pick',name:'选择球洞',x:12,y:13,w:mode==='focus'?145:130,h:42},
 {key:'mode',name:mode==='focus'?'球场总览':'本洞测距',x:w-108,y:13,w:96,h:42},
 {key:'location',name:'定位我的位置',x:w-56,y:b-62,w:44,h:48},
 {key:'zoomIn',name:'放大地图',x:w-56,y:b-166,w:44,h:44},
 {key:'zoomOut',name:'缩小地图',x:w-56,y:b-122,w:44,h:44},
 {key:'info',name:'地图说明',x:10,y:b-4,w:Math.min(225,w-96),h:30}];
 if(mode==='focus'){
  const height=compact?138:158,layerTop=b-(hasArt||hasReference?116:62);
  const top=Math.max(94,Math.min(h*.41-35,layerTop-height-14));
  common.push({key:'unit',name:'果岭距离，切换码或米',x:12,y:wide?94:top,w:wide?210:(compact?86:94),h:wide?82:height,horizontal:wide},
   {key:'prev',name:'上一洞',x:12,y:b-62,w:44,h:48},
   {key:'next',name:'下一洞',x:88,y:b-62,w:76,h:48});
 }
 if(mode==='focus'&&hasArt)common.push({key:'gps',name:'GPS 卫星图',x:wide?180:12,y:b-(wide?62:116),w:88,h:44},{key:'art',name:'精修图',x:wide?268:100,y:b-(wide?62:116),w:64,h:44});
 if(mode==='focus'&&hasReference)common.push({key:'reference',name:'精修图',x:wide?180:12,y:b-(wide?62:116),w:76,h:44});
 return common.filter(a=>!(a.key==='unit'&&options.showMeasures===false)&&!(a.key==='location'&&options.canLocate===false)&&!(a.key==='mode'&&options.hasOverview===false)&&!(['zoomIn','zoomOut'].includes(a.key)&&options.canInteract===false));
}
function draw(c,m){
 c.save();
 const {width:w,height:h,hole,mode,measures,unit,safe,scaleText,scaleWidth}=m;
 const controls=items(w,h,mode,safe,!!m.hasArt,!!m.hasReference,m.controls),get=k=>controls.find(a=>a.key===k);
 function pill(k,txt,bg=paper,fg=ink,size=13){const a=get(k);if(!a)return;box(c,a.x,a.y,a.w,a.h,Math.min(18,a.h/2),bg);label(c,txt,a.x+a.w/2,a.y+a.h/2,size,fg,true);}
 pill('pick',m.pickText||(mode==='focus'?hole.sectionName+' '+hole.local+' 号洞 ﹀':'全场 '+m.holes.length+' 洞 ﹀'));
 pill('mode',mode==='focus'?'球场总览':'本洞测距',dark,'#f5f9ed');
 if(mode==='focus'){
  box(c,13,61,58,24,11,'rgba(21,50,35,.86)');label(c,'PAR '+hole.par,42,73,12,'white',true);
  if(m.hasArt){
   const gps=get('gps'),art=get('art'),active=m.art||m.artLoading?art:gps;
   box(c,gps.x,gps.y,gps.w+art.w,gps.h,19,paper);box(c,active.x+3,active.y+3,active.w-6,active.h-6,16,dark);
   label(c,'GPS 卫星图',gps.x+gps.w/2,gps.y+gps.h/2,13,active===gps?'white':ink,true);
   label(c,m.artLoading?'加载中':m.artLabel||'精修图',art.x+art.w/2,art.y+art.h/2,13,active===art?'white':ink,true);
  }
  if(m.hasReference)pill('reference','精修图');
  const a=get('unit');if(a){const x=a.x,y=a.y,compact=a.h<150,cap=compact?78:88;
  if(a.horizontal){
   box(c,x,y,a.w,a.h,18,paper);box(c,x,y,100,a.h,18,dark);
   label(c,'果岭中心',x+50,y+15,12,'#ecf3df');label(c,measures.center,x+50,y+43,35,'white',true);label(c,unit==='yd'?'码':'米',x+50,y+69,11,'#e6f0dc');
   label(c,'前沿',x+112,y+25,12,'#4c6954',false,'left');label(c,measures.front,x+a.w-10,y+25,20,ink,true,'right');
   label(c,'后沿',x+112,y+58,12,'#4c6954',false,'left');label(c,measures.back,x+a.w-10,y+58,20,ink,true,'right');
  }else{
  box(c,x,y,a.w,a.h,18,paper);box(c,x,y,a.w,cap,18,dark);
  label(c,'果岭中心',x+a.w/2,y+17,12,'#ecf3df');label(c,measures.center,x+a.w/2,y+(compact?43:48),compact?35:40,'white',true);label(c,unit==='yd'?'码':'米',x+a.w/2,y+cap-12,11,'#e6f0dc');
  const frontY=y+cap+(compact?18:22),backY=y+cap+(compact?44:51);
  label(c,'前沿',x+10,frontY,12,'#4c6954',false,'left');label(c,measures.front,x+a.w-9,frontY,compact?18:20,ink,true,'right');
  label(c,'后沿',x+10,backY,12,'#4c6954',false,'left');label(c,measures.back,x+a.w-9,backY,compact?18:20,ink,true,'right');}}
  const p=get('prev'),n=get('next');box(c,p.x,p.y,n.x+n.w-p.x,p.h,20,paper);
  label(c,'‹',p.x+p.w/2,p.y+p.h/2,29,m.previousAvailable===false?'#93a490':ink);label(c,m.holeCountText||(hole.local+' / '+(m.holes.filter(a=>a.section===hole.section).length||9)),(p.x+p.w+n.x)/2,p.y+p.h/2,13,ink,true);
  c.save();if(m.nextAvailable===false)c.globalAlpha=.45;
  box(c,n.x+3,n.y+3,n.w-6,n.h-6,17,dark);label(c,'下一洞 ›',n.x+n.w/2,n.y+n.h/2,14,'#f5f9ed',true);
  c.restore();
 }else if(m.showLegend!==false){
  const groups=m.groups||[{name:'老球场',color:'#204c37'},{name:'天马场',color:'#265570'},{name:'新球场',color:'#85562f'}];
  const ys=h-safe-69,spacing=w<350?50:55;box(c,12,ys,Math.min(groups.length===2?176:224,w-116),31,14,paper);
  groups.forEach((g,i)=>{const x=23+spacing*i;c.fillStyle=g.color;c.beginPath();c.arc(x,ys+15.5,3,0,Math.PI*2);c.fill();label(c,g.short?g.short+' 场':g.name,x+7,ys+15.5,10,ink,false,'left');});
  const tx=24+spacing*groups.length;teeIcon(c,tx,ys+20);label(c,'起点',tx+8,ys+15.5,10,ink,false,'left');
 }
 const z=get('zoomIn');if(z){box(c,z.x,z.y,z.w,z.h*2,18,paper);label(c,'＋',z.x+z.w/2,z.y+z.h/2,24);label(c,'−',z.x+z.w/2,z.y+z.h*1.5,26);}
 const loc=get('location');if(loc){box(c,loc.x,loc.y,loc.w,loc.h,18,paper);locationIcon(c,loc.x+loc.w/2,loc.y+loc.h/2);}
 if(m.showCompass!==false){const cx=w-31,cy=84;c.save();c.translate(cx,cy);c.rotate(m.camera.angle||0);c.beginPath();c.moveTo(0,-12);c.lineTo(5,5);c.lineTo(0,2);c.lineTo(-5,5);c.closePath();c.fillStyle='white';c.strokeStyle='#304b38';c.lineWidth=1.7;c.fill();c.stroke();c.restore();label(c,'N',cx,cy+17,11,'white',true);}
 const foot=get('info');box(c,foot.x,foot.y+2,foot.w,25,9,'rgba(22,46,33,.82)');label(c,m.footText||'Esri · Vantor · GIS User Community  ⓘ',foot.x+8,foot.y+15,10,'white',false,'left');
 if(scaleText){const sY=h-safe-18;c.strokeStyle='white';c.lineWidth=2;c.beginPath();c.moveTo(w-12,sY);c.lineTo(w-12-Math.min(scaleWidth,76),sY);c.stroke();label(c,scaleText,w-12,sY-9,10,'white',true,'right');}
 c.restore();
}
module.exports={items,draw,box,label,teeIcon,locationIcon};
