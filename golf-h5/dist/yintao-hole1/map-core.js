(function(root){
  'use strict';
  const R=6378137,rad=Math.PI/180;
  function toGeo(p,d){const e=d.extent,x=e.xmin+p[0]/d.width*(e.xmax-e.xmin),y=e.ymax-p[1]/d.height*(e.ymax-e.ymin);return [x/R/rad,(2*Math.atan(Math.exp(y/R))-Math.PI/2)/rad];}
  function toPixel(g,d){const e=d.extent,x=R*g[0]*rad,y=R*Math.log(Math.tan(Math.PI/4+g[1]*rad/2));return [(x-e.xmin)/(e.xmax-e.xmin)*d.width,(e.ymax-y)/(e.ymax-e.ymin)*d.height];}
  function meters(a,b){const p=a[1]*rad,q=b[1]*rad,dp=q-p,dl=(b[0]-a[0])*rad,h=Math.sin(dp/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(dl/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
  function distance(a,b,d){return meters(toGeo(a,d),toGeo(b,d));}
  function inside(p,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
  function cross(a,b){return a[0]*b[1]-a[1]*b[0];}
  function greenEdges(origin,center,polygon){
    const v=[center[0]-origin[0],center[1]-origin[1]],hits=[];
    if(Math.hypot(...v)<1e-8)return null;
    for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],u=[b[0]-a[0],b[1]-a[1]],delta=[a[0]-origin[0],a[1]-origin[1]],det=cross(v,u);if(Math.abs(det)<1e-9)continue;const t=cross(delta,u)/det,s=cross(delta,v)/det;if(s>=-1e-8&&s<=1+1e-8)hits.push({t,p:[origin[0]+v[0]*t,origin[1]+v[1]*t]});}
    hits.sort((a,b)=>a.t-b.t);if(hits.length<2)return null;return {front:hits[0].p,back:hits[hits.length-1].p};
  }
  function measure(s,d){const green=d.features.find(f=>f.id==='green'),e=greenEdges(s.origin,d.greenCenter,green.points),onGreen=inside(s.origin,green.points);return {first:distance(s.origin,s.target,d),second:distance(s.target,d.greenCenter,d),center:distance(s.origin,d.greenCenter,d),front:e&&!onGreen?distance(s.origin,e.front,d):null,back:e&&!onGreen?distance(s.origin,e.back,d):null,edges:e,onGreen};}
  function value(m,unit){return Number.isFinite(m)?Math.round(unit==='yd'?m/0.9144:m):'—';}
  function inBounds(p,d){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=d.width&&p[1]>=0&&p[1]<=d.height;}
  function fit(w,h,d){return {scale:Math.min(w/d.width,h/d.height)*.93,x:w/2,y:h/2};}
  function rotated(p,c,d){const x=p[0]-d.width/2,y=p[1]-d.height/2,a=c.angle||0;return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];}
  function screen(p,c,d){const q=rotated(p,c,d);return [q[0]*c.scale+c.x,q[1]*c.scale+c.y];}
  function focusFit(w,h,d,courseMaps=[]){
    const angle=Math.atan2(d.defaultOrigin[0]-d.greenCenter[0],d.defaultOrigin[1]-d.greenCenter[1]),c={angle,scale:1,x:0,y:0};
    const points=(d.focusRoute||d.features.find(f=>f.kind==='rough').points).map(p=>rotated(p,c,d));
    const px=d.focusPaddingX??65,py=d.focusPaddingY??50;
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(...xs)-px,xmax=Math.max(...xs)+px,ymin=Math.min(...ys)-py,ymax=Math.max(...ys)+py;
    const left=w*.36,right=w-22,top=26,bottom=h-48;
    let scale=Math.min((right-left)/(xmax-xmin),(bottom-top)/(ymax-ymin));
    if(d.par===3){
      // Compare geographic scale, since hole 1 and the satellite atlas have different resolutions.
      const metersPerPixel=map=>distance([map.width/2,map.height/2],[map.width/2+1,map.height/2],map);
      const referenceScales=courseMaps.filter(map=>map.courseId===d.courseId&&map.par===4)
        .map(map=>focusFit(w,h,map).scale/metersPerPixel(map)).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
      if(referenceScales.length){
        const mid=Math.floor(referenceScales.length/2),reference=(referenceScales[mid]+referenceScales[Math.floor((referenceScales.length-1)/2)])/2;
        scale=Math.min(scale,reference*metersPerPixel(d));
      }
    }
    return {angle,scale,x:(left+right)/2-(xmin+xmax)/2*scale,y:(top+bottom)/2-(ymin+ymax)/2*scale};
  }
  function zoomCamera(c,f,p,d,min,max){const q=world(p,c,d),scale=Math.max(min,Math.min(max,c.scale*f)),v=rotated(q,c,d);c.scale=scale;c.x=p[0]-v[0]*scale;c.y=p[1]-v[1]*scale;return c;}
  function world(p,c,d){const x=(p[0]-c.x)/c.scale,y=(p[1]-c.y)/c.scale,a=c.angle||0;return [x*Math.cos(a)+y*Math.sin(a)+d.width/2,-x*Math.sin(a)+y*Math.cos(a)+d.height/2];}
  function path(ctx,points,closed=true){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(closed)ctx.closePath();}
  function fillFeature(ctx,f){
    const colors={fairway:'rgba(126,150,77,.80)',green:'rgba(143,164,90,.84)',tee:'rgba(125,148,77,.72)',bunker:'rgba(226,214,176,.92)',water:'rgba(53,101,94,.38)'};
    if(!colors[f.kind])return;
    ctx.save();path(ctx,f.points);ctx.fillStyle=colors[f.kind];ctx.fill();
    if(f.kind==='fairway'){
      ctx.clip();ctx.strokeStyle='rgba(207,222,165,.07)';ctx.lineWidth=18;
      for(let y=-800;y<2200;y+=48){ctx.beginPath();ctx.moveTo(-200,y);ctx.lineTo(1100,y+650);ctx.stroke();}
    }
    ctx.restore();
    if(f.kind==='fairway'||f.kind==='green'){path(ctx,f.points);ctx.lineWidth=1.6;ctx.strokeStyle='rgba(220,231,183,.27)';ctx.stroke();}
  }
  function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
  function polygonDistance(p,points,closed=true){let nearest=Infinity;
    for(let i=closed?0:1,j=closed?points.length-1:0;i<points.length;j=i++){
      const a=points[j],b=points[i],x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));
      const dx=p[0]-a[0]-t*x,dy=p[1]-a[1]-t*y;nearest=Math.min(nearest,dx*dx+dy*dy);
    }return Math.sqrt(nearest);
  }
  // Keep a clear outer buffer, then blend across a narrow continuous edge.
  function focusOpacity(p,d){
    const rough=d.focusRoute?null:d.features.find(f=>f.kind==='rough').points;
    const outside=d.focusRoute?Math.max(0,polygonDistance(p,d.focusRoute,false)-d.focusRadius):inside(p,rough)?0:polygonDistance(p,rough);
    const fadeDistance=Math.max(0,outside-(d.focusSolidBuffer??0));
    const feather=1-smooth(fadeDistance/(d.focusFeather??140));
    const edge=Math.min(p[0],p[1],d.width-p[0],d.height-p[1]);
    return feather*smooth(edge/(d.edgeFeather??60));
  }
  function drawSource(ctx,image,d){const f=d.sourceWindow;if(f)ctx.drawImage(image,f.x,f.y,f.width,f.height,0,0,d.width,d.height);else ctx.drawImage(image,0,0,d.width,d.height);}
  function focusSurface(image,d,makeCanvas,enhanced){
    const step=d.maskStep||4,surface=makeCanvas(d.width,d.height),mw=Math.ceil(d.width/step),mh=Math.ceil(d.height/step),mask=makeCanvas(mw,mh),ctx=surface.getContext('2d'),m=mask.getContext('2d');
    drawSource(ctx,image,d);if(enhanced&&!d.satelliteOnly)d.features.forEach(f=>fillFeature(ctx,f));
    const pixels=m.getImageData(0,0,mw,mh);
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=(y*mw+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=Math.round(focusOpacity([x/(mw-1)*d.width,y/(mh-1)*d.height],d)*255);}
    m.putImageData(pixels,0,0);ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.drawImage(mask,0,0,d.width,d.height);ctx.globalCompositeOperation='source-over';return surface;
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function tag(ctx,p,text,accent,w,h){ctx.font='500 12px sans-serif';const tw=ctx.measureText(text).width+22;let x=p[0]+13,y=p[1]-30;x=Math.min(w-tw-8,Math.max(8,x));y=Math.max(8,Math.min(h-36,y));roundRect(ctx,x,y,tw,29,9);ctx.fillStyle='rgba(243,251,248,.91)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.76)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#274d40';ctx.fillText(text,x+11,y+19);}
  function draw(ctx,image,w,h,s,d){
    ctx.clearRect(0,0,w,h);if(!s.transparentBackground){ctx.fillStyle='#e7f0ec';ctx.fillRect(0,0,w,h);}if(!image&&!s.focusEnhanced&&!s.focusSatellite)return;const c=s.camera;
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);ctx.rotate(c.angle||0);ctx.translate(-d.width/2,-d.height/2);
    const cutout=s.layer==='enhanced'?s.focusEnhanced:s.focusSatellite;
    if(cutout)ctx.drawImage(cutout,0,0,d.width,d.height);
    else {if(image)drawSource(ctx,image,d);if(s.layer==='enhanced'&&!d.satelliteOnly)d.features.forEach(f=>fillFeature(ctx,f));}
    ctx.restore();
    // Fade the photo itself over the app backdrop; never paint an opaque edge on it.
    ctx.save();if(s.transparentBackground)ctx.globalCompositeOperation='destination-out';
    const topFade=ctx.createLinearGradient(0,0,0,36);topFade.addColorStop(0,s.transparentBackground?'rgba(0,0,0,1)':'#e7f0ec');topFade.addColorStop(1,'rgba(231,240,236,0)');ctx.fillStyle=topFade;ctx.fillRect(0,0,w,36);
    const bottomFade=ctx.createLinearGradient(0,h-24,0,h);bottomFade.addColorStop(0,'rgba(231,240,236,0)');bottomFade.addColorStop(1,s.transparentBackground?'rgba(0,0,0,1)':'#e7f0ec');ctx.fillStyle=bottomFade;ctx.fillRect(0,h-24,w,24);
    ctx.restore();
    if(s.clean)return;
    const a=screen(s.origin,c,d),b=screen(s.target,c,d),g=screen(d.greenCenter,c,d),m=measure(s,d),unit=s.unit==='yd'?'码':'米';
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...g);ctx.lineWidth=1.5;ctx.strokeStyle='rgba(242,253,248,.86)';ctx.setLineDash([4,5]);ctx.stroke();ctx.setLineDash([]);
    [[a,'#f3fcf7','#3d7158'],[b,'#f3fcf7','#3d7158'],[g,'#f3fcf7','#3d7158']].forEach(([p,color,fill],i)=>{ctx.beginPath();ctx.arc(...p,i===1?9:7,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();});
    ctx.beginPath();ctx.moveTo(b[0]-15,b[1]);ctx.lineTo(b[0]+15,b[1]);ctx.moveTo(b[0],b[1]-15);ctx.lineTo(b[0],b[1]+15);ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();
    const first=[(a[0]+b[0])/2,(a[1]+b[1])/2+(d.par===3?0:20)],second=[(b[0]+g[0])/2,(b[1]+g[1])/2];
    if(Math.abs(first[1]-second[1])<38)first[1]=second[1]+42;
    tag(ctx,first,'到落点 '+value(m.first,s.unit)+' '+unit,null,w,h);
    tag(ctx,second,'到中心 '+value(m.second,s.unit)+' '+unit,null,w,h);
    tag(ctx,a,'起点',null,w,h);

  }
  const api={toGeo,toPixel,meters,distance,inside,greenEdges,measure,value,inBounds,fit,focusFit,zoomCamera,focusSurface,focusOpacity,screen,world,draw};if(typeof module!=='undefined')module.exports=api;else root.HoleMapCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
