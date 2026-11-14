const C=require('./catalog'),L=require('./location');

// Keep the nearby pair first; favorites add distinct, directly scoreable options.
function build(courses,favorites=[],fix=null){
 const eligible=courses.filter(c=>c.tees?.length&&C.canScore(c));
 const saved=new Set(favorites);
 const ranked=fix?L.sort(eligible,fix):eligible;
 const nearby=fix?ranked.filter(c=>c.distanceKm!==null).slice(0,2):[];
 const shown=new Set(nearby.map(c=>c.id));
 const allFavorites=ranked.filter(c=>saved.has(c.id));
 const favorite=allFavorites.filter(c=>!shown.has(c.id)).slice(0,2);
 const card=c=>({id:c.id,name:c.name,city:c.city||c.province||'',holes:c.holes,distanceText:fix?c.distanceText:'',favorite:saved.has(c.id)});
 return {nearbyCourses:nearby.map(card),favoriteCourses:favorite.map(card),favoriteCourseCount:allFavorites.length};
}
module.exports={build};
