/*
 * C.A.S.E. Clarity — print without pop-up windows.
 * Prints a full HTML document through a hidden iframe on the current page, so
 * pop-up blockers never stop a report from printing.
 */
(function (global) {
  function caseClarityPrintDocument(docHtml) {
    var old = document.getElementById('cc-print-frame');
    if (old) old.parentNode.removeChild(old);
    var f = document.createElement('iframe');
    f.id = 'cc-print-frame';
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open();
    d.write(docHtml);
    d.close();

    function go() {
      try {
        f.contentWindow.focus();
        f.contentWindow.print();
      } catch (e) {
        console.warn('[print] failed', e);
      }
    }
    var imgs = d.images ? Array.prototype.slice.call(d.images) : [];
    var pending = imgs.filter(function (i) { return !i.complete; });
    if (!pending.length) {
      setTimeout(go, 400);
      return;
    }
    var left = pending.length;
    var done = function () { left -= 1; if (left <= 0) setTimeout(go, 300); };
    pending.forEach(function (i) { i.onload = done; i.onerror = done; });
    setTimeout(function () { if (left > 0) { left = 0; go(); } }, 4000);
  }
  global.caseClarityPrintDocument = caseClarityPrintDocument;
})(typeof window !== 'undefined' ? window : this);
