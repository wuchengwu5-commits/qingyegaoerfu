const fs=require('fs'),path=require('path');
const project=path.resolve(__dirname,'..'),packages=path.join(project,'qingye-miniprogram/miniprogram/packages'),out=[];
for(const name of fs.readdirSync(packages)){
 const p=path.join(packages,name);if(!fs.existsSync(path.join(p,'course-config.js')))continue;
 const c=require(path.join(p,'course-config.js'));out.push({package:name,courseId:c.courseId,name:c.shortName,mapNote:c.mapNote,overviewNote:c.overviewNote,attribution:c.attribution,holes:c.holes,overview:c.overview});
}
fs.mkdirSync(path.join(__dirname,'import-data'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'import-data/project-maps.json'),JSON.stringify(out,null,2));
console.log('Extracted existing map packages:',out.length);
