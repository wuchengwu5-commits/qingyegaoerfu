const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const packageDir = path.join(root, 'qingye-miniprogram/miniprogram/packages/sheshan-map');
const source = require('../../qingye-miniprogram/data/maps/sheshan-endpoint-corrections.json');
const current = require(path.join(packageDir, 'atlas-catalog.js'));
const geometryKeys = ['tee', 'teeOutline', 'target', 'green', 'greenOutline', 'route'];

if (current.length !== 18 || current.some(hole => hole.courseId !== source.courseId)) {
  throw new Error('佘山现有球洞目录不匹配');
}
const updated = current.map(hole => {
  const change = source.corrections[hole._id];
  if (!change) return {...hole, revision: source.revision};
  const geometry = Object.fromEntries(geometryKeys.filter(key => key in change).map(key => [key, change[key]]));
  return {...hole, ...geometry, revision: source.revision, endpointReviewNote: change.note};
});
const data = require(path.join(packageDir, 'atlas-data.js'));
data.parse(updated);
fs.writeFileSync(path.join(packageDir, 'atlas-catalog.js'), 'module.exports='+JSON.stringify(updated)+';\n');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(updated, null, 2)+'\n');
