// Keep every screen corner inside real geographic imagery, including during
// rotation, animation, resizing and zoom-out. Never stretch the raster to fit.
function constrain(camera,width,height,atlas,bounds,minScale=0){
 const [left,top,right,bottom]=bounds;
 const cos=Math.cos(camera.angle),sin=Math.sin(camera.angle);
 const spanX=Math.abs(cos)*width+Math.abs(sin)*height;
 const spanY=Math.abs(sin)*width+Math.abs(cos)*height;
 const scale=Math.max(camera.scale,minScale,(spanX+4)/(right-left),(spanY+4)/(bottom-top));
 const dx=(width/2-camera.x)/camera.scale,dy=(height/2-camera.y)/camera.scale;
 const center=[atlas.width/2+dx*cos+dy*sin,atlas.height/2-dx*sin+dy*cos];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),pad=1/scale;
 center[0]=clamp(center[0],left+spanX/scale/2+pad,right-spanX/scale/2-pad);
 center[1]=clamp(center[1],top+spanY/scale/2+pad,bottom-spanY/scale/2-pad);
 const x=center[0]-atlas.width/2,y=center[1]-atlas.height/2;
 return {angle:camera.angle,scale,x:width/2-(x*cos-y*sin)*scale,y:height/2-(x*sin+y*cos)*scale};
}
module.exports={constrain};
