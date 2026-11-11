// Original Qingye weather glyphs, rendered from vectors for native Mini Program images.
// Run with Node and sharp available on NODE_PATH.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const target=path.resolve(__dirname,'../miniprogram/assets/weather');
const cloud='<path d="M6.4 18.5C3.8 18.5 2 16.8 2 14.5c0-2.2 1.7-4 4.1-4.1C6.8 7.5 9.2 5.6 12.2 5.6c3.3 0 5.9 2.3 6.4 5.5 2 .3 3.4 1.8 3.4 3.7 0 2.1-1.8 3.7-4 3.7Z"/>';
const highCloud='<path d="M6.2 14.5C3.8 14.5 2.2 13 2.2 11c0-2 1.6-3.6 3.7-3.7C6.5 4.9 8.7 3.4 11.3 3.4c3 0 5.3 2 5.8 4.7 2.4-.1 4.5 1.3 4.5 3.3 0 1.8-1.4 3.1-3.6 3.1Z"/>';
const icons={
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20.1 14.1A8.7 8.7 0 0 1 9.9 3.9 8.4 8.4 0 1 0 20.1 14.1Z"/>',
 cloud,
 'cloud-sun':'<path d="M4.5 9a3.7 3.7 0 0 1 6.7-3M7 1.8v1.4M1.8 7H.5M2.6 2.6l1 1m8.8-1-1 1"/><path d="M7.1 19.4c-2.4 0-4-1.5-4-3.5s1.6-3.6 3.7-3.7c.5-2.7 2.8-4.4 5.5-4.4 3.1 0 5.4 2.1 5.8 4.9 2.2.1 3.7 1.5 3.7 3.4s-1.6 3.3-3.7 3.3Z"/>',
 'cloud-rain':highCloud+'<path d="m7 18-1 3m7-3-1 3m7-3-1 3"/>',
 'cloud-snow':highCloud+'<path d="M7 18v4m-1.7-3 3.4 2m0-2-3.4 2M17 18v4m-1.7-3 3.4 2m0-2-3.4 2"/>',
 'cloud-lightning':highCloud+'<path d="m12.7 16-3.3 4h4l-1.1 2.5"/>',
 'cloud-fog':highCloud+'<path d="M4 18h16M7 21h10"/>',
 wind:'<path d="M3 8h12.5a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2 2 0 1 0-2-2M3 16h9a2.5 2.5 0 1 1-2.5 2.5"/>',
 question:'<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .3c0 1.8-2.5 2.1-2.5 4.2M12 17h.01"/>'
};
(async()=>{
 fs.mkdirSync(target,{recursive:true});
 let bytes=0;
 for(const [name,body] of Object.entries(icons)){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="#315d4b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
  const file=path.join(target,name+'.png');
  await sharp(Buffer.from(svg)).png({palette:true,colours:32,compressionLevel:9}).toFile(file);
  bytes+=fs.statSync(file).size;
 }
 console.log(JSON.stringify({icons:Object.keys(icons).length,pngBytes:bytes}));
})().catch(e=>{console.error(e);process.exitCode=1;});
