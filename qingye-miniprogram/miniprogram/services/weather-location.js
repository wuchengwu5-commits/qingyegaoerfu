// Weather uses a ~1 km WGS84 grid; precise device coordinates never leave this module.
function point(fix){
 if(!fix||typeof fix.latitude!=='number'||typeof fix.longitude!=='number'||!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||Math.abs(fix.latitude)>90||Math.abs(fix.longitude)>180||(fix.latitude===0&&fix.longitude===0))return null;
 let lat=fix.latitude,lon=fix.longitude;
 if(fix.system==='gcj02'&&lon>=72.004&&lon<=137.8347&&lat>=0.8293&&lat<=55.8271){
  const x=lon-105,y=lat-35,pi=Math.PI;
  let dlat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  dlat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  dlat+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;
  dlat+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
  let dlon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  dlon+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  dlon+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;
  dlon+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
  const rad=lat/180*pi,magic=1-.00669342162296594323*Math.sin(rad)**2,sqrt=Math.sqrt(magic);
  lat-=dlat*180/((6378245*(1-.00669342162296594323))/(magic*sqrt)*pi);
  lon-=dlon*180/(6378245/sqrt*Math.cos(rad)*pi);
 }
 const latitude=Number(lat.toFixed(2)),longitude=Number(lon.toFixed(2));
 return {latitude,longitude,key:latitude.toFixed(2)+','+longitude.toFixed(2)};
}
function forCourse(course){return {status:course?'ready':'idle',fix:course?{latitude:course.latitude,longitude:course.longitude,system:course.coordinateSystem,city:course.city||course.province||''}:null};}
module.exports={point,forCourse};
