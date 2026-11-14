// All screen marks are derived from the same georeferenced atlas as the satellite tiles.
const Raster = require('./atlas-raster');
const M = require('./map-core');
const Hud = require('./atlas-hud');
const Perimeter = require('./atlas-mask');
const Background = require('./atlas-background');
const Art = require('./atlas-art');
const {greenOverlay} = require('./atlas-config');
function line(ctx, points, color, width, dash=[]) {
  ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
}
function disc(ctx,x,y,r,fill,stroke,width=2){
  ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function text(ctx,s,x,y,color,size,bold=false){
  ctx.font=(bold?'bold ':'')+size+'px sans-serif';ctx.fillStyle=color;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(s),x,y);
}
function drawFlag(ctx,x,y){
  ctx.save();
  disc(ctx,x,y,2.5,'#203c2a','#fff8e7',1);
  const pole=[[x,y],[x,y-22]];
  line(ctx,pole,'rgba(22,42,31,.85)',3.4);
  line(ctx,pole,'#fff9eb',1.6);
  ctx.beginPath();ctx.moveTo(x+.8,y-22);ctx.lineTo(x+15,y-18);ctx.lineTo(x+.8,y-13);ctx.closePath();
  ctx.fillStyle='#e13e35';ctx.fill();ctx.strokeStyle='#872e27';ctx.lineWidth=.8;ctx.stroke();
  ctx.restore();
}
function bubble(ctx, label, x, y, width, height) {
  ctx.font='bold 14px sans-serif';const w=ctx.measureText(label).width+22;
  x=Math.max(w/2+4,Math.min(width-w/2-4,x));y=Math.max(15,Math.min(height-15,y));
  ctx.fillStyle='rgba(25,55,39,.94)';ctx.beginPath();ctx.moveTo(x-w/2+8,y-14);
  ctx.arcTo(x+w/2,y-14,x+w/2,y+14,8);ctx.arcTo(x+w/2,y+14,x-w/2,y+14,8);ctx.arcTo(x-w/2,y+14,x-w/2,y-14,8);ctx.arcTo(x-w/2,y-14,x+w/2,y-14,8);ctx.fill();
  text(ctx,label,x,y+.5,'white',14,true);
}
function drawGreen(ctx, points, selected) {
  const radius = greenOverlay?.cornerRadius || 0;
  ctx.save();
  ctx.beginPath();
  if (radius) {
    // Round the screen path within each corner. Measurements still use the source polygon.
    const towards = (point, neighbor) => {
      const dx = neighbor[0] - point[0], dy = neighbor[1] - point[1];
      const length = Math.hypot(dx, dy);
      const fraction = length ? Math.min(radius / length, .28) : 0;
      return [point[0] + dx * fraction, point[1] + dy * fraction];
    };
    points.forEach((point, i) => {
      const entry = towards(point, points[(i + points.length - 1) % points.length]);
      const exit = towards(point, points[(i + 1) % points.length]);
      if (i === 0) ctx.moveTo(...entry);
      else ctx.lineTo(...entry);
      ctx.quadraticCurveTo(...point, ...exit);
    });
  } else {
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  }
  ctx.closePath();
  if (greenOverlay) ctx.globalAlpha *= greenOverlay.opacity;
  ctx.fillStyle = selected ? 'rgba(178,225,104,.30)' : 'rgba(194,231,167,.18)';
  ctx.fill();
  ctx.strokeStyle = selected ? '#d7f3a3' : 'rgba(224,242,198,.70)';
  ctx.lineWidth = (selected ? 1.8 : 1) * (greenOverlay?.lineScale ?? 1);
  ctx.stroke();
  ctx.restore();
}
function draw(ctx,model){
  const {width,height,atlas,image,camera,holes,hole,origin,target,mode,unit}=model;
  const screen=p=>M.screen(p,camera,atlas), world=p=>M.world(p,camera,atlas);
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#58705b';ctx.fillRect(0,0,width,height);
  if(!image)return [];
  Background.draw(ctx,model,Raster,Perimeter,M);
  ctx.fillStyle=mode==='overview'?'rgba(16,35,22,.06)':'rgba(16,35,22,.14)';
  ctx.fillRect(0,0,width,height);ctx.lineJoin='round';ctx.lineCap='round';
  if(mode==='focus'&&model.art){
    ctx.fillStyle='rgba(28,48,38,.42)';ctx.fillRect(0,0,width,height);
    Art.draw(ctx,model.art,model.artSpec,screen(hole.tee),screen(hole.green));
  }
  const outlines=mode==='overview'?holes:model.art?[]:[hole];
  for(const h of outlines){
    const pts=h.route.map(screen);
    if(mode==='overview'){line(ctx,pts,'rgba(21,42,30,.70)',3);line(ctx,pts,h===hole?'#ffdf84':'rgba(247,248,224,.81)',1.2,[4,4]);}
    drawGreen(ctx,h.outline.map(screen),h===hole);
  }
  if(mode==='focus'){
    const p=screen(origin),q=screen(target),g=screen(hole.green);
    const direct=Math.hypot(target[0]-hole.green[0],target[1]-hole.green[1])<1;
    const points=direct?[p,g]:[p,q,g];line(ctx,points,'rgba(23,42,34,.65)',4);line(ctx,points,'#fff8d8',2,[6,5]);
    const suffix=unit==='yd'?'码':'米',distance=(from,to)=>M.value(M.distance(from,to,atlas),unit)+' '+suffix;
    bubble(ctx,distance(origin,direct?hole.green:target),(p[0]+q[0])/2+16,(p[1]+q[1])/2,width,height);
    if(!direct){bubble(ctx,distance(target,hole.green),(q[0]+g[0])/2+16,(q[1]+g[1])/2,width,height);disc(ctx,q[0],q[1],8,'#dfb65a','#fff9df',2);line(ctx,[[q[0]-12,q[1]],[q[0]+12,q[1]]],'#fff9df',1.5);line(ctx,[[q[0],q[1]-12],[q[0],q[1]+12]],'#fff9df',1.5);}
    disc(ctx,p[0],p[1],8,model.isFix?'#317fb8':'#f7faf3','#1d5138',3);disc(ctx,p[0],p[1],2.5,model.isFix?'white':'#1d5138');
    const originText=model.isFix?'我的位置':model.originLabel==='手动起点'?'手动起点':'起点';
    ctx.font='bold 14px sans-serif';
    const labelWidth=ctx.measureText(originText).width+22;
    const labelX=Math.max(labelWidth/2+4,Math.min(width-labelWidth/2-4,p[0]+31));
    const controls=Hud.items(width,height,mode,model.safe,!!model.hasArt,!!model.hasReference,model.controls);
    const hitsControl=controls.some(a=>labelX+labelWidth/2>a.x&&labelX-labelWidth/2<a.x+a.w&&p[1]+1>a.y&&p[1]-27<a.y+a.h);
    bubble(ctx,originText,hitsControl?p[0]-31:p[0]+31,p[1]-13,width,height);
  }
  const pins=[];
  const tees=mode==='overview'?holes.map(h=>screen(h.tee)).filter(([x,y])=>x>=0&&y>=0&&x<=width&&y<=height):[];
  for(const [x,y] of tees)Hud.teeIcon(ctx,x,y);
  const visible=mode==='overview'?(hole?[hole,...holes.filter(h=>h!==hole)]:holes):[hole];
  const labels=[];
  const reserved=Hud.items(width,height,mode,model.safe,!!model.hasArt,!!model.hasReference,model.controls);
  if(mode==='overview'&&model.showLegend!==false)reserved.push({x:12,y:height-model.safe-69,w:Math.min((model.groups||[]).length===2?176:224,width-116),h:31});
  for(const h of visible){
    const [gx,gy]=screen(h.green);
    if(gx<0||gy<0||gx>width||gy>height)continue;
    if(mode==='focus'){
      drawFlag(ctx,gx,gy);
      pins.push({x:gx+5,y:gy-11,n:h.number,hw:12,hh:15});
      continue;
    }
    const w=31,ht=20;
    const offsets=[[0,-18],[0,17],[23,-9],[-23,-9],[25,12],[-25,12],[0,-37],[0,37],[-40,-25],[40,-25],[-43,22],[43,22],[-64,0],[64,0],[0,-60],[0,60]];
    let best=null;
    for(const [dx,dy] of offsets){
      const x=Math.max(w/2+1,Math.min(width-w/2-1,gx+dx)),y=Math.max(ht/2+1,Math.min(height-ht/2-1,gy+dy));
      const overlaps=pins.filter(v=>Math.abs(v.x-x)<w+2&&Math.abs(v.y-y)<ht+2).length;
      const coversTee=tees.some(([tx,ty])=>Math.abs(tx-x)<w/2+5&&Math.abs(ty-5-y)<ht/2+6);
      const coversControl=reserved.some(a=>x+w/2+3>a.x&&x-w/2-3<a.x+a.w&&y+ht/2+3>a.y&&y-ht/2-3<a.y+a.h);
      const score=(coversControl?10000:0)+overlaps*1000+(coversTee?150:0)+Math.hypot(x-gx,y-gy);
      if(!best||score<best.score)best={x,y,score};
      if(!overlaps&&!coversTee&&!coversControl)break;
    }
    const {x,y}=best;
    labels.push({h,gx,gy,x,y,w,ht});
    pins.push({x,y,n:h.number,hw:w/2+2,hh:ht/2+2});
  }
  // Draw every leader before the labels, so a later hole cannot strike through
  // an earlier number when greens are tightly clustered.
  for(const {gx,gy,x,y} of labels){
    line(ctx,[[gx,gy],[x,y]],'#fffce4',1.3);disc(ctx,gx,gy,2.5,'#fffce4');
  }
  for(const {h,x,y,w,ht} of labels){
    Hud.box(ctx,x-w/2-1,y-ht/2-1,w+2,ht+2,ht/2,'#efefdc');
    Hud.box(ctx,x-w/2,y-ht/2,w,ht,ht/2,h.color);
    text(ctx,h.tag,x,y+.4,'white',11,true);
  }
  if(mode==='overview'&&model.fix){
    const [x,y]=screen(model.fix);disc(ctx,x,y,11,'rgba(64,152,226,.35)');disc(ctx,x,y,5,'#2385cf','white',2);
  }
  Hud.draw(ctx,model);
  // Draw status on the same native canvas so it remains visible above the imagery.
  if(model.notice){
    const x=80,y=61,w=width-132,lines=[];let current='';ctx.font='10px sans-serif';
    for(const ch of model.notice){if(ctx.measureText(current+ch).width>w-14){lines.push(current);current=ch;}else current+=ch;}if(current)lines.push(current);
    Hud.box(ctx,x,y,w,lines.length*14+8,8,'rgba(255,247,220,.95)');
    lines.forEach((s,i)=>text(ctx,s,x+w/2,y+11+i*14,'#76531e',10));
  }
  return pins;
}
module.exports={draw};
