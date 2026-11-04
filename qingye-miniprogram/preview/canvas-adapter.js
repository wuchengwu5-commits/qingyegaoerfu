/* Browser-only Canvas 2D bridge for the same native hole-map page.
   It is never included in the WeChat package. GPS remains a WeChat-only check. */
window.PreviewCanvas = (() => {
  const assetURL = value => {
    if(/^cloud:\/\//.test(value))return '/cloud-assets/media-v1/'+value.split('/media-v1/')[1].replaceAll('__','/');
    if(/^\/packages\/.*\.jpe?g$/i.test(value)||/^\/assets\/(course-[0-2]\.jpg|spring-lake\.webp)$/.test(value))return '/cloud-assets/media-v1'+value;
    return /^\/(assets|packages)\//.test(value)?'/miniprogram'+value:value;
  };
  function install(wx) {
    wx.createOffscreenCanvas = ({width,height}) => {const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};
    wx.getWindowInfo = () => ({pixelRatio: window.devicePixelRatio || 1,
      windowWidth: document.getElementById('content').clientWidth, windowHeight: window.innerHeight});
    wx.createSelectorQuery = () => {
      let selector;
      const query = {
        in() { return query; }, select(value) { selector = value; return query; }, fields() { return query; },
        exec(callback) {
          const node = document.getElementById('content').querySelector(selector);
          if (!node || node.tagName !== 'CANVAS') return callback([null]);
          node.createImage = () => {
            const image = new Image(), descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            Object.defineProperty(image, 'src', {get: () => descriptor.get.call(image),
              set: value => descriptor.set.call(image, assetURL(value))});
            return image;
          };
          const box = node.getBoundingClientRect();
          callback([{node, width: box.width, height: box.height, left: box.left, top: box.top}]);
        }
      };
      return query;
    };
  }
  // Keep the actual canvas and its ancestors mounted while native setData updates
  // distance labels. Replacing them would discard pointer capture during a drag.
  function patch(parent, fresh) {
    const wanted = [...fresh.childNodes];
    wanted.forEach((next, index) => {
      const old = parent.childNodes[index];
      if (!old) { parent.append(next); return; }
      if (old.nodeType !== next.nodeType || old.nodeName !== next.nodeName) { old.replaceWith(next); return; }
      if (old.nodeType === Node.TEXT_NODE) { if (old.data !== next.data) old.data = next.data; return; }
      // Conditional map controls may reuse a div previously used by another
      // control. Refresh handlers/datasets, while retaining the canvas itself.
      for (const key of ['onclick', 'oninput', 'onchange']) old[key] = next[key];
      for (const attr of [...old.attributes]) {
        if (old.tagName === 'CANVAS' && /^(width|height)$/.test(attr.name)) continue;
        if (!next.hasAttribute(attr.name)) old.removeAttribute(attr.name);
      }
      for (const attr of [...next.attributes]) {
        if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
      }
      if (old.tagName !== 'CANVAS') patch(old, next);
    });
    while (parent.childNodes.length > wanted.length) parent.lastChild.remove();
  }
  function bindPage(page) {
    const canvas = document.getElementById('map');
    if (!canvas || canvas._nativePage === page) return;
    canvas._nativePage = page;
    const pointers = new Map();
    function touch(event) { const box = canvas.getBoundingClientRect(); return {
      identifier: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top,
      clientX: event.clientX, clientY: event.clientY}; }
    function eventFor(changed) { return {touches: [...pointers.values()], changedTouches: [changed]}; }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const point = touch(event); pointers.set(event.pointerId, point);
      canvas.setPointerCapture(event.pointerId); page.touchStart(eventFor(point));
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault(); const point = touch(event); pointers.set(event.pointerId, point);
      page.touchMove(eventFor(point));
    });
    canvas.addEventListener('pointerup', event => {
      if (!pointers.has(event.pointerId)) return;
      const point = touch(event); pointers.delete(event.pointerId); page.touchEnd(eventFor(point));
    });
    const cancel = event => { if (pointers.has(event.pointerId)) { pointers.clear(); page.touchCancel(); } };
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); const point = touch(event);
      page.zoomAt(Math.exp(-event.deltaY * .002), [point.x, point.y]);
    }, {passive: false});
  }
  return {install, assetURL, patch, bindPage};
})();
