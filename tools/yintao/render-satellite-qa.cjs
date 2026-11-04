const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require('/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const root=path.resolve(__dirname,'../..'),base=root+'/qingye-miniprogram/miniprogram/packages/hole-map',M=require(base+'/map-core'),all=Object.values(require(base+'/satellite-holes').holes);
(async()=>{
 const photo=await loadImage(base+'/course-overview.jpg'),w=390,h=758,columns=6,rows=3;
 const board=createCanvas(w*columns,h*rows),ctx=board.getContext('2d');ctx.fillStyle='#e9eee8';ctx.fillRect(0,0,board.width,board.height);
 for(let i=0;i<all.length;i++){
  const d=all[i],c=createCanvas(w,h),q=c.getContext('2d'),s={origin:d.defaultOrigin,target:d.defaultTarget,layer:'satellite',unit:'yd',camera:M.focusFit(w,h,d),focusSatellite:M.focusSurface(photo,d,createCanvas,false)};
  M.draw(q,photo,w,h,s,d);q.fillStyle='#35482e';q.font='bold 22px sans-serif';q.fillText('Hole '+d.number,18,42);q.font='15px sans-serif';q.fillText('Par '+d.par,18,69);q.fillText(M.value(M.measure(s,d).center,'yd')+' yd',18,220);q.font='12px sans-serif';q.fillText('Satellite',18,95);
  fs.writeFileSync(root+'/outputs/yintao-hole1/qa/v7-hole-'+d.number+'.png',c.toBuffer('image/png'));ctx.drawImage(c,(i%columns)*w,Math.floor(i/columns)*h);
 }
 fs.writeFileSync(root+'/outputs/yintao-hole1/qa/v7-satellite-17-contact.jpg',board.toBuffer('image/jpeg',90));
})();
