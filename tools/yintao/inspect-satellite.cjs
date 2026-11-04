const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require('/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const root=path.resolve(__dirname,'../..'),base=root+'/qingye-miniprogram/miniprogram/packages/hole-map';
const D=require(base+'/overview-data'),M=require(base+'/map-core'),features=JSON.parse(fs.readFileSync(root+'/outputs/yintao-hole1/research/osm-course-features.geojson')).features;
const center=f=>{const p=f.geometry.coordinates[0].slice(0,-1);return p.reduce((a,b)=>[a[0]+b[0]/p.length,a[1]+b[1]/p.length],[0,0]);};
const holeOf=f=>{const n=Number((f.properties.name||'').match(/\d+/)?.[0]);return n===4?5:n===5?4:n;};
(async()=>{
 const image=await loadImage(base+'/course-overview.jpg'),c=createCanvas(2160,1140),ctx=c.getContext('2d');ctx.scale(2,2);ctx.translate(-810,-610);ctx.drawImage(image,0,0);
 for(const f of features.filter(f=>['green','tee'].includes(f.properties.golf))){const p=f.geometry.coordinates[0].map(g=>M.toPixel(g,D));ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.strokeStyle=f.properties.golf==='green'?'#ffff88':'#9bffff';ctx.lineWidth=1;ctx.stroke();}
 for(let n=1;n<=18;n++){
  const green=features.find(f=>f.properties.golf==='green'&&holeOf(f)===n),g=M.toPixel(center(green),D),tees=features.filter(f=>f.properties.golf==='tee'&&holeOf(f)===n).map(f=>M.toPixel(center(f),D)),tee=tees.sort((a,b)=>Math.hypot(b[0]-g[0],b[1]-g[1])-Math.hypot(a[0]-g[0],a[1]-g[1]))[0];
  ctx.beginPath();ctx.moveTo(...tee);ctx.lineTo(...g);ctx.setLineDash([3,4]);ctx.strokeStyle='#fff9';ctx.stroke();ctx.setLineDash([]);
  for(const [p,label,col] of [[g,String(n),'#fff5ac'],[tee,'T'+n,'#cfffff']]){ctx.font='bold 13px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#142f21';ctx.strokeText(label,p[0]+5,p[1]-5);ctx.fillStyle=col;ctx.fillText(label,p[0]+5,p[1]-5);}
  console.log(n,JSON.stringify({tee:tee.map(Math.round),green:g.map(Math.round)}));
 }
 fs.writeFileSync(root+'/outputs/yintao-hole1/qa/v7-atlas-identification.jpg',c.toBuffer('image/jpeg',92));
})();
