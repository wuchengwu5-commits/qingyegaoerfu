// Run after any map update and before uploading a new miniapp package.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,['--test','tests/map-defaults.test.cjs','tests/art-loading.test.cjs','tests/art-overlay.test.cjs','tests/sheshan-art-overlay.test.cjs','tests/club-map-integration.test.cjs','tests/reference-map.test.cjs'],{cwd:root,stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
