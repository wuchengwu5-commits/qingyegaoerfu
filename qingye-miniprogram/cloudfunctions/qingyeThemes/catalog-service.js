const seeds=require('./catalog.json');
function createService(repo,upload){
 const docId=id=>'v1_'+id;
 const publicItem=x=>{const {asset,...data}=x;delete data._id;return data;};
 return {
  async list(){const records=await Promise.all(seeds.map(x=>repo.get(docId(x.id))));return {version:1,items:records.filter(Boolean).filter(x=>x.version===1&&x.enabled===true).map(publicItem).sort((a,b)=>a.sort-b.sort)};},
  async seedAsset(id){
   const seed=seeds.find(x=>x.id===id);if(!seed)throw Error('未知背景');
   await repo.ensure();const existing=await repo.get(docId(id));
   // Only immutable bundled files can be installed; callers cannot supply files, paths or database content.
   if(existing?.sha256===seed.sha256&&existing.fileID)return publicItem(existing);
   const fileID=await upload(seed);if(!fileID||!fileID.startsWith('cloud://'))throw Error('云资源上传失败');
   const record={...seed,fileID};delete record.asset;
   await repo.set(docId(id),record);return publicItem(record);
  }
 };
}
module.exports={createService};
