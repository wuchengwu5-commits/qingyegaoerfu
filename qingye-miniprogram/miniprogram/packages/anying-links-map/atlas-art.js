// Display-only registration. GPS geometry is never derived from artwork pixels.
function local(point, spec) {
  const dx=point[0]-spec.tee[0],dy=point[1]-spec.tee[1];
  const vx=spec.green[0]-spec.tee[0],vy=spec.green[1]-spec.tee[1];
  const angle=Math.atan2(vx,-vy),scale=640/Math.hypot(vx,vy);
  return [(dx*Math.cos(angle)+dy*Math.sin(angle))*scale,(-dx*Math.sin(angle)+dy*Math.cos(angle))*scale];
}
function draw(ctx,image,spec,tee,green) {
  if(!image||!spec)return;
  const dx=green[0]-tee[0],dy=green[1]-tee[1];
  const vx=spec.green[0]-spec.tee[0],vy=spec.green[1]-spec.tee[1];
  const scale=Math.hypot(dx,dy)/Math.hypot(vx,vy);
  ctx.save();ctx.translate(tee[0],tee[1]);
  ctx.rotate(Math.atan2(dx,-dy)-Math.atan2(vx,-vy));
  ctx.scale(scale,scale);ctx.translate(-spec.tee[0],-spec.tee[1]);
  ctx.drawImage(image,0,0,spec.width,spec.height);ctx.restore();
}
module.exports={local,draw};
