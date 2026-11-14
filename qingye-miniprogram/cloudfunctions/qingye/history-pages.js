// Cursor is an immutable ID, not an offset: new rounds cannot shift later pages.
function page(ids, input={}, defaultSize=20) {
  const all=Array.from(new Set(ids||[])).reverse();
  const limit=input.paged?defaultSize:50;
  const size=Math.max(1,Math.min(limit,Number(input.pageSize)||limit));
  const start=input.cursor?all.indexOf(input.cursor)+1:0;
  if(input.cursor&&!start)throw Object.assign(Error('历史记录已变化，请重新刷新'),{code:'INVALID_CURSOR'});
  const selected=all.slice(start,start+size);
  return {ids:selected,nextCursor:start+size<all.length?selected.at(-1):null};
}
function result(items, selection, input) {return input.paged?{items,nextCursor:selection.nextCursor}:items;}
module.exports={page,result};
