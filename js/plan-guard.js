/*
 * C.A.S.E. Clarity — plan rules in the tools and on the dashboard.
 *
 * Single Client Review: each of the six tools runs ONCE. The run is recorded on
 * the server (single_claim_run), so clearing the browser or switching devices
 * does not reset it. A tool that has been run is locked; its finished report can
 * still be viewed, printed, and downloaded. RCMS can allow one replacement run of
 * a tool (trial_users.single_replacement_tool) after a technical failure.
 *
 * Plan from localStorage cc_access (set by the dashboard from the account).
 * Cached run list: cc_single_runs {runs:{"1":iso,…}, replacement_tool:n|null}.
 */
(function (global) {
  var ls = global.localStorage;
  var WINDOW_MS = 30000; // writes that belong to the same report generation

  function parse(v) { try { return JSON.parse(v || 'null'); } catch (e) { return null; } }
  function access() {
    var a = parse(ls.getItem('cc_access'));
    return a && a.until && new Date(a.until).getTime() > Date.now() ? a : null;
  }
  function isSingle() { var a = access(); return !!(a && a.plan === 'single'); }
  function cache() { return parse(ls.getItem('cc_single_runs')) || { runs: {}, replacement_tool: null }; }
  function saveCache(c) { try { ls.setItem('cc_single_runs', JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function ident() { return { id: ls.getItem('user_id') || '', ccp: ls.getItem('ccp') || '' }; }
  function hasRun(n) { var c = cache(); return !!(c.runs && c.runs[String(n)]) && Number(c.replacement_tool) !== Number(n); }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Dashboard: refresh the run list from the account and record any run not yet recorded. */
  async function syncSingleRuns() {
    if (!isSingle() || !global.supabaseClient) return cache();
    var me = ident();
    try {
      var r = await global.supabaseClient.rpc('single_status', { p_id: me.id, p_ccp: me.ccp });
      if (!r.error && r.data) {
        var c = { runs: r.data.runs || {}, replacement_tool: r.data.replacement_tool == null ? null : r.data.replacement_tool };
        // A tool completed in this browser but never recorded (e.g. offline) is recorded now.
        for (var n = 1; n <= 6; n++) {
          if (ls.getItem('tool' + n + '_complete') && !c.runs[String(n)]) {
            var cl = await global.supabaseClient.rpc('single_claim_run', { p_id: me.id, p_ccp: me.ccp, p_tool: n });
            if (!cl.error) c.runs[String(n)] = new Date().toISOString();
          }
        }
        saveCache(c);
        return c;
      }
    } catch (e) { /* keep cached list */ }
    return cache();
  }

  /* ── Tool pages ── */
  var page = (global.location.pathname.split('/').pop() || '').toLowerCase();
  var m = /^tool([1-6])-/.exec(page);
  var paid = (function () { try { return !!new URLSearchParams(global.location.search).get('case_ref'); } catch (e) { return false; } })();
  var TOOL = m && !paid ? Number(m[1]) : 0;
  var KEYS = TOOL ? ['tool' + TOOL + '_data', 'tool' + TOOL + '_complete', 'tool' + TOOL + '_report_html'] : [];
  var lockedAtLoad = TOOL ? (isSingle() && hasRun(TOOL)) : false;
  var claimedAt = 0;
  var locked = false;

  function lockScreen(when) {
    if (locked || !document.body) return;
    locked = true;
    var ov = document.createElement('div');
    ov.id = 'cc-plan-lock';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:6000;background:rgba(12,28,52,0.82);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,Segoe UI,sans-serif');
    ov.innerHTML = '<div style="max-width:520px;background:#fff;border-top:5px solid #b09837;padding:24px 26px;color:#1a2e3f">' +
      '<div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#7a6a22;margin-bottom:6px">Single Client Review</div>' +
      '<div style="font-size:20px;font-weight:700;color:#0c1c34;margin-bottom:10px">This report has already been run' + (when ? ' (' + fmt(when) + ')' : '') + '.</div>' +
      '<p style="font-size:14.5px;line-height:1.6;margin:0 0 10px">Each tool runs once with a Single Client Review. You can still view, print, and download the finished report from your dashboard until your access ends.</p>' +
      '<p style="font-size:14.5px;line-height:1.6;margin:0 0 16px">Running this tool again requires a new $1,995 Single Client Review, or a monthly plan with unlimited re-runs. If the report failed or came out blank, contact <a href="mailto:traci.johnson@rcmspllc.com">traci.johnson@rcmspllc.com</a>.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px"><a href="dashboard.html" style="background:#0c1c34;color:#fff;padding:10px 18px;text-decoration:none;font-weight:700">Back to my dashboard</a>' +
      '<a href="pricing.html" style="border:1.5px solid #0c1c34;color:#0c1c34;padding:9px 16px;text-decoration:none;font-weight:700">See plans</a></div></div>';
    document.body.appendChild(ov);
  }

  if (TOOL) {
    var prevSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === ls && KEYS.indexOf(k) !== -1 && isSingle()) {
        if (lockedAtLoad || locked || (claimedAt && Date.now() - claimedAt > WINDOW_MS)) {
          lockScreen((cache().runs || {})[String(TOOL)]);
          return;
        }
        if (k === KEYS[1] && !claimedAt) {
          claimedAt = Date.now();
          var me = ident();
          if (global.supabaseClient) {
            global.supabaseClient.rpc('single_claim_run', { p_id: me.id, p_ccp: me.ccp, p_tool: TOOL }).then(function (r) {
              var d = r && r.data;
              if (r && !r.error && d && d.ok === false) {
                KEYS.forEach(function (key) { try { ls.removeItem(key); } catch (e) { /* ignore */ } });
                lockScreen(d.used_at);
                return;
              }
              if (r && !r.error) {
                var c = cache();
                c.runs = c.runs || {};
                c.runs[String(TOOL)] = new Date().toISOString();
                if (d && d.replacement) c.replacement_tool = null;
                saveCache(c);
              }
            }).catch(function () { /* recorded later from the dashboard */ });
          }
        }
      }
      return prevSet.call(this, k, v);
    };
    var showLock = function () { if (lockedAtLoad) lockScreen((cache().runs || {})[String(TOOL)]); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showLock);
    else showLock();
  }

  global.caseClarityPlan = {
    access: access,
    isSingle: isSingle,
    hasRun: hasRun,
    runs: function () { return cache().runs || {}; },
    replacementTool: function () { return cache().replacement_tool; },
    syncSingleRuns: syncSingleRuns,
    maxCases: function () {
      var a = access();
      var p = a && a.plan;
      return ({ single: 1, foundation: 4, professional: 12, enterprise: 50 })[p] || 10;
    }
  };
})(typeof window !== 'undefined' ? window : this);
