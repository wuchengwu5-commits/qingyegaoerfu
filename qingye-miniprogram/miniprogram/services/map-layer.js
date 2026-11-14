// Artwork is opt-in. Course assets and prior visits must not change the default.
function artRequested(options={}){
 if(options.layer==='gps'||options.mode==='gps')return false;
 return options.layer==='art'||options.mode==='reference';
}
module.exports={artRequested};
