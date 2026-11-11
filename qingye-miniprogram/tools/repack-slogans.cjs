// Lossless tuple encoding keeps repeated field names out of the main package.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../miniprogram/services/slogans-data.js'),data=require(file);
const rows=data.entries.map(({id,theme,title,subtitle,enabled})=>[id,theme,title,subtitle,enabled]);
const next='// Generated from content/slogans.csv; repack with tools/repack-slogans.cjs.\nmodule.exports={schemaVersion:'+JSON.stringify(data.schemaVersion)+',themes:'+JSON.stringify(data.themes)+',entries:'+JSON.stringify(rows)+'.map(([id,theme,title,subtitle,enabled])=>({id,theme,title,subtitle,enabled}))};\n';
fs.writeFileSync(file,next);
delete require.cache[file];require('node:assert/strict').deepEqual(require(file),data);
console.log('Slogan data preserved exactly.');
