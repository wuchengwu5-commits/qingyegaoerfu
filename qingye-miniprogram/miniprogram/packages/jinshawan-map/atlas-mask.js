// Adapted from the Tianma display mask validated on 2026-11-05.
// Supply the target course perimeter and exclusions in atlas pixel coordinates.
// Display boundaries are independent of GPS measurement geometry.
const atlas = require('./atlas-config').atlas;
const boundary = require('./atlas-boundary');
const outer = boundary.outer;
const exclusions = boundary.exclusions || [];
// Boundary coordinates use the full atlas pixel grid.
const scale = 1;
const smoothing = atlas.width / 1200;

function prepareRing(vertices, cutout) {
  // Round changes of direction without noticeably moving narrow shorelines.
  const rounded = [];
  vertices.forEach((b, i) => {
    const a = vertices[(i + vertices.length - 1) % vertices.length];
    const c = vertices[(i + 1) % vertices.length];
    const approach = p => {
      const f = Math.min(.23, 4 * smoothing / Math.hypot(p[0]-b[0], p[1]-b[1]));
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

const rings=[prepareRing(outer,true),...exclusions.map(ring=>prepareRing(ring,false))];
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
