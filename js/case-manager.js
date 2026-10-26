/*
 * C.A.S.E. Clarity — trial cases (up to 10, active or closed).
 *
 * The open case lives in the usual working keys (dashboard_case_active,
 * toolN_data, toolN_report_html, timeline, shared answers, drafts, history),
 * so the six tools work exactly as before. Every other case is kept as one
 * compressed snapshot (cc_case_<id>). Switching cases swaps the snapshot in.
 * All of it is saved to the account by workspace-sync.js.
 *
 * Closed (retrospective) cases: reports carry a "Closed case — retrospective
 * review" banner and no re-run date.
 *
 * Tool pages: if the attorney switches cases on the dashboard while a tool is
 * still open in another tab, that tab stops saving and says so, so answers can
 * never land in the wrong case.
 */
(function (global) {
  var MAX = 10; // trial; plans set their own limit (caseClarityPlan.maxCases)
  function max() { return global.caseClarityPlan && global.caseClarityPlan.maxCases ? global.caseClarityPlan.maxCases() : MAX; }
  var INDEX = 'cc_cases';
  var CURRENT = 'cc_current_case';
  var SNAP = 'cc_case_';
  var CASE_KEY_RE = /^(dashboard_case_active|tool[1-6]_(data|complete|report_html|completed_at)|cc_timeline_active|cc_shared_active|cc_draft_tool[1-6]|cc_history_tool[1-6])$/;
  var ls = global.localStorage;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function parse(v) { try { return JSON.parse(v || 'null'); } catch (e) { return null; } }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function isPaid() {
    try { return !!new URLSearchParams(global.location.search).get('case_ref'); } catch (e) { return false; }
  }

  /* ── compression (gzip when the browser supports it) ── */
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function pack(obj) {
    var json = JSON.stringify(obj);
    if (typeof CompressionStream === 'undefined') return 'j:' + json;
    try {
      var stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      var buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return 'g:' + b64(buf);
    } catch (e) {
      return 'j:' + json;
    }
  }
  async function unpack(str) {
    if (!str) return {};
    if (str.slice(0, 2) === 'j:') return parse(str.slice(2)) || {};
    if (str.slice(0, 2) === 'g:') {
      var stream = new Blob([unb64(str.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'));
      return parse(await new Response(stream).text()) || {};
    }
    return parse(str) || {};
  }

  /* ── working case ── */
  function workingKeys() {
    var keys = [];
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k && CASE_KEY_RE.test(k)) keys.push(k);
    }
    return keys;
  }
  function snapshotWorking() {
    var out = {};
    workingKeys().forEach(function (k) { out[k] = ls.getItem(k); });
    return out;
  }
  function clearWorking() { workingKeys().forEach(function (k) { ls.removeItem(k); }); }

  function info() { return parse(ls.getItem('dashboard_case_active')) || {}; }
  function doneCount() {
    var n = 0;
    for (var i = 1; i <= 6; i++) if (ls.getItem('tool' + i + '_complete')) n++;
    return n;
  }
  function liveMeta() {
    var c = info();
    return { name: c.nameCaseId || '', status: c.caseStatus || '', doi: c.dateOfInjury || '', done: doneCount(), updated: new Date().toISOString() };
  }

  /* ── index ── */
  function index() { var a = parse(ls.getItem(INDEX)); return Array.isArray(a) ? a : []; }
  function saveIndex(a) { ls.setItem(INDEX, JSON.stringify(a)); }
  function currentId() { return ls.getItem(CURRENT) || ''; }

  function init() {
    var idx = index();
    var cur = currentId();
    if (!cur) { cur = newId(); ls.setItem(CURRENT, cur); }
    if (!idx.some(function (e) { return e.id === cur; })) {
      idx.push({ id: cur, created: new Date().toISOString() });
      saveIndex(idx);
    }
    return cur;
  }

  function list() {
    var cur = currentId();
    return index().map(function (e) {
      var m = e.id === cur ? liveMeta() : e;
      return { id: e.id, name: m.name || '', status: m.status || '', doi: m.doi || '', done: m.done || 0, updated: m.updated || e.created || '', current: e.id === cur, removeAt: e.removeAt || null };
    });
  }

  async function stashCurrent() {
    var cur = currentId();
    if (!cur) return;
    var meta = liveMeta();
    ls.setItem(SNAP + cur, await pack(snapshotWorking()));
    saveIndex(index().map(function (e) { return e.id === cur ? Object.assign({ id: e.id, created: e.created, removeAt: e.removeAt || null }, meta) : e; }));
    clearWorking();
  }

  async function loadCase(id) {
    var data = await unpack(ls.getItem(SNAP + id));
    Object.keys(data).forEach(function (k) { if (CASE_KEY_RE.test(k) && data[k] != null) ls.setItem(k, String(data[k])); });
    ls.removeItem(SNAP + id);
    ls.setItem(CURRENT, id);
    try { sessionStorage.removeItem('reportData'); } catch (e) { /* ignore */ }
  }

  async function settle() {
    if (global.caseClarityWorkspace && global.caseClarityWorkspace.flush) {
      try { await global.caseClarityWorkspace.flush(); } catch (e) { /* ignore */ }
    }
  }

  async function switchTo(id) {
    if (!id || id === currentId()) return { ok: true };
    if (!index().some(function (e) { return e.id === id; })) return { ok: false, reason: 'That case was not found.' };
    await stashCurrent();
    await loadCase(id);
    await settle();
    return { ok: true };
  }

  function isBlank() {
    var c = info();
    if (c.nameCaseId || c.dateOfInjury || c.caseType) return false;
    return !workingKeys().some(function (k) { return k !== 'dashboard_case_active'; });
  }

  async function add() {
    init();
    if (isBlank()) return { ok: true, reused: true };
    if (index().length >= max()) return { ok: false, reason: (global.caseClarityPlan && global.caseClarityPlan.access() ? 'Your plan allows up to ' : 'The trial allows up to ') + max() + (max() === 1 ? ' client.' : ' cases. Delete a case to add another.') };
    await stashCurrent();
    var id = newId();
    var idx = index();
    idx.push({ id: id, created: new Date().toISOString() });
    saveIndex(idx);
    ls.setItem(CURRENT, id);
    try { sessionStorage.removeItem('reportData'); } catch (e) { /* ignore */ }
    await settle();
    return { ok: true };
  }

  async function remove(id) {
    var cur = currentId();
    var rest = index().filter(function (e) { return e.id !== id; });
    if (id === cur) {
      clearWorking();
      saveIndex(rest);
      if (rest.length) {
        await loadCase(rest[rest.length - 1].id);
      } else {
        var nid = newId();
        saveIndex([{ id: nid, created: new Date().toISOString() }]);
        ls.setItem(CURRENT, nid);
      }
    } else {
      ls.removeItem(SNAP + id);
      saveIndex(rest);
    }
    try { sessionStorage.removeItem('reportData'); } catch (e) { /* ignore */ }
    await settle();
    return { ok: true };
  }

  /* Monthly plans: a removed client stays (downloads only) until the renewal date, then is deleted. */
  function markRemoval(id, removeAt) {
    saveIndex(index().map(function (e) { return e.id === id ? Object.assign({}, e, { removeAt: removeAt }) : e; }));
  }
  function unmarkRemoval(id) {
    saveIndex(index().map(function (e) { if (e.id !== id) return e; var c = Object.assign({}, e); delete c.removeAt; return c; }));
  }
  function currentRemoval() {
    var cur = currentId();
    var e = index().filter(function (x) { return x.id === cur; })[0];
    return e && e.removeAt ? e.removeAt : null;
  }
  async function purgeDue() {
    var due = index().filter(function (e) { return e.removeAt && new Date(e.removeAt).getTime() <= Date.now(); });
    for (var i = 0; i < due.length; i++) await remove(due[i].id);
    return due.length;
  }

  /* Trial ended without a plan: remove every case from this browser. */
  function clearAll() {
    var keys = [];
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k && (CASE_KEY_RE.test(k) || k.indexOf(SNAP) === 0 || k === INDEX || k === CURRENT || k === 'dashboard_case_retro' || k === 'cc_shared_retro' || k === 'cc_access' || k === 'cc_single_runs')) keys.push(k);
    }
    keys.forEach(function (k) { ls.removeItem(k); });
    try { sessionStorage.removeItem('reportData'); } catch (e) { /* ignore */ }
    return keys.length;
  }

  /* ── closed (retrospective) cases ── */
  function isClosed() { return !isPaid() && info().caseStatus === 'closed'; }

  var BANNER_MARK = 'cc-closed-banner';
  function reportBannerHtml() {
    return '<div class="' + BANNER_MARK + '" style="margin:0 0 14px;padding:10px 16px;background:#3a3f4a;color:#fff;border-left:6px solid #b09837;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:13px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">Closed Case — Retrospective Review</div>' +
      '<div style="font-size:12px;opacity:0.9;margin-top:2px">This review identifies clinical, access, and documentation gaps present in the record. Use these findings as a road map for what to watch for, and address early, in future cases of this type.</div></div>';
  }
  function closedBoxHtml() {
    return '<div class="cc-closed-box" style="margin:12px 0;padding:12px 16px;background:#fff;border:2px solid #3a3f4a;border-left:6px solid #3a3f4a;border-radius:8px;font-family:system-ui,Segoe UI,sans-serif">' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#3a3f4a;margin-bottom:4px">Closed case — re-run dates do not apply</div>' +
      '<div style="font-size:12.5px;color:#3a3f4a;line-height:1.5">The Recommended Next Actions show the steps that strengthen cases like this one. Use them as a checklist from intake forward on your next case of this type.</div></div>';
  }

  /* ── storage hooks ── */
  var onDashboard = /(^|\/)dashboard\.html$/i.test(global.location.pathname || '');
  var loadedCase = currentId();
  var warned = false;
  function warnSwitched() {
    if (warned || !document.body) return;
    warned = true;
    var bar = document.createElement('div');
    bar.setAttribute('style', 'position:sticky;top:0;z-index:5000;background:#7a1a1a;color:#fff;padding:12px 18px;text-align:center;font:600 14px system-ui,Segoe UI,sans-serif');
    bar.textContent = 'You switched to a different case on the dashboard, so this tab has stopped saving. Close this tab and open the tool again from the dashboard.';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  var prevSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (this === ls && !onDashboard && !isPaid() && CASE_KEY_RE.test(k) && loadedCase && currentId() && currentId() !== loadedCase) {
      warnSwitched();
      return;
    }
    if (this === ls && /^tool[1-6]_report_html$/.test(k) && isClosed() && String(v).indexOf(BANNER_MARK) === -1) {
      v = reportBannerHtml() + String(v);
    }
    return prevSet.call(this, k, v);
  };

  global.caseClarityCases = {
    MAX: MAX,
    max: max,
    init: init,
    list: list,
    currentId: currentId,
    switchTo: switchTo,
    add: add,
    remove: remove,
    clearAll: clearAll,
    markRemoval: markRemoval,
    unmarkRemoval: unmarkRemoval,
    currentRemoval: currentRemoval,
    purgeDue: purgeDue,
    isClosed: isClosed,
    closedBoxHtml: closedBoxHtml,
    reportBannerHtml: reportBannerHtml,
    _pack: pack,
    _unpack: unpack
  };
})(typeof window !== 'undefined' ? window : this);
