/*
 * C.A.S.E. Clarity — one-page case summary for the front of the complete report.
 * Reads each completed tool's saved data and report, and lists:
 *   - case information
 *   - each tool's result and its re-run date
 *   - the earliest re-run date across all tools
 *   - the key case-specific findings
 */
(function (global) {
  var TOOLS = [
    { n: 1, key: 'CCI', name: 'Case Complexity Index' },
    { n: 2, key: 'CSA', name: 'Clinical Sequencing Auditor' },
    { n: 3, key: 'CAF', name: 'C.A.R.E. Access Friction Score' },
    { n: 4, key: 'HSI', name: 'Holistic Stability Index' },
    { n: 5, key: 'FCI', name: 'Functional Capacity Index' },
    { n: 6, key: 'RRF', name: 'Recovery Risk Forecaster' }
  ];
  var CAF_WORDS = { 1: 'Severe', 2: 'Significant', 3: 'Moderate', 4: 'Minor', 5: 'None' };
  var HSI_WORDS = { 1: 'Critical', 2: 'Unstable', 3: 'Struggling', 4: 'Stable', 5: 'Strong' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function json(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function reportDoc(n) {
    var h = localStorage.getItem('tool' + n + '_report_html') || '';
    if (!h) return null;
    try { return new DOMParser().parseFromString('<div>' + h + '</div>', 'text/html'); } catch (e) { return null; }
  }
  function rerunDate(doc) {
    if (!doc) return null;
    var box = doc.querySelector('.cc-rerun-box');
    if (!box || !box.children[1]) return null;
    var txt = box.children[1].textContent.trim();
    var d = new Date(txt);
    return isNaN(d.getTime()) ? null : { text: txt, date: d };
  }
  function bandFromDays(days) {
    var d = Number(days);
    if (!isFinite(d)) return '';
    if (d < 90) return 'Short (under ~3 months)';
    if (d <= 180) return 'Moderate (~3–6 months)';
    if (d <= 365) return 'Extended (~6–12 months)';
    return 'Prolonged (~12 months or longer)';
  }

  function resultFor(t) {
    var d = json('tool' + t.n + '_data');
    if (!d) return '';
    try {
      if (t.key === 'CCI') return 'Level ' + d.level + ' — ' + ((d.assessmentData && d.assessmentData.levelName) || '') +
        (d.assessmentData && d.assessmentData.coord && d.assessmentData.coord.authRisk ? '; authorization risk ' + d.assessmentData.coord.authRisk : '');
      if (t.key === 'CSA') {
        var a = d.data || d;
        var nRev = (a.reviewItems || []).length;
        return (a.overallLabel || '') + '; ' + (a.caseFindings || []).length + ' findings' + (nRev ? ', ' + nRev + ' for RN review' : '');
      }
      if (t.key === 'CAF') return 'Level ' + d.finalLevel + ' — ' + (CAF_WORDS[d.finalLevel] || '') + ' friction (' + (d.determiningDomainTitle || '') + ')';
      if (t.key === 'HSI') return (d.intrinsic != null ? d.intrinsic + ' — ' + HSI_WORDS[d.intrinsic] : 'Not scored') + ' (4Ps floor)' + (d.pCode ? ', determined by ' + d.pCode : '');
      if (t.key === 'FCI') return (d.functionalVulnerabilityIndicator || '') + ' vulnerability; minimum score ' + d.fciMinScore;
      if (t.key === 'RRF') return (d.level || '') + ' recovery risk; treatment course ' + bandFromDays(d.predictedDays);
    } catch (e) { /* fall through */ }
    return '';
  }

  function keyFindings() {
    var out = [];
    var csa = json('tool2_data');
    var a = csa && (csa.data || csa);
    if (a && Array.isArray(a.redFlagFindings)) out = out.concat(a.redFlagFindings);
    if (a && Array.isArray(a.caseFindings)) out = out.concat(a.caseFindings.slice(0, 8));
    var doc = reportDoc(1);
    if (doc) {
      var blocks = doc.querySelectorAll('div');
      for (var i = 0; i < blocks.length; i++) {
        var head = blocks[i].firstElementChild;
        if (head && /^Case-specific findings$/i.test(head.textContent.trim())) {
          [].slice.call(blocks[i].querySelectorAll('li')).slice(0, 4).forEach(function (li) { out.push(li.textContent.trim()); });
          break;
        }
      }
    }
    var seen = {};
    return out.filter(function (f) { if (!f || seen[f]) return false; seen[f] = 1; return true; }).slice(0, 8);
  }

  function buildSummaryHtml() {
    var c = json('dashboard_case_active') || {};
    var ci = global.caseClarityIdentity;
    var doi = ci && ci.formatInjuryDate ? ci.formatInjuryDate(c.dateOfInjury) : (c.dateOfInjury || '—');
    var ctype = ci && ci.formatCaseType ? ci.formatCaseType(c.caseType) : (c.caseType || '—');
    var rows = '';
    var earliest = null;
    var done = 0;
    TOOLS.forEach(function (t) {
      var complete = !!localStorage.getItem('tool' + t.n + '_complete');
      var rr = complete ? rerunDate(reportDoc(t.n)) : null;
      if (rr && (!earliest || rr.date < earliest.date)) earliest = { date: rr.date, text: rr.text, tool: t.key };
      if (complete) done += 1;
      rows += '<tr>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #e5e1d8;font-weight:600;color:#0c1c34;white-space:nowrap">' + esc(t.key) + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #e5e1d8;color:#3a3f4a">' + (complete ? esc(resultFor(t)) : '<span style="color:#999">Not completed</span>') + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #e5e1d8;white-space:nowrap;font-weight:600;color:#0c1c34">' + (rr ? esc(rr.text) : '—') + '</td>' +
        '</tr>';
    });
    var findings = keyFindings();
    return '<section class="cc-case-summary" style="font-family:system-ui,Segoe UI,sans-serif;color:#1a2e3f;margin-bottom:28px;page-break-after:always;break-after:page">' +
      '<div style="background:#0c1c34;color:#fff;padding:12px 18px;border-bottom:3px solid #b09837">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#e8c547;margin-bottom:6px">Case Summary</div>' +
      '<div style="font-size:19px;font-weight:700">' + esc(c.nameCaseId || '—') + '</div>' +
      '<div style="font-size:13px;opacity:0.9;margin-top:4px">Date of injury: ' + esc(doi) + ' · ' + esc(ctype) +
      (c.mechanism ? ' · ' + esc(c.mechanism) : '') + '</div>' +
      '<div style="font-size:12px;opacity:0.8;margin-top:4px">' + done + ' of 6 assessments completed · Summary generated ' + esc(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) + '</div>' +
      '</div>' +
      (earliest ? '<div style="margin:10px 0;padding:8px 14px;background:#fdf8e8;border:2px solid #b09837;border-left:6px solid #b09837">' +
        '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7a6a22">Next re-run due</div>' +
        '<div style="font-size:17px;font-weight:800;color:#0c1c34;margin-top:2px">' + esc(earliest.text) + ' — ' + esc(earliest.tool) + '</div>' +
        '<div style="font-size:12.5px;color:#3a3f4a;margin-top:2px">Earliest re-run date across the completed assessments. Each tool’s own date is in the table below.</div></div>' : '') +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 10px">' +
      '<thead><tr style="background:#f4f1ea"><th style="text-align:left;padding:5px 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Tool</th>' +
      '<th style="text-align:left;padding:5px 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Result</th>' +
      '<th style="text-align:left;padding:5px 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Re-run by</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      (findings.length ? '<div style="border:1.5px solid #e5e1d8;border-left:5px solid #c0392b;padding:8px 14px">' +
        '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#0c1c34;margin-bottom:6px">Key findings</div>' +
        '<ol style="margin:0;padding-left:20px;font-size:12px;line-height:1.45;color:#3a3f4a">' +
        findings.map(function (f) { return '<li style="margin-bottom:2px">' + esc(f) + '</li>'; }).join('') +
        '</ol><div style="font-size:11.5px;color:#6b7280;margin-top:6px">Full findings are in each assessment’s report on the following pages.</div></div>' : '') +
      '<p style="font-size:10px;color:#888;margin:8px 0 0">Clinical care management tool for case coordination and documentation. Not a scientific instrument, predictive model, or substitute for medical or legal judgment.</p>' +
      '</section>';
  }

  global.caseClaritySummary = { buildSummaryHtml: buildSummaryHtml };
})(typeof window !== 'undefined' ? window : this);
