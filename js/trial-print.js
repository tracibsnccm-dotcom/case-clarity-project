/*
 * C.A.S.E. Clarity — print one instrument's report from its completion screen.
 * Opens the saved report (localStorage) in a clean window with this page's
 * styles, so the printout contains the report only, then opens the print dialog.
 */
(function (global) {
  function caseClarityPrintStoredReport(storageKey, title) {
    var html = '';
    try {
      html = localStorage.getItem(storageKey) || '';
    } catch (e) {
      html = '';
    }
    if (!html) {
      alert('The report for this assessment is not available yet. Complete the assessment first.');
      return;
    }
    var styles = Array.prototype.map
      .call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) {
        return n.outerHTML;
      })
      .join('');
    var base = '<base href="' + String(window.location.href).replace(/"/g, '&quot;') + '">';
    var fix =
      '<style>' +
      'html,body{background:#fff!important;margin:0;padding:0;}' +
      '.cc-print-wrap{max-width:900px;margin:24px auto;padding:0 16px;display:block!important;position:static!important;}' +
      '.cc-print-wrap,.cc-print-wrap *{visibility:visible!important;}' +
      '.cc-print-wrap>*{position:static!important;left:auto!important;top:auto!important;width:auto!important;max-width:100%!important;' +
      'height:auto!important;overflow:visible!important;pointer-events:auto!important;display:block!important;visibility:visible!important;}' +
      '.cc-print-wrap [aria-hidden="true"]{position:static!important;left:auto!important;}' +
      '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}' +
      '@media print{.cc-print-wrap{margin:0 auto;}}' +
      '</style>';
    var doc =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' + base +
      '<title>' + String(title || 'Report').replace(/</g, '&lt;') + '</title>' +
      styles + fix + caseRunningHeaderCss() + '</head><body><div class="cc-print-wrap">' + html + '</div></body></html>';
    if (typeof global.caseClarityPrintDocument === 'function') {
      global.caseClarityPrintDocument(doc);
      return;
    }
    var w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups for this site to print the report.');
      return;
    }
    w.document.open();
    w.document.write(doc);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 600);
  }
  /* Case name and date of injury at the top of every printed page. */
  function caseRunningHeaderCss() {
    var ci = global.caseClarityIdentity;
    var row = ci && typeof ci.trialRow === 'function' ? ci.trialRow() : null;
    if (!row || !row.case_title) return '';
    var doi = ci.formatInjuryDate ? ci.formatInjuryDate(row.date_of_injury) : row.date_of_injury;
    var closed = global.caseClarityCases && global.caseClarityCases.isClosed();
    var txt = ((closed ? 'CLOSED CASE — RETROSPECTIVE REVIEW  ·  ' : '') + row.case_title + (doi && doi !== '—' ? '  ·  DOI ' + doi : '')).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '<style>@page{margin:0.6in 0.5in;@top-left{content:"' + txt + '";font:600 9pt system-ui,sans-serif;color:#555;}' +
      '@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9pt system-ui,sans-serif;color:#777;}}</style>';
  }
  global.caseClarityRunningHeaderCss = caseRunningHeaderCss;
  global.caseClarityPrintStoredReport = caseClarityPrintStoredReport;
})(typeof window !== 'undefined' ? window : this);
