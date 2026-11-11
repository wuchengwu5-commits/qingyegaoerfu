// Send only changed bindings across the mini-program service/render bridge.
function diff(previous, next) {
  const patch = {};
  function visit(before, after, path) {
    if (before === after) return;
    if (after && before && typeof after === 'object' && typeof before === 'object' &&
        Array.isArray(after) === Array.isArray(before)) {
      const keys = Object.keys(after);
      if ((Array.isArray(after) || keys.every(k => /^[A-Za-z_$][\w$]*$/.test(k))) && keys.length === Object.keys(before).length && keys.every(k => Object.prototype.hasOwnProperty.call(before,k))) {
        keys.forEach(k => visit(before[k],after[k],Array.isArray(after) ? path+'['+k+']' : path+'.'+k));
        return;
      }
    }
    // setData also updates service-side data. Detach each binding so changing
    // p.id cannot accidentally mutate the same player inside r.players.
    patch[path] = after && typeof after === 'object' ? JSON.parse(JSON.stringify(after)) : after;
  }
  Object.keys(next).forEach(key => visit(previous[key],next[key],key));
  return patch;
}
// Match native setData path semantics in the browser preview and test harness.
function apply(data, patch) {
  Object.entries(patch).forEach(([path,value]) => {
    const keys = path.replace(/\[(\d+)\]/g,'.$1').split('.');
    let target = data;
    keys.slice(0,-1).forEach((key,i) => { target = target[key] ||= /^\d+$/.test(keys[i+1]) ? [] : {}; });
    target[keys[keys.length-1]] = value;
  });
  return data;
}
module.exports = {diff,apply};
