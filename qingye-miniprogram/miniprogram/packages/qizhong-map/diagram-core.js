// Unreferenced course diagrams use image pixels only, never geographic distance.
function fit(w,h,d){const top=116,bottom=112,space=Math.max(80,h-top-bottom);return {scale:Math.min((w-38)/d.width,space/d.height),x:w/2,y:top+space/2,angle:0};}
function draw(ctx,image,w,h,c,d){ctx.clearRect(0,0,w,h);if(!image?.width||!c||!d)return;ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);ctx.drawImage(image,-d.width/2,-d.height/2,d.width,d.height);ctx.restore();}
module.exports={fit,draw};
