/*
 * C.A.S.E. Clarity — one-line result for each tool, run history, and the
 * "Compared with the last run" block on re-run reports.
 *
 * History: whenever a tool's saved data (toolN_data) is replaced by a new run,
 * the previous run's date and result are kept in cc_history_toolN (last 5).
 */
(function (global) {
  var CAF_WORDS = { 1: 'Severe', 2: 'Significant', 3: 'Moderate', 4: 'Minor', 5: 'None' };
  var HSI_WORDS = { 1: 'Critical', 2: 'Unstable', 3: 'Struggling', 4: 'Stable', 5: 'Strong' };
  var KEYS = { 1: 'CCI', 2: 'CSA', 3: 'CAF', 4: 'HSI', 5: 'FCI', 6: 'RRF' };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function parse(v) { try { return JSON.parse(v || 'null'); } catch (e) { return null; } }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function bandFromDays(days) {
    var d = Number(days);
    if (!isFinite(d)) return '';
    if (d < 90) return 'Short (under ~3 months)';
    if (d <= 180) return 'Moderate (~3–6 months)';
    if (d <= 365) return 'Extended (~6–12 months)';
    return 'Prolonged (~12 months or longer)';
  }

  /** One-line result for tool n from its saved data. */
  function resultFor(n, d) {
    if (!d) return '';
    try {
      switch (Number(n)) {
        case 1: return 'Level ' + d.level + ' — ' + ((d.assessmentData && d.assessmentData.levelName) || '') +
          (d.assessmentData && d.assessmentData.coord && d.assessmentData.coord.authRisk ? '; authorization risk ' + d.assessmentData.coord.authRisk : '');
        case 2: {
          var a = d.data || d;
          var nRev = (a.reviewItems || []).length;
          return (a.overallLabel || '') + '; ' + (a.caseFindings || []).length + ' findings' + (nRev ? ', ' + nRev + ' for RN review' : '');
        }
        case 3: return 'Level ' + d.finalLevel + ' — ' + (CAF_WORDS[d.finalLevel] || '') + ' friction (' + (d.determiningDomainTitle || '') + ')';
        case 4: return (d.intrinsic != null ? d.intrinsic + ' — ' + HSI_WORDS[d.intrinsic] : 'Not scored') + ' (4Ps floor)' + (d.pCode ? ', determined by ' + d.pCode : '');
        case 5: return (d.functionalVulnerabilityIndicator || '') + ' vulnerability; minimum score ' + d.fciMinScore;
        case 6: return (d.level || '') + ' recovery risk; treatment course ' + bandFromDays(d.predictedDays);
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  /** Numeric severity for direction of change (lower = more serious), or null. */
  function severity(n, d) {
    if (!d) return null;
    switch (Number(n)) {
      case 1: return Number(d.level);
      case 2: { var k = (d.data || d).overallKey || ''; return /misaligned/.test(k) ? 1 : /partial/.test(k) ? 2 : k === 'review' ? 3 : 4; }
      case 3: return Number(d.finalLevel);
      case 4: return d.intrinsic != null ? Number(d.intrinsic) : null;
      case 5: return d.fciMinScore != null ? Number(d.fciMinScore) : null;
      case 6: return ({ Critical: 1, Severe: 2, Moderate: 3, Mild: 4, Stable: 5 })[d.level] || null;
    }
    return null;
  }

  function history(n) {
    var h = parse(global.localStorage.getItem('cc_history_tool' + n));
    return Array.isArray(h) ? h : [];
  }

  // Keep the previous run when a tool's data is replaced by a new run.
  var orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    var m = this === global.localStorage && /^tool([1-6])_data$/.exec(k);
    if (m) {
      try {
        var prev = parse(this.getItem(k));
        var next = parse(v);
        if (prev && prev.timestamp && (!next || next.timestamp !== prev.timestamp)) {
          var h = history(m[1]);
          if (!h.length || h[h.length - 1].at !== prev.timestamp) {
            h.push({ at: prev.timestamp, result: resultFor(m[1], prev), severity: severity(m[1], prev) });
            orig.call(this, 'cc_history_tool' + m[1], JSON.stringify(h.slice(-5)));
          }
        }
      } catch (e) { /* ignore */ }
    }
    orig.call(this, k, v);
  };

  /**
   * "Compared with the last run" block for a report.
   * @param {number} n tool number
   * @param {object} [newData] the run the report is being built from
   */
  function compareHtml(n, newData) {
    var stored = parse(global.localStorage.getItem('tool' + n + '_data'));
    var cur = newData || stored;
    if (!cur) return '';
    var prev = null;
    if (stored && newData && stored.timestamp && stored.timestamp !== newData.timestamp) {
      prev = { at: stored.timestamp, result: resultFor(n, stored), severity: severity(n, stored) };
    } else {
      var h = history(n);
      prev = h.length ? h[h.length - 1] : null;
    }
    if (!prev) return '';
    var nowRes = resultFor(n, cur);
    var a = prev.severity, b = severity(n, cur);
    var dir = (a == null || b == null) ? '' : (b > a ? 'Improved' : b < a ? 'Worsened' : 'No change in level');
    var col = dir === 'Improved' ? '#1a5c3a' : dir === 'Worsened' ? '#7a1a1a' : '#3a3f4a';
    return '<div class="cc-compare" style="margin:12px 0;padding:10px 14px;background:#fff;border:1.5px solid #d6dde8;border-left:5px solid ' + col + ';border-radius:6px;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#1a2e3f;margin-bottom:4px">Compared with the last run (' + esc(fmt(prev.at)) + ')</div>' +
      (dir ? '<div style="font-size:15px;font-weight:800;color:' + col + ';margin-bottom:4px">' + esc(dir) + '</div>' : '') +
      '<div style="font-size:12.5px;line-height:1.5;color:#3a3f4a"><strong>Then:</strong> ' + esc(prev.result) + '<br><strong>Now:</strong> ' + esc(nowRes) + '</div></div>';
  }

  global.caseClarityResults = { resultFor: resultFor, severity: severity, history: history, compareHtml: compareHtml, KEYS: KEYS };
})(typeof window !== 'undefined' ? window : this);
