/* shared pan and zoom for the proto mind maps: plain CSS transforms */
function ProtoMap(vp, cv, zl) {
  var s = { x: 0, y: 0, k: 1 }, drag = null, moved = false;
  function apply() { cv.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) scale(' + s.k + ')'; if (zl) zl.textContent = Math.round(s.k * 100) + '%'; }
  function zoomAt(f, cx, cy) {
    var nk = Math.max(0.25, Math.min(1.8, s.k * f)); f = nk / s.k;
    s.x = cx - (cx - s.x) * f; s.y = cy - (cy - s.y) * f; s.k = nk; apply();
  }
  vp.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.zoom')) return;
    drag = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y }; moved = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    moved = true; vp.classList.add('drag'); s.x = drag.sx + dx; s.y = drag.sy + dy; apply();
  });
  window.addEventListener('pointerup', function () { drag = null; vp.classList.remove('drag'); setTimeout(function () { moved = false; }, 0); });
  vp.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  vp.addEventListener('wheel', function (e) {
    e.preventDefault(); var r = vp.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  return {
    s: s, apply: apply,
    zoom: function (f) { var r = vp.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); },
    centerOn: function (wx, wy, k) { var r = vp.getBoundingClientRect(); if (k) s.k = k; s.x = r.width / 2 - wx * s.k; s.y = r.height / 2 - wy * s.k; apply(); },
    fit: function (b) {
      var r = vp.getBoundingClientRect(), k = Math.min(r.width / (b.w + 80), r.height / (b.h + 80), 1);
      s.k = k; s.x = r.width / 2 - (b.x + b.w / 2) * k; s.y = r.height / 2 - (b.y + b.h / 2) * k; apply();
    }
  };
}
