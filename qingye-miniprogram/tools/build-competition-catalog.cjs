// Generate the server's authoritative competition course and tee snapshots.
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../miniprogram/services/catalog');
const {courses} = require('../miniprogram/services/courses-data');
const root = path.resolve(__dirname, '..');
const scoreable = courses.filter(catalog.canScore).map(course => ({
  id: course.id, name: course.name, city: course.city || '', photo: course.photo || 0,
  tees: course.tees || [],
  teeData: (course.teeData || []).map(({id,name,distances}) => ({id,name,distances})),
  segments: catalog.sections(course).filter(section =>
    section.holes.length === 9 && section.holes.every(hole => [3,4,5,6].includes(hole.par))
  )
}));
const lib = path.join(root,'cloudfunctions/qingye/lib');
fs.writeFileSync(path.join(lib,'competition-courses.json'),JSON.stringify(scoreable)+'\n');
for (const name of ['catalog.js','service.js']) {
  fs.copyFileSync(path.join(root,'miniprogram/services',name),path.join(lib,name));
}
