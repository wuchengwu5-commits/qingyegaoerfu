// Exercise retained single-hole compatibility separately from the production atlas routing.
const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
exports.load=file=>{
 const requireFrom=createRequire(file),config=requireFrom('./course-config'),routes=requireFrom('../../services/course-map-route');
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:global.Page,wx:global.wx,console,setTimeout,clearTimeout,require(id){
  if(id==='./course-config')return {...config,atlasRoute:undefined,overviewOnly:false};
  if(id==='../../services/course-map-route')return {...routes,route:cid=>cid===config.courseId?config.route:routes.route(cid)};
  return requireFrom(id);
 }},{filename:file});
};
