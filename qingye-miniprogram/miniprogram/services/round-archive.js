// Keep a reversible audit delta for every edit, and the latest full undo state.
// Older operations cannot be undone by the scoring engine; repeated scorecard
// snapshots otherwise grow quadratically and exhaust phone storage.
function changes(before,after,path=[],out=[]){
  if(JSON.stringify(before)===JSON.stringify(after))return out;
  if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
    for(const key of new Set([...Object.keys(before),...Object.keys(after)]))changes(before[key],after[key],[...path,key],out);
  }else out.push({path,before:before===undefined?null:before,after:after===undefined?null:after,removed:after===undefined,added:before===undefined});
  return out;
}
function compact(round){
  if(!Array.isArray(round.changeLog))return round;
  return {...round,changeLog:round.changeLog.map((log,index)=>{
    const {before,after,...meta}=log;
    return {...meta,...(before&&after?{changes:changes(before,after)}:{}),...(index===round.changeLog.length-1&&before?{before}:{})};
  })};
}
module.exports={compact,changes};
