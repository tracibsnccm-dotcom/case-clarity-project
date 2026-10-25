/*
 * C.A.S.E. Clarity — re-run date box.
 * Turns a report's re-run interval ("Every 10–14 days", "within 24–48 hours",
 * "Weekly", "60 days") into a calendar date the attorney can schedule.
 *
 * Rules:
 *  - The "re-run by" date uses the longest end of the interval.
 *  - First follow-up is never later than 30 days. When the report's interval is
 *    longer than 30 days (a stable result), the date is capped at 30 days and the
 *    box explains that the longer interval applies once two reports in a row
 *    show that level.
 */
(function (global) {
  var FIRST_RERUN_MAX_DAYS = 30;

  function parseUpperDays(text) {
    var t = String(text || '').toLowerCase();
    if (!t) return null;
    if (/week/.test(t) && !/\d/.test(t)) return 7;
    var nums = (t.match(/\d+/g) || []).map(Number);
    if (!nums.length) return null;
    var upper = Math.max.apply(null, nums);
    if (/hour/.test(t)) return Math.max(1, Math.ceil(upper / 24));
    if (/week/.test(t)) return upper * 7;
    return upper;
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {string} intervalText - the interval as shown on the report
   * @param {{from?: string|Date, accent?: string}} [opts]
   * @returns {string} HTML (inline styles so it survives storage and printing)
   */
  function boxHtml(intervalText, opts) {
    opts = opts || {};
    var days = parseUpperDays(intervalText);
    if (days == null) return '';
    var from = opts.from ? new Date(opts.from) : new Date();
    if (isNaN(from.getTime())) from = new Date();
    var capped = days > FIRST_RERUN_MAX_DAYS;
    var useDays = capped ? FIRST_RERUN_MAX_DAYS : days;
    var due = new Date(from.getTime());
    due.setDate(due.getDate() + useDays);
    var accent = opts.accent || '#0c1c34';
    var clean = String(intervalText).replace(/^\s*(every|within)\s+/i, '');
    var sub = capped
      ? 'First follow-up is within 30 days. If the next report also shows this level, you can move to every ' + esc(clean) + '.'
      : 'Based on this report’s findings (' + esc(String(intervalText).trim()) + ').';
    return (
      '<div class="cc-rerun-box" style="margin:12px 0;padding:12px 16px;background:#fff;border:2px solid ' + accent +
      ';border-left:6px solid ' + accent + ';border-radius:8px;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:' + accent +
      ';margin-bottom:4px">Re-run this assessment by</div>' +
      '<div style="font-size:20px;font-weight:800;color:#0c1c34;line-height:1.2">' + esc(fmtDate(due)) + '</div>' +
      '<div style="font-size:12.5px;color:#3a3f4a;line-height:1.5;margin-top:4px">' + sub + '</div>' +
      '<div style="font-size:11.5px;color:#6b7280;line-height:1.5;margin-top:4px">Re-run sooner if anything changes in treatment, providers, or the client’s condition.</div>' +
      '</div>'
    );
  }

  global.caseClarityRerun = {
    FIRST_RERUN_MAX_DAYS: FIRST_RERUN_MAX_DAYS,
    parseUpperDays: parseUpperDays,
    boxHtml: boxHtml
  };
})(typeof window !== 'undefined' ? window : this);
