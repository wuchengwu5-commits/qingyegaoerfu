// Called only after readBoard has authorized the viewer and loaded group profiles.
// Keep file IDs in stored users/rounds; temporary URLs belong only to this response.
function createAvatarPresenter({avatarRoot,getTempFileURL,now=()=>Date.now()}) {
  const cache=new Map(),maxAge=3600,cacheAge=45*60*1000;
  function allowed(profile) {
    if(!avatarRoot||typeof profile?.uid!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(profile.uid))return false;
    const prefix=avatarRoot+profile.uid+'/',url=profile.avatarUrl;
    return typeof url==='string'&&url.startsWith(prefix)&&/^avatar-[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/.test(url.slice(prefix.length));
  }
  return async function present(board) {
    if(!Array.isArray(board?.profiles))return board;
    const ids=[...new Set(board.profiles.filter(allowed).map(p=>p.avatarUrl))],links=new Map(),missing=[];
    for(const [id,item] of cache)if(item.expiresAt<=now())cache.delete(id);
    for(const id of ids){const item=cache.get(id);if(item)links.set(id,item.url);else missing.push(id);}
    for(let i=0;i<missing.length;i+=50){
      const batch=missing.slice(i,i+50),requested=new Set(batch),started=now();
      try{
        const result=await getTempFileURL({fileList:batch.map(fileID=>({fileID,maxAge}))});
        for(const item of result?.fileList||[]){
          if(!requested.has(item.fileID)||item.status!==0||!/^https:\/\//.test(item.tempFileURL||''))continue;
          links.set(item.fileID,item.tempFileURL);
          cache.set(item.fileID,{url:item.tempFileURL,expiresAt:started+cacheAge});
        }
      }catch(_){/* An avatar failure must not interrupt scoring; retry next profile refresh. */}
    }
    while(cache.size>256)cache.delete(cache.keys().next().value);
    return {...board,profiles:board.profiles.map(p=>allowed(p)&&links.has(p.avatarUrl)?{...p,avatarUrl:links.get(p.avatarUrl)}:p)};
  };
}
module.exports={createAvatarPresenter};
