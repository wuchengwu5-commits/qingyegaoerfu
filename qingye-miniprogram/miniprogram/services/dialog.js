// Business popups share one page-owned host. Never fall back to platform dialogs.
let sequence = 0;
const hosts = new Map(), queue = [];
let active = null;
function currentPage() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  return pages[pages.length - 1] || null;
}
function pump() {
  if (active) return;
  const page = currentPage(), host = hosts.get(page);
  if (!host || !host.visible) return;
  const index = queue.findIndex(item => item.page === page);
  if (index < 0) return;
  active = queue.splice(index, 1)[0];
  host.show(active);
}
function enqueue(kind, options = {}) {
  const request = {id:++sequence, kind, options, page:options.owner || currentPage()};
  queue.push(request);
  pump();
  return request.id;
}
function notify(item, result, cancelled) {
  const options = item.options;
  const failed = cancelled && item.kind !== 'modal';
  const payload = failed ? {errMsg:'dialog:fail cancel'} : result;
  try {
    const callback = failed ? options.fail : options.success;
    if (callback) callback(payload);
  } finally {
    if (options.complete) options.complete(payload);
  }
}
function finish(id, result, cancelled = false) {
  if (!active || active.id !== id) return;
  const item = active;
  active = null;
  hosts.get(item.page)?.hide();
  try { notify(item, result, cancelled); } finally { pump(); }
}
function cancelPage(page) {
  const pending = queue.filter(item => item.page === page);
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].page === page) queue.splice(i, 1);
  if (active?.page === page) {
    pending.unshift(active);
    active = null;
    hosts.get(page)?.hide();
  }
  pending.forEach(item => notify(item, {confirm:false, cancel:true, content:''}, true));
  pump();
}
function register(page, host) {
  hosts.set(page, host);
  host.visible = true;
  pump();
  return {
    show() { host.visible = true; pump(); },
    hide() { host.visible = false; cancelPage(page); },
    detach() { host.visible = false; cancelPage(page); if (hosts.get(page) === host) hosts.delete(page); }
  };
}
module.exports = {
  currentPage, register, finish,
  modal:options => enqueue('modal', options),
  actionSheet:options => enqueue('actions', options),
  select:options => enqueue('select', options),
  date:options => enqueue('date', options),
  time:options => enqueue('time', options)
};
