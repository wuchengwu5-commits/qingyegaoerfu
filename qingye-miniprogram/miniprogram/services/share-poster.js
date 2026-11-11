const WIDTH=900,HEIGHT=1440;
function draw(ctx,img,round,mine,theme,showScore,mirrored=false){
 // One continuous photograph and one continuous shade, including the footer.
 const scale=Math.max(WIDTH/img.width,HEIGHT/img.height),w=img.width*scale,h=img.height*scale;
 ctx.clearRect(0,0,WIDTH,HEIGHT);
 if(mirrored){ctx.save();ctx.translate(WIDTH,0);ctx.scale(-1,1);}
 ctx.drawImage(img,(WIDTH-w)/2,(HEIGHT-h)/2,w,h);
 if(mirrored)ctx.restore();
 const shade=ctx.createLinearGradient(0,0,0,HEIGHT);
 [[0,.22],[.2,.02],[.44,.04],[.72,.52],[1,.88]].forEach(([stop,alpha])=>shade.addColorStop(stop,'rgba(12,37,23,'+alpha+')'));
 ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.fillStyle='#f4f6e9';ctx.font='26px sans-serif';ctx.fillText('青 野  ·  QINGYE GOLF',60,86);
 ctx.font='58px serif';theme.title.forEach((s,i)=>ctx.fillText(s,60,820+i*85));
 ctx.font='26px sans-serif';ctx.fillText(theme.line,62,1040);
 ctx.fillStyle='#f4f6e9';ctx.font='30px sans-serif';
 ctx.fillText(round.courseName.length>23?round.courseName.slice(0,22)+'…':round.courseName,60,1210);
 ctx.fillStyle='#e2eadb';ctx.font='26px sans-serif';ctx.fillText(round.date+' · '+round.holes.length+' 洞的球场时光',60,1260);
 if(showScore)ctx.fillText('我的实际 '+mine.totalText+' 杆 · '+mine.diffText+' · 已完 '+mine.played+'/'+round.holes.length+' 洞',60,1310);
 ctx.font='22px sans-serif';ctx.fillStyle='#d0ddc9';ctx.fillText('青野 · 安静记分，自在挥杆。',60,1390);ctx.fillText('AI 意境',744,1390);
}
module.exports={WIDTH,HEIGHT,draw};
