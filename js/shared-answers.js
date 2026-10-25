/*
 * C.A.S.E. Clarity — enter-once answers shared across the six tools.
 *
 * When a tool completes, the answers other tools also ask for are recorded with
 * the tool name and the date they were entered. Another tool that asks the same
 * thing fills it in from that record and shows a note:
 *     "Filled in from HSI · entered Oct 25, 2026 · confirm or change"
 * Answers older than 30 days are NOT filled in. The note shows the old answer
 * and its date and asks for a current answer instead.
 * Each report lists the answers it carried over, with their dates.
 *
 * Storage: localStorage cc_shared_active / cc_shared_retro (saved to the account
 * by workspace-sync.js).
 */
(function (global) {
  var STALE_DAYS = 30;
  var regs = {};       // toolKey -> [{key, label, entry, applied, current, anchor, pos}]
  var observer = null;

  function caseKind() {
    try {
      var k = new URLSearchParams(global.location.search).get('caseType');
      return k === 'retrospective' || k === 'retro' ? 'retro' : 'active';
    } catch (e) {
      return 'active';
    }
  }
  function storeKey() { return 'cc_shared_' + caseKind(); }

  function load() {
    try { return JSON.parse(localStorage.getItem(storeKey()) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(storeKey(), JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  function daysOld(entry) {
    if (!entry || !entry.at) return Infinity;
    return Math.floor((Date.now() - new Date(entry.at).getTime()) / 86400000);
  }
  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function get(key) {
    var e = load()[key];
    return e && e.value != null ? e : null;
  }

  /**
   * Look up an answer for prefill.
   * @returns {{entry, fresh:boolean}|null}
   */
  function lookup(key) {
    var e = get(key);
    if (!e) return null;
    return { entry: e, fresh: daysOld(e) <= STALE_DAYS };
  }

  /**
   * Record answers from a completed tool. Answers this tool only carried over
   * (unchanged) keep their original source and date, so re-saving never makes
   * an old answer look new.
   */
  function record(toolKey, values) {
    var all = load();
    var now = new Date().toISOString();
    var carried = {};
    (regs[toolKey] || []).forEach(function (r) {
      if (r.applied && r.entry && sameValue(r.current ? r.current() : undefined, r.applied)) carried[r.key] = true;
    });
    Object.keys(values || {}).forEach(function (k) {
      var v = values[k];
      if (v == null || v === '') return;
      if (carried[k] && all[k] && sameValue(all[k].value, v)) return;
      all[k] = { value: v, source: toolKey, at: now };
    });
    save(all);
  }

  function sameValue(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function noteHtml(r) {
    var e = r.entry;
    var src = esc(e.source);
    var when = esc(fmt(e.at));
    if (r.applied !== undefined) {
      return '<div class="cc-carry-note" data-cc-key="' + esc(r.key) + '" style="margin:6px 0 10px;padding:6px 10px;background:#eef4fb;border-left:3px solid #1e5c9a;border-radius:4px;font-size:12px;line-height:1.45;color:#1a2e3f;font-family:system-ui,Segoe UI,sans-serif">' +
        '<strong>Filled in from ' + src + '</strong> · entered ' + when +
        (r.display ? ' (' + esc(r.display) + ')' : '') + ' · confirm or change</div>';
    }
    return '<div class="cc-carry-note" data-cc-key="' + esc(r.key) + '" style="margin:6px 0 10px;padding:6px 10px;background:#fff6e5;border-left:3px solid #c47a10;border-radius:4px;font-size:12px;line-height:1.45;color:#5a3a00;font-family:system-ui,Segoe UI,sans-serif">' +
      '<strong>Last recorded in ' + src + ' on ' + when + '</strong>' + (r.display ? ': ' + esc(r.display) : '') +
      ' — that is ' + daysOld(e) + ' days old, so it was not filled in. Please answer for the client’s current status.</div>';
  }

  function placeNotes() {
    Object.keys(regs).forEach(function (tk) {
      regs[tk].forEach(function (r) {
        if (!r.entry || typeof r.anchor !== 'function') return;
        var el = null;
        try { el = r.anchor(); } catch (e) { el = null; }
        if (!el || !el.parentNode) return;
        var parent = el.parentNode;
        var existing = parent.querySelector(':scope > .cc-carry-note[data-cc-key="' + r.key + '"]');
        if (existing) return;
        var wrap = document.createElement('div');
        wrap.innerHTML = noteHtml(r);
        var note = wrap.firstChild;
        if (r.pos === 'before') parent.insertBefore(note, el);
        else parent.insertBefore(note, el.nextSibling);
      });
    });
  }

  function watch() {
    if (observer || !global.MutationObserver) return;
    var queued = false;
    observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      (global.requestAnimationFrame || setTimeout)(function () { queued = false; placeNotes(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Fill in one field from a shared answer.
   * @param {string} toolKey   tool doing the filling (e.g. 'RRF')
   * @param {object} spec
   *   key       shared answer key
   *   isEmpty() true when the field has no answer yet (never overwrite an answer)
   *   apply(v)  sets the field from the shared value; returns the value set, or undefined to skip
   *   current() returns the field's current value in the same form apply() returned
   *   anchor()  element the note goes next to; pos 'before' | 'after' (default after)
   *   display(v) short readable text for the value
   *   accept(entry) optional; return false to ignore an answer (e.g. from this same tool)
   */
  function fill(toolKey, spec) {
    var found = lookup(spec.key);
    if (!found) return;
    var e = found.entry;
    if (e.source === toolKey) return;
    if (spec.accept && spec.accept(e) === false) return;
    if (spec.isEmpty && !spec.isEmpty()) return;
    var r = { key: spec.key, entry: e, anchor: spec.anchor, pos: spec.pos, current: spec.current, label: spec.label || spec.key };
    try { r.display = spec.display ? spec.display(e.value) : ''; } catch (x) { r.display = ''; }
    if (found.fresh) {
      var applied;
      try { applied = spec.apply(e.value); } catch (x) { applied = undefined; }
      if (applied === undefined) return;
      r.applied = applied;
    }
    (regs[toolKey] = regs[toolKey] || []).push(r);
    watch();
    placeNotes();
  }

  /** Report block listing answers this tool carried over unchanged, with dates. */
  function provenanceHtml(toolKey) {
    var rows = (regs[toolKey] || []).filter(function (r) {
      return r.applied !== undefined && sameValue(r.current ? r.current() : undefined, r.applied);
    });
    if (!rows.length) return '';
    return '<div class="cc-provenance" style="margin:12px 0;padding:10px 14px;background:#f6f8fb;border:1px solid #d6dde8;border-radius:6px;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#1a2e3f;margin-bottom:4px">Answers carried over from other assessments</div>' +
      '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.5;color:#3a3f4a">' +
      rows.map(function (r) {
        return '<li><strong>' + esc(r.label) + ':</strong> ' + esc(r.display || '') + ' — from ' + esc(r.entry.source) + ', entered ' + esc(fmt(r.entry.at)) + '</li>';
      }).join('') + '</ul></div>';
  }

  var PAIN_WORDS = { 5: 'Minimal', 4: 'Mild', 3: 'Moderate', 2: 'Significant', 1: 'Severe' };
  var BARRIER_WORDS = { 5: 'No barrier', 4: 'Minor barrier', 3: 'Moderate barrier', 2: 'Significant barrier', 1: 'Severe barrier' };
  var LEVEL_WORDS = { 5: 'Stable', 4: 'Mild disruption', 3: 'Moderate disruption', 2: 'Severe disruption', 1: 'Critical' };
  var YN_WORDS = { yes: 'Yes', no: 'No', prefer: 'Prefer not to answer' };

  global.caseClarityShared = {
    STALE_DAYS: STALE_DAYS,
    get: get,
    lookup: lookup,
    record: record,
    fill: fill,
    provenanceHtml: provenanceHtml,
    placeNotes: placeNotes,
    words: { pain: PAIN_WORDS, barrier: BARRIER_WORDS, level: LEVEL_WORDS, yn: YN_WORDS },
    _regs: regs
  };
})(typeof window !== 'undefined' ? window : this);
