/*
 * C.A.S.E. Clarity — closed (retrospective) cases, for the trial and the paid portal.
 *
 * Trial: the open case's "Is this a current case … or a retrospective case that has closed?"
 *        answer (dashboard_case_active.caseStatus).
 * Portal: the case's status in case_cases (set on the page by case-identity.js).
 *
 * A closed case's reports start with a "Closed Case — Retrospective Review" banner and show
 * no re-run date.
 */
(function (global) {
  var BANNER_MARK = 'cc-closed-banner';
  function paidRef() {
    try { return new URLSearchParams(global.location.search).get('case_ref') || ''; } catch (e) { return ''; }
  }
  function isClosed() {
    if (paidRef()) return String(global.__ccCaseStatus || '').toLowerCase() === 'closed';
    try { return (JSON.parse(global.localStorage.getItem('dashboard_case_active') || 'null') || {}).caseStatus === 'closed'; } catch (e) { return false; }
  }
  function bannerHtml() {
    return '<div class="' + BANNER_MARK + '" style="margin:0 0 14px;padding:10px 16px;background:#3a3f4a;color:#fff;border-left:6px solid #b09837;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">Closed Case — Retrospective Review</div>' +
      '<div style="font-size:12px;opacity:0.9;margin-top:2px">This review identifies clinical, access, and documentation gaps present in the record. Use these findings as a road map for what to watch for, and address early, in future cases of this type.</div></div>';
  }
  function boxHtml() {
    return '<div class="cc-closed-box" style="margin:12px 0;padding:12px 16px;background:#fff;border:2px solid #3a3f4a;border-left:6px solid #3a3f4a;border-radius:8px;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#3a3f4a;margin-bottom:4px">Closed case — re-run dates do not apply</div>' +
      '<div style="font-size:12.5px;color:#3a3f4a;line-height:1.5">The Recommended Next Actions show the steps that strengthen cases like this one. Use them as a checklist from intake forward on your next case of this type.</div></div>';
  }
  var prev = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (this === global.localStorage && /^tool[1-6]_report_html$/.test(k) && isClosed() && String(v).indexOf(BANNER_MARK) === -1) {
      v = bannerHtml() + String(v);
    }
    return prev.call(this, k, v);
  };
  global.caseClarityClosed = { isClosed: isClosed, bannerHtml: bannerHtml, boxHtml: boxHtml };
})(typeof window !== 'undefined' ? window : this);
