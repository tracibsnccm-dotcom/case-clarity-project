/*
 * C.A.S.E. Clarity — connects each tool to the shared answers (js/shared-answers.js).
 * Loaded after the tool's own scripts. Detects which tool page it is on, fills in
 * answers recorded by other tools (with a dated note), and records this tool's
 * shareable answers when it is completed.
 *
 * Shared answers (value scale):
 *   pain, psych          1–5  (5 Minimal … 1 Severe)
 *   transport, access    1–5  (5 No barrier … 1 Severe barrier)
 *   dom_physical, dom_psychological, dom_psychosocial, dom_professional  1–5 (4Ps)
 *   dependents, soleEarner, incomeUnder30   'yes' | 'no' | 'prefer'
 *   specialistCount      number of specialty physicians (CCI)
 */
(function (global) {
  var SH = global.caseClarityShared;
  if (!SH) return;
  var W = SH.words;
  var page = (global.location.pathname.split('/').pop() || '').toLowerCase();

  function $(sel) { return document.querySelector(sel); }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* Run fn once when the given tool's completion flag is written. */
  function onComplete(n, fn) {
    var key = 'tool' + n + '_complete';
    var orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      orig.call(this, k, v);
      if (this === global.localStorage && k === key) {
        try { fn(); } catch (e) { console.warn('[shared] record failed', e); }
      }
    };
  }

  function ready(fn) {
    var run = function () { setTimeout(fn, 250); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  /* ───────────── CCI ───────────── */
  if (page.indexOf('tool1-cci') === 0) {
    ready(function () {
      var cb = document.querySelector('input[type=checkbox][value="Chronic or severe pain"]');
      if (!cb) return;
      SH.fill('CCI', {
        key: 'pain', label: 'Chronic or severe pain',
        isEmpty: function () { return !cb.checked; },
        apply: function (v) { if (v > 2) return undefined; cb.checked = true; fire(cb); return true; },
        current: function () { return cb.checked; },
        anchor: function () { return cb.closest('.cb-item'); },
        display: function (v) { return 'Pain ' + (W.pain[v] || v); },
        accept: function (e) { return e.value <= 2; }
      });
    });
    onComplete(1, function () {
      var spec = document.querySelectorAll('input[type=checkbox][data-g="spec"]:checked').length;
      SH.record('CCI', { specialistCount: spec });
    });
  }

  /* ───────────── CSA ───────────── */
  if (page.indexOf('tool2-csa') === 0) {
    ready(function () {
      if (typeof answers === 'undefined') return;
      var labels = ['Specialist identified for each injury', 'Client seen by the specialist', 'Specialist updated the diagnosis'];
      [0, 1, 2].forEach(function (qi) {
        SH.fill('CSA', {
          key: 'specialistCount', label: 'Right #1 — ' + labels[qi],
          accept: function (e) { return Number(e.value) === 0; },
          isEmpty: function () { return !(answers[0] && answers[0][qi]); },
          apply: function () {
            answers[0] = answers[0] || {};
            answers[0][qi] = { value: 'no' };
            if (document.getElementById('opt-0-' + qi + '-no') && typeof csaApplyAnswerVisualOnly === 'function') {
              csaApplyAnswerVisualOnly(0, qi, 'no', { silentBatch: true });
            }
            return 'no';
          },
          current: function () { return answers[0] && answers[0][qi] ? answers[0][qi].value : undefined; },
          anchor: function () { var s = document.getElementById('subq-0-' + qi); return s && s.querySelector('.sub-q-options'); },
          display: function () { return 'No — CCI lists no specialty physicians'; }
        });
      });
    });
  }

  /* CSA: show timeline flags where the timing and follow-through questions are asked. */
  if (page.indexOf('tool2-csa') === 0) {
    ready(function () {
      var TL = global.caseClarityTimeline;
      if (!TL) return;
      var orig = global.startAudit;
      if (typeof orig !== 'function') return;
      global.startAudit = function () {
        var r = orig.apply(this, arguments);
        try {
          var fl = TL.flags();
          if (!fl.length) return r;
          var html = '<div class="cc-carry-note" style="margin:10px 0 12px;padding:8px 12px;background:#fff6e5;border-left:3px solid #c47a10;border-radius:4px;font-size:12.5px;line-height:1.5;color:#5a3a00">' +
            '<strong>From your Case Timeline:</strong><ul style="margin:4px 0 0;padding-left:18px">' +
            fl.map(function (f) { return '<li>' + String(f.text).replace(/</g, '&lt;') + '</li>'; }).join('') + '</ul></div>';
          [4, 5].forEach(function (ri) {
            var body = document.getElementById('card-body-' + ri);
            var qs = body && body.querySelector('.sub-questions');
            if (qs && !body.querySelector('.cc-tl-hint')) {
              var w = document.createElement('div'); w.className = 'cc-tl-hint'; w.innerHTML = html; qs.parentNode.insertBefore(w, qs);
            }
          });
        } catch (e) { /* ignore */ }
        return r;
      };
    });
  }

  /* ───────────── CAF ───────────── */
  if (page.indexOf('tool3-caf') === 0) {
    ready(function () {
      if (typeof ans === 'undefined') return;
      SH.fill('CAF', {
        key: 'transport', label: 'Reliable transportation (Q11)',
        isEmpty: function () { return ans.D3_Q0 === undefined; },
        apply: function (v) {
          var r = document.getElementById('D3_Q0_' + v);
          if (!r) return undefined;
          r.checked = true;
          if (typeof onA === 'function') onA('D3_Q0', v); else ans.D3_Q0 = v;
          return Number(v);
        },
        current: function () { return ans.D3_Q0; },
        anchor: function () { var r = document.getElementById('D3_Q0_5'); return r && r.closest('.sc'); },
        display: function (v) { return W.barrier[v] || v; }
      });
    });
    onComplete(3, function () {
      var a = typeof ans !== 'undefined' ? ans : {};
      var accessVals = [];
      ['D1', 'D2'].forEach(function (d) { for (var i = 0; i < 5; i++) if (a[d + '_Q' + i] != null) accessVals.push(a[d + '_Q' + i]); });
      SH.record('CAF', {
        transport: a.D3_Q0 != null ? Number(a.D3_Q0) : null,
        access: accessVals.length ? Math.min.apply(null, accessVals) : null
      });
    });
  }

  /* ───────────── HSI ───────────── */
  if (page.indexOf('tool4-hsi') === 0) {
    function hsiFill() {
      if (typeof A === 'undefined') return;
      SH._regs.HSI = [];
      SH.fill('HSI', {
        key: 'transport', label: 'Transportation (Social Drivers)',
        isEmpty: function () { return A[4][2] === undefined; },
        apply: function (v) { A[4][2] = Number(v); return Number(v); },
        current: function () { return A[4][2]; },
        anchor: function () { return document.getElementById('dc2'); },
        display: function (v) { return W.barrier[v] || v; }
      });
      SH.fill('HSI', {
        key: 'pain', label: 'Pain (Clinical Destabilizer)',
        isEmpty: function () { return A[5][0] === undefined; },
        apply: function (v) { A[5][0] = Number(v); return Number(v); },
        current: function () { return A[5][0]; },
        anchor: function () { return document.getElementById('dd0'); },
        display: function (v) { return W.pain[v] || v; }
      });
    }
    ready(function () {
      // startAssessment() clears all answers, so fill in after it runs.
      var orig = global.startAssessment;
      if (typeof orig !== 'function') return;
      global.startAssessment = function () {
        var r = orig.apply(this, arguments);
        hsiFill();
        if (typeof render === 'function') render();
        return r;
      };
    });
    onComplete(4, function () {
      var sc = typeof score === 'function' ? score() : null;
      var dep = A[5][1], anx = A[5][2];
      var psych = dep != null && anx != null ? Math.min(dep, anx) : (dep != null ? dep : anx);
      var out = { pain: A[5][0], psych: psych, transport: A[4][2] };
      if (sc && Array.isArray(sc.ds)) {
        ['dom_physical', 'dom_psychological', 'dom_psychosocial', 'dom_professional'].forEach(function (k, i) { out[k] = sc.ds[i]; });
      }
      SH.record('HSI', out);
    });
  }

  /* ───────────── FCI ───────────── */
  if (page.indexOf('tool5-fci') === 0) {
    ready(function () {
      if (typeof S === 'undefined') return;
      function vulnRow(id) { var b = document.querySelector('.hscale-btn[data-ind="' + id + '"]'); return b && b.parentElement; }
      SH.fill('FCI', {
        key: 'pain', label: 'Pain related to injury',
        isEmpty: function () { return S.vulnScores.pain == null; },
        apply: function (v) { S.vulnScores.pain = Number(v); return Number(v); },
        current: function () { return S.vulnScores.pain; },
        anchor: function () { return vulnRow('pain'); },
        display: function (v) { return W.pain[v] || v; }
      });
      SH.fill('FCI', {
        key: 'psych', label: 'Psychological stress',
        isEmpty: function () { return S.vulnScores.psych == null; },
        apply: function (v) { S.vulnScores.psych = Number(v); return Number(v); },
        current: function () { return S.vulnScores.psych; },
        anchor: function () { return vulnRow('psych'); },
        display: function (v) { return W.pain[v] || v; }
      });
      [['dependents', 'hasDependents', 'fvi-dep', 'Dependents'], ['soleEarner', 'isSoleEarner', 'fvi-sole', 'Sole income earner']].forEach(function (m) {
        SH.fill('FCI', {
          key: m[0], label: m[3],
          isEmpty: function () { return !S.fviFields[m[1]]; },
          apply: function (v) { if (!W.yn[v]) return undefined; S.fviFields[m[1]] = v; return v; },
          current: function () { return S.fviFields[m[1]]; },
          anchor: function () { var el = document.getElementById(m[2]); return el && el.closest('.field-wrap'); },
          display: function (v) { return W.yn[v] || v; }
        });
      });
      SH.fill('FCI', {
        key: 'incomeUnder30', label: 'Pre-injury income',
        accept: function (e) { return e.value === 'yes' || e.value === 'prefer'; },
        isEmpty: function () { return !S.fviFields.incomeRange; },
        apply: function (v) { var x = v === 'yes' ? 'under30' : 'prefer'; S.fviFields.incomeRange = x; return x; },
        current: function () { return S.fviFields.incomeRange; },
        anchor: function () { var el = document.getElementById('fvi-income'); return el && el.closest('.field-wrap'); },
        display: function (v) { return v === 'yes' ? 'Under $30,000' : 'Prefer not to answer'; }
      });
      [['dom_physical', 'physical', 'Physical Wellness'], ['dom_psychological', 'psychological', 'Psychological Wellness'],
       ['dom_psychosocial', 'psychosocial', 'Psychosocial Wellness'], ['dom_professional', 'professional', 'Professional Wellness']].forEach(function (m) {
        SH.fill('FCI', {
          key: m[0], label: m[2],
          isEmpty: function () { return S.scores[m[1]] == null; },
          apply: function (v) { S.scores[m[1]] = Number(v); return Number(v); },
          current: function () { return S.scores[m[1]]; },
          anchor: function () { return document.querySelector('.level-card[data-domain="' + m[1] + '"]'); },
          pos: 'before',
          display: function (v) { return 'HSI ' + m[2] + ' level ' + v; }
        });
      });
      if (typeof render === 'function') render();
    });
    onComplete(5, function () {
      var f = S.fviFields;
      SH.record('FCI', {
        pain: S.vulnScores.pain,
        psych: S.vulnScores.psych,
        dependents: f.hasDependents || null,
        soleEarner: f.isSoleEarner || null,
        incomeUnder30: f.incomeRange ? (f.incomeRange === 'under30' ? 'yes' : (f.incomeRange === 'prefer' ? 'prefer' : 'no')) : null
      });
    });
  }

  /* ───────────── RRF ───────────── */
  if (page.indexOf('tool6-rrf') === 0) {
    ready(function () {
      function sel(id) { return document.getElementById(id); }
      function fieldOf(id) { var el = sel(id); return el && (el.closest('.field') || el.parentElement); }
      function selFill(id, key, label, map, display) {
        var el = sel(id);
        if (!el) return;
        SH.fill('RRF', {
          key: key, label: label,
          isEmpty: function () { return el.value === ''; },
          apply: function (v) {
            var x = map(v);
            if (x == null || ![].some.call(el.options, function (o) { return o.value === String(x); })) return undefined;
            el.value = String(x); fire(el); return String(x);
          },
          current: function () { return el.value; },
          anchor: function () { return fieldOf(id); },
          include: function () { var f = el.closest('#piForm, #wcForm'); return f ? f.offsetParent !== null : true; },
          display: display
        });
      }
      var three = function (v) { v = Number(v); return v >= 4 ? 0 : (v === 3 ? 1 : 2); };
      ['pi', 'wc'].forEach(function (b) {
        selFill(b + '_physical', 'pain', 'Physical instability (from pain rating)', function (v) { return [0, 5, 10][three(v)]; }, function (v) { return 'Pain ' + (W.pain[v] || v); });
        selFill(b + '_psych', 'psych', 'Psychological instability', function (v) { return b === 'pi' ? [0, 8, 15][three(v)] : null; }, function (v) { return W.pain[v] || v; });
        selFill(b + '_accessFriction', 'access', 'Treatment access friction', function (v) { v = Number(v); return v >= 5 ? 0 : v === 4 ? 2 : v === 3 ? 4 : 6; }, function (v) { return W.barrier[v] || v; });
      });
      // WC psych options use their own values; map by position.
      (function () {
        var el = sel('wc_psych'); if (!el) return;
        SH.fill('RRF', {
          key: 'psych', label: 'Psychological instability (WC)',
          isEmpty: function () { return el.value === ''; },
          apply: function (v) { var o = el.options[1 + three(v)]; if (!o) return undefined; el.value = o.value; fire(el); return o.value; },
          current: function () { return el.value; },
          anchor: function () { return fieldOf('wc_psych'); },
          include: function () { var f = el.closest('#piForm, #wcForm'); return f ? f.offsetParent !== null : true; },
          display: function (v) { return W.pain[v] || v; }
        });
      })();
      selFill('pi_altTransport', 'transport', 'Reliable alternative transportation', function (v) { v = Number(v); return v >= 4 ? 0 : (v <= 2 ? 10 : null); }, function (v) { return W.barrier[v] || v; });
      selFill('pi_dependents', 'dependents', 'Financial dependents', function (v) { return v === 'yes' ? 5 : v === 'no' ? 0 : 'na'; }, function (v) { return W.yn[v] || v; });
      selFill('pi_singleParent', 'soleEarner', 'Primary household provider', function (v) { return v === 'yes' ? 10 : v === 'no' ? 0 : 'na'; }, function (v) { return W.yn[v] || v; });
      selFill('pi_income', 'incomeUnder30', 'Household income', function (v) { return v === 'yes' ? 15 : v === 'prefer' ? 'na' : null; }, function (v) { return v === 'yes' ? 'Under $30,000' : v === 'prefer' ? 'Prefer not to answer' : ''; });

      // Mechanism of injury from the dashboard case information.
      try {
        var kind = new URLSearchParams(global.location.search).get('caseType');
        var c = JSON.parse(localStorage.getItem(kind === 'retrospective' ? 'dashboard_case_retro' : 'dashboard_case_active') || 'null');
        var mech = c && c.mechanism ? String(c.mechanism) : '';
        if (/\b(mvc|mva|motor vehicle|car|auto|rear[- ]?end|collision|vehicle|truck|crash)\b/i.test(mech)) {
          ['pi_mechanism', 'wc_mechanism'].forEach(function (id) {
            var el = sel(id); if (!el || el.value !== '') return;
            var idx = [].findIndex.call(el.options, function (o) { return /Motor Vehicle/i.test(o.text); });
            if (idx < 0) return;
            el.selectedIndex = idx; fire(el);
            var f = fieldOf(id);
            if (f && !f.querySelector('.cc-carry-note')) {
              var n = document.createElement('div');
              n.className = 'cc-carry-note';
              n.setAttribute('style', 'margin:6px 0 10px;padding:6px 10px;background:#eef4fb;border-left:3px solid #1e5c9a;border-radius:4px;font-size:12px;line-height:1.45;color:#1a2e3f');
              n.innerHTML = '<strong>Filled in from Case Information</strong> (“' + mech.replace(/</g, '&lt;') + '”) · confirm or change';
              f.appendChild(n);
            }
          });
        }
      } catch (e) { /* ignore */ }
    });
    onComplete(6, function () {
      function yn(id, yesVal) { var el = document.getElementById(id); if (!el || el.value === '') return null; return el.value === 'na' ? 'prefer' : (el.value === String(yesVal) ? 'yes' : 'no'); }
      var inc = document.getElementById('pi_income');
      var td = {};
      try { td = JSON.parse(localStorage.getItem('tool6_data') || '{}'); } catch (e) { td = {}; }
      if (td.branch !== 'PI') return;
      SH.record('RRF', {
        dependents: yn('pi_dependents', 5),
        soleEarner: yn('pi_singleParent', 10),
        incomeUnder30: inc && inc.value !== '' ? (inc.value === 'na' ? 'prefer' : inc.value === '15' ? 'yes' : 'no') : null
      });
    });
  }
})(typeof window !== 'undefined' ? window : this);
