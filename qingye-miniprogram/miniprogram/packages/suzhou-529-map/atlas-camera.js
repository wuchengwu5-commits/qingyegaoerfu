const Geo=require('./map-core');
const Config=require('./atlas-config');
const atlas=Config.atlas;
const Boundary=require('./atlas-boundary');
const Hud=require('./atlas-hud');
function around(center,anchor,scale,angle){
 const c={x:0,y:0,scale,angle};const q=Geo.screen(center,c,atlas);c.x=anchor[0]-q[0];c.y=anchor[1]-q[1];return c;
}
function fit(width,height,holes,hole,origin,target,overview,safe=0,artFrame,hasReference=false){
 const angle=overview?0:Math.atan2(hole.tee[0]-hole.green[0],hole.tee[1]-hole.green[1]);
 const projection={scale:1,x:0,y:0,angle};
 const points=overview?(holes.length?holes.flatMap(h=>[...h.route,...h.outline]):Boundary.outer):[...hole.route,...hole.outline,origin,target];
 if(overview&&Config.fitOverviewToBoundary&&holes.length)points.push(...Boundary.outer);
 const rotated=points.map(p=>Geo.screen(p,projection,atlas));
 const xs=rotated.map(p=>p[0]),ys=rotated.map(p=>p[1]);
 const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const left=overview?22:(Config.focusContentLeft||Math.min(104,width*.27)),right=width-(overview?22:(Config.focusContentRight||34));
 const top=overview?82:92,bottom=height-safe-(overview?82:99);
 // A short par 3 can fit at more than 2 screen pixels per satellite pixel.
 // Limit its opening view while leaving pinch and button zoom independent.
 const maxScale=!overview&&hole.par===3?Config.par3MaxScale:3.2;
 let scale=Math.min((right-left)/Math.max(1,xmax-xmin),(bottom-top)/Math.max(1,ymax-ymin),maxScale);
 let xlo=xmin,xhi=xmax,ylo=ymin,yhi=ymax;
 if(!overview&&artFrame){
   const [tx,ty]=Geo.screen(hole.tee,projection,atlas);
   const k=Math.hypot(hole.tee[0]-hole.green[0],hole.tee[1]-hole.green[1])/640;
   const [l,t,w,h]=artFrame;
   xlo=Math.min(xmin,tx+l*k);xhi=Math.max(xmax,tx+(l+w)*k);
   ylo=Math.min(ymin,ty+t*k);yhi=Math.max(ymax,ty+(t+h)*k);
   scale=Math.min(scale,(width-16)/(xhi-xlo),(height-safe-72)/(yhi-ylo));
 }
 const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
 const centeredY=()=>clamp((top+bottom)/2-(ymin+ymax)*.5*scale,42-ylo*scale,height-safe-30-yhi*scale);
 if(overview){
   const x=clamp((left+right)/2-(xmin+xmax)*.5*scale,8-xlo*scale,width-8-xhi*scale);
   return {angle,scale,x,y:centeredY()};
 }

 const [teeX]=Geo.screen(hole.tee,projection,atlas);
 const [originX,originY]=Geo.screen(origin,projection,atlas);
 const [,greenY]=Geo.screen(hole.green,projection,atlas);
 const dock=Hud.items(width,height,'focus',safe,!!artFrame,hasReference)
   .filter(control=>['prev','next','gps','art','reference'].includes(control.key));
 const dockTop=Math.min(...dock.map(control=>control.y));
 const dockRight=Math.max(...dock.map(control=>control.x+control.w));
 const preferredX=()=>clamp(
   width*(Config.focusAnchorRatio||.57)-teeX*scale,
   Math.max(8-xlo*scale,Config.focusContentLeft?left-xmin*scale:-Infinity),
   (Config.focusContentRight?right:width-8)-xhi*scale
 );
 let x=preferredX(),y=centeredY();
 const markerGap=14;
 if(originY*scale+y+markerGap>dockTop&&originX*scale+x-markerGap<dockRight){
   x=Math.min(Math.max(x,dockRight+markerGap-originX*scale),width-8-xhi*scale);
   if(originX*scale+x-markerGap<dockRight-.01){
     // If the dogleg fills the right edge, lift the start above the dock.
     const originBottom=dockTop-markerGap;
     scale=Math.min(scale,
       (originBottom-42)/Math.max(1,originY-ylo),
       (originBottom-86)/Math.max(1,originY-greenY));
     x=preferredX();
     y=Math.min(centeredY(),originBottom-originY*scale);
   }
 }
 return {angle,scale,x,y};
}
function blend(a,b,f,width,height){
 if(f>=1)return b;
 const anchor=[width/2,height/2],p=Geo.world(anchor,a,atlas),q=Geo.world(anchor,b,atlas);
 const turn=Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle));
 return around(p.map((v,i)=>v+(q[i]-v)*f),anchor,a.scale*Math.pow(b.scale/a.scale,f),a.angle+turn*f);
}
module.exports={fit,blend,around};
