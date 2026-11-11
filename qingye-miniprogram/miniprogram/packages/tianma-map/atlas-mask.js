// Cartographic display edge, independent of all GPS measurements.
// Outer perimeter guided by © OpenStreetMap contributors, way 405689970,
// and refined on the registered Tianma satellite atlas. The inner ring follows
// the residential strip between the northern fairways and the central lake.
// Coordinates are a north-up tracing at 1,200 px wide on this atlas.
const atlas = require('./overview-data');
const scale = atlas.width / 1200;
const outer = [
  [77,308],[99,287],[129,278],[155,279],[172,294],[179,312],
  [190,336],[195,357],[210,374],[221,396],[244,412],[262,420],
  [279,444],[292,465],[311,488],[322,487],[335,474],[347,444],
  [371,420],[400,398],[427,379],[458,356],[488,337],[518,326],
  [550,319],[577,306],[600,297],[629,276],[663,265],[693,263],
  [714,266],[717,240],[714,215],[716,189],[725,162],[738,148],
  [751,145],[770,151],[790,162],[812,176],[832,179],[862,173],
  [893,163],[923,153],[964,151],[997,144],[1024,141],[1054,136],
  [1083,134],[1106,128],[1118,134],[1130,185],[1136,230],
  [1142,279],[1148,313],[1151,343],[1145,358],[1112,380],
  [1071,397],[1028,414],[985,432],[950,445],[911,460],[896,471],
  [891,483],[889,514],[883,536],[859,555],[825,581],[811,588],
  [795,587],[774,582],[755,586],[742,601],[728,619],[702,649],
  [688,664],[675,674],[648,680],[615,690],[591,699],[567,714],
  [549,719],[529,723],[508,720],[494,717],[487,724],[495,744],
  [517,785],[542,832],[564,872],[588,877],[618,906],[652,941],
  [682,973],[679,988],[693,999],[676,1015],[645,1031],[610,1057],
  [560,1095],[512,1131],[465,1163],[449,1172],[438,1152],
  [414,1080],[390,1004],[357,912],[338,859],[317,827],[300,816],
  [282,797],[267,763],[240,710],[211,651],[177,576],[148,525],
  [124,481],[95,430],[69,385],[55,350],[53,329]
];
const residential = [
  [694,292],[716,285],[747,283],[777,277],[809,269],[839,263],
  [874,264],[909,266],[943,263],[976,255],[1007,251],[1031,249],
  [1046,252],[1046,274],[1037,295],[1024,310],[997,320],
  [972,328],[948,329],[924,325],[896,320],[865,318],[839,320],
  [812,328],[782,339],[751,355],[737,363],[726,361],[715,350],
  [707,333],[698,314]
];

function prepareRing(vertices, cutout) {
  // Round changes of direction without noticeably moving narrow shorelines.
  const rounded = [];
  vertices.forEach((b, i) => {
    const a = vertices[(i + vertices.length - 1) % vertices.length];
    const c = vertices[(i + 1) % vertices.length];
    const approach = p => {
      const f = Math.min(.23, 4 / Math.hypot(p[0]-b[0], p[1]-b[1]));
      return [b[0]+f*(p[0]-b[0]), b[1]+f*(p[1]-b[1])];
    };
    const p = approach(a), q = approach(c);
    rounded.push(p, [(p[0]+2*b[0]+q[0])/4,(p[1]+2*b[1]+q[1])/4], q);
  });
  const area = rounded.reduce((sum,p,i) => {
    const q = rounded[(i+1)%rounded.length];
    return sum+p[0]*q[1]-q[0]*p[1];
  },0);
  // The viewport is clockwise. The fairways subtract, the residential island adds.
  if ((area < 0) !== cutout) rounded.reverse();
  const normal = (p,q) => {
    const dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);
    return [-dy/len,dx/len];
  };
  return rounded.map((p,i) => {
    const prev=rounded[(i+rounded.length-1)%rounded.length],next=rounded[(i+1)%rounded.length];
    const u=normal(prev,p),v=normal(p,next);
    const denominator=Math.max(.65,1+u[0]*v[0]+u[1]*v[1]);
    return [p[0]*scale,p[1]*scale,(u[0]+v[0])/denominator,(u[1]+v[1])/denominator];
  });
}

const rings=[prepareRing(outer,true),prepareRing(residential,false)];
const ys=outer.map(p=>p[1]*scale);
const courseHeight=Math.max(...ys)-Math.min(...ys);
const centerY=Math.min(...ys)+courseHeight/2;

function overviewTint(ctx, viewportHeight) {
  // Anchor north and south shading to the course, including when the map is panned.
  const radius=Math.max(courseHeight*.62,viewportHeight*.48);
  const gradient=ctx.createLinearGradient(0,centerY-radius,0,centerY+radius);
  const edge='rgba(23,46,43,.22)', shoulder='rgba(45,68,62,.16)';
  gradient.addColorStop(0,edge);
  gradient.addColorStop(.24,shoulder);
  gradient.addColorStop(.50,'rgba(75,95,88,.13)');
  gradient.addColorStop(.76,shoulder);
  gradient.addColorStop(1,edge);
  return gradient;
}

function draw(ctx, viewport, zoom, overview, tintHeight) {
  const [left,top,right,bottom]=viewport;
  const feather=Math.min(15,4.5/zoom);
  ctx.save();
  // Low-opacity passes soften the perimeter while retaining exterior texture.
  ctx.fillStyle=overview?overviewTint(ctx,tintHeight||bottom-top):'rgba(69,89,79,.105)';
  for(let band=0;band<6;band++){
    const offset=feather*band/5;
    ctx.beginPath();ctx.rect(left-1,top-1,right-left+2,bottom-top+2);
    for(const ring of rings){
      const [x,y,nx,ny]=ring[0];ctx.moveTo(x+nx*offset,y+ny*offset);
      for(let i=1;i<ring.length;i++){
        const [px,py,dx,dy]=ring[i];ctx.lineTo(px+dx*offset,py+dy*offset);
      }
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}
module.exports={draw};
