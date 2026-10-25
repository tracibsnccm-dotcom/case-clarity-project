/*
 * C.A.S.E. Clarity — trial workspace sync.
 * Keeps the attorney's case information, tool answers and reports saved to their
 * account (Supabase table trial_workspace), not just this browser, so nothing is
 * lost on logout, cleared browser data, or a different device.
 *
 * - Every write to a workspace key in localStorage is pushed to the account
 *   (debounced). Pages keep reading/writing localStorage exactly as before.
 * - caseClarityWorkspace.pull() restores the account copy into this browser
 *   (dashboard calls it before rendering).
 * - caseClarityWorkspace.flush() sends any pending changes now (call before logout).
 */
(function (global) {
  var KEY_RE = /^(dashboard_case_(active|retro)|tool[1-6]_(data|complete|report_html|completed_at)|cc_(?!ws_).+)$/;
  var STAMP = 'cc_ws_updated_at';
  var OWNER = 'cc_ws_owner';
  var DEBOUNCE_MS = 1500;

  var ls = global.localStorage;
  var origSet = Storage.prototype.setItem;
  var origRemove = Storage.prototype.removeItem;
  var timer = null;
  var dirty = false;
  var applying = false;
  var inflight = null;

  function ident() {
    try {
      return { id: ls.getItem('user_id') || '', ccp: ls.getItem('ccp') || '' };
    } catch (e) {
      return { id: '', ccp: '' };
    }
  }

  function client() {
    return global.supabaseClient || null;
  }

  function collect() {
    var out = {};
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k && KEY_RE.test(k)) out[k] = ls.getItem(k);
    }
    return out;
  }

  function schedule() {
    if (applying) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      void push();
    }, DEBOUNCE_MS);
  }

  async function push() {
    var c = client();
    var me = ident();
    if (!c || !me.id || !dirty) return false;
    dirty = false;
    var data = collect();
    inflight = (async function () {
      try {
        var r = await c.rpc('trial_workspace_save', { p_id: me.id, p_ccp: me.ccp, p_data: data });
        if (r.error) {
          dirty = true;
          console.warn('[workspace] save failed:', r.error.message);
          return false;
        }
        applying = true;
        try {
          origSet.call(ls, STAMP, String(r.data || new Date().toISOString()));
          origSet.call(ls, OWNER, me.id);
        } finally {
          applying = false;
        }
        return true;
      } catch (e) {
        dirty = true;
        console.warn('[workspace] save error:', e);
        return false;
      }
    })();
    var ok = await inflight;
    inflight = null;
    return ok;
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (inflight) await inflight;
    if (dirty) return push();
    return true;
  }

  function clearLocalWorkspace() {
    var keys = [];
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k && KEY_RE.test(k)) keys.push(k);
    }
    keys.forEach(function (k) { origRemove.call(ls, k); });
  }

  /** Restore the account copy into this browser when it is newer (or the browser has none). */
  async function pull() {
    var c = client();
    var me = ident();
    if (!c || !me.id) return { restored: false };
    try {
      // A different attorney's leftovers in this browser are never mixed in.
      var owner = ls.getItem(OWNER);
      if (owner && owner !== me.id) {
        applying = true;
        try { clearLocalWorkspace(); origRemove.call(ls, STAMP); } finally { applying = false; }
      }
      var r = await c.rpc('trial_workspace_get', { p_id: me.id, p_ccp: me.ccp });
      if (r.error) {
        console.warn('[workspace] load failed:', r.error.message);
        return { restored: false, error: r.error.message };
      }
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      var localStamp = ls.getItem(STAMP);
      var hasLocal = Object.keys(collect()).length > 0;
      if (!row || !row.data) {
        // Nothing saved yet: upload whatever this browser has.
        if (hasLocal) { dirty = true; await push(); }
        applying = true;
        try { origSet.call(ls, OWNER, me.id); } finally { applying = false; }
        return { restored: false };
      }
      var serverNewer = !localStamp || new Date(row.updated_at) > new Date(localStamp);
      if (!serverNewer && hasLocal) {
        // This browser has changes the account doesn't have yet.
        dirty = true;
        void push();
        return { restored: false };
      }
      applying = true;
      try {
        clearLocalWorkspace();
        Object.keys(row.data).forEach(function (k) {
          if (KEY_RE.test(k) && row.data[k] != null) origSet.call(ls, k, String(row.data[k]));
        });
        origSet.call(ls, STAMP, String(row.updated_at));
        origSet.call(ls, OWNER, me.id);
      } finally {
        applying = false;
      }
      return { restored: true, updatedAt: row.updated_at };
    } catch (e) {
      console.warn('[workspace] load error:', e);
      return { restored: false, error: String(e) };
    }
  }

  // Watch workspace writes made anywhere on the page.
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === ls && KEY_RE.test(k)) schedule();
  };
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (this === ls && KEY_RE.test(k)) schedule();
  };

  // Best effort when the tab is hidden or closed.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && dirty) void push();
  });

  global.caseClarityWorkspace = { pull: pull, flush: flush, push: push, collect: collect };
})(typeof window !== 'undefined' ? window : this);
