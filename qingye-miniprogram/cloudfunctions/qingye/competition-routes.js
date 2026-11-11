const Catalog = require('./lib/catalog');
const courses = new Map(require('./lib/competition-courses.json').map(c => [c.id,c]));
const fail = message => {throw Object.assign(Error(message),{code:'INVALID'});};
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function makeRoute(courseId, segmentIds) {
  const course=courses.get(courseId);
  if(!course?.tees?.length)fail('请选择有完整记分资料的球场');
  if(!Array.isArray(segmentIds)||!segmentIds.length||segmentIds.length>2||new Set(segmentIds).size!==segmentIds.length||
    segmentIds.some(id=>!course.segments.some(s=>s.id===id&&s.holes.length===9&&s.holes.every(h=>[3,4,5,6].includes(h.par)))))
    fail('请选择比赛的 9 洞或 18 洞');
  const {holes}=Catalog.selectedHoles(course,segmentIds);
  return {courseId:course.id,courseName:course.name,segmentIds:segmentIds.slice(),tees:course.tees.slice(),
    routeName:segmentIds.map(id=>Catalog.sectionTitle(course.segments.find(s=>s.id===id).name)).join(' → '),
    holes:holes.map(h=>({number:h.number,id:h.id,name:Catalog.courseHoleTitle(h)}))};
}

function routeFor(event,group) {
  if(group?.route)return group.route;
  const segments=courses.get(event.courseId)?.segments||[];
  return {courseId:event.courseId,courseName:event.courseName,segmentIds:event.terms.segmentIds,tees:event.tees,holes:event.holes,
    routeName:event.terms.segmentIds.map(id=>Catalog.sectionTitle(segments.find(s=>s.id===id)?.name||'')).join(' → ')};
}

// Order may differ; players on the same physical holes share a leaderboard.
const routeKey = route => route.courseId+':'+route.holes.map(h=>h.id).sort().join(',');
const slotKey = (route,time,startHole) => route.courseId+':'+route.holes.find(h=>h.number===startHole)?.id+':'+time;
const populated = group => group.roster.some(p=>!p.pending);

function arrangeStarts(event, {startTime='08:00',interval=10}={}) {
  if(!timePattern.test(startTime)||!Number.isInteger(interval)||interval<5||interval>30)fail('请选择有效时间及 5 至 30 分钟的出发间隔');
  const occupied=new Set(),waiting=[];
  // Preserve valid existing arrangements before filling empty/conflicting ones.
  for(const group of event.groups.filter(populated)){
    const route=routeFor(event,group),valid=timePattern.test(group.time)&&route.holes.some(h=>h.number===group.startHole);
    const key=slotKey(route,group.time,group.startHole);
    if(valid&&!occupied.has(key))occupied.add(key);
    else waiting.push(group);
  }
  for(const group of waiting){
    const route=routeFor(event,group);
    const startHole=route.holes.some(h=>h.number===group.startHole)?group.startHole:route.holes[0].number;
    const [hour,minute]=(timePattern.test(group.time)?group.time:startTime).split(':').map(Number);
    let minutes=hour*60+minute,time;
    do{
      if(minutes>=24*60)fail('当天剩余时间不足，请手动安排出发时间');
      time=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
      minutes+=interval;
    }while(occupied.has(slotKey(route,time,startHole)));
    group.time=time;group.startHole=startHole;
    occupied.add(slotKey(route,time,startHole));
  }
}

module.exports={makeRoute,routeFor,routeKey,slotKey,arrangeStarts,timePattern};
