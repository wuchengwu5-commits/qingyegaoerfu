function randomRanks(courses,random=Math.random){const ids=courses.map(c=>c.id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return new Map(ids.map((id,i)=>[id,i]));}
function withoutLocation(courses,rounds,ranks){
 const recent=new Map();for(const r of [...(rounds||[])].sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)))if(!recent.has(r.courseId))recent.set(r.courseId,recent.size);
 const played=courses.filter(c=>recent.has(c.id)).sort((a,b)=>recent.get(a.id)-recent.get(b.id));
 const rest=courses.filter(c=>!recent.has(c.id)).sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
 return {courses:played.concat(rest),firstCount:played.length?Math.min(10,played.length):Math.min(10,courses.length),mode:played.length?'recent':'random'};
}
module.exports={randomRanks,withoutLocation};
