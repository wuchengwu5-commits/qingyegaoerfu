const palette={black:'#303832',blue:'#4086c6',white:'#ffffff',red:'#d65a55',gold:'#cba34e',yellow:'#e5c345',silver:'#b7c1c5',green:'#558764',orange:'#db8b43',purple:'#9872b0',pink:'#e69db2'};
const aliases={'黑':'black','蓝':'blue','白':'white','红':'red','金':'gold','黄':'yellow','银':'silver','绿':'green','橙':'orange','紫':'purple','粉':'pink'};
function swatch(name){const key=String(name||'').trim().toLowerCase().replace(/\s*(tee|发球台|色|梯)$/i,'').trim();return palette[aliases[key]||key]||'#aab1a7';}
module.exports={swatch};
