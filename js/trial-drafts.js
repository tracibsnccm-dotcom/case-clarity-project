/*
 * C.A.S.E. Clarity — trial "resume where you left off".
 * While an attorney works in a tool, answers are saved every few seconds
 * (localStorage cc_draft_toolN, synced to the account). Opening the tool again
 * offers "Resume where I left off" or "Start over". The draft is cleared when
 * the tool is completed. Uses each tool's own draft functions (built for the
 * paid portal). Only runs in the trial (no case_ref in the URL).
 */
(function (global) {
  try { if (new URLSearchParams(global.location.search).get('case_ref')) return; } catch (e) { return; }
  var page = (global.location.pathname.split('/').pop() || '').toLowerCase();

  function fn(name) { return typeof global[name] === 'function' ? global[name] : null; }
  function call(name) { var f = fn(name); if (!f) throw new Error(name + ' missing'); return f.apply(null, [].slice.call(arguments, 1)); }

  var CFG = {
    'tool1-cci': {
      n: 1, collect: 'cciCollectDraftJson', has: 'cciDraftHasMeaningfulState',
      resume: function (dj) {
        var ex = document.getElementById('explainer'); if (ex) ex.style.display = 'none';
        var as = document.getElementById('assessment'); if (as) as.style.display = 'block';
        call('cciApplyDraftJson', dj);
        if (fn('cciStep1IsComplete')) { try { global.cciPrevStep1Complete = global.cciStep1IsComplete(); } catch (e) { /* ignore */ } }
      }
    },
    'tool2-csa': {
      n: 2, collect: 'csaCollectDraftJson', has: 'csaDraftHasMeaningfulState',
      resume: function (dj) { call('csaMergeDraftJsonIntoAnswers', dj); call('startAudit'); }
    },
    'tool3-caf': {
      n: 3, collect: 'cafCollectDraftJson', has: 'cafDraftHasMeaningfulState',
      resume: function (dj) {
        call('cafMergeDraftJsonIntoAnswers', dj);
        if (fn('showAssessment')) global.showAssessment();
        call('cafApplyAnswersToUiFromAns'); if (fn('updProg')) global.updProg(); if (fn('updBadges')) global.updBadges();
      }
    },
    'tool4-hsi': {
      n: 4, collect: 'hsiCollectDraftJson', has: 'hsiDraftHasMeaningfulState',
      resume: function (dj) {
        call('hsiMergeDraftJsonIntoState', dj);
        call('showScreen', 'sc-assess'); call('render');
        if (fn('drawMiniSlab')) requestAnimationFrame(function () { requestAnimationFrame(function () { global.drawMiniSlab(); }); });
      }
    },
    'tool5-fci': {
      n: 5, collect: 'fciCollectDraftJson', has: 'fciDraftHasMeaningfulState',
      resume: function (dj) { call('fciMergeDraftJsonIntoState', dj); call('render'); }
    },
    'tool6-rrf': {
      n: 6, collect: 'rrfCollectDraftJson', has: 'rrfDraftHasMeaningfulState',
      resume: function (dj) { call('applyRrfDraftFromJson', dj); }
    }
  };
  var cfg = null;
  Object.keys(CFG).forEach(function (k) { if (page.indexOf(k) === 0) cfg = CFG[k]; });
  if (!cfg) return;

  var KEY = 'cc_draft_tool' + cfg.n;
  var completedHere = false;
  var last = '';
  var timer = null;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // Clear the draft when this tool is completed.
  var orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    orig.call(this, k, v);
    if (this === localStorage && k === 'tool' + cfg.n + '_complete') {
      completedHere = true;
      clearInterval(timer);
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }
  };

  function snapshot() {
    if (completedHere) return;
    var dj;
    try { dj = call(cfg.collect); } catch (e) { return; }
    var meaningful = false;
    try { meaningful = !!call(cfg.has, dj); } catch (e) { meaningful = false; }
    if (!meaningful) return;
    var s = JSON.stringify(dj);
    if (s === last) return;
    last = s;
    try { localStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), draft: dj })); } catch (e) { /* ignore */ }
  }

  function banner(saved) {
    var bar = document.createElement('div');
    bar.id = 'cc-resume-bar';
    bar.setAttribute('style', 'position:sticky;top:0;z-index:4000;background:#0c1c34;color:#fff;padding:12px 18px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,sans-serif;font-size:14px;border-bottom:3px solid #b09837');
    bar.innerHTML = '<span>You have unfinished answers from <strong>' + fmt(saved.at) + '</strong>.</span>' +
      '<button type="button" id="cc-resume-yes" style="background:#b09837;color:#0c1c34;border:none;padding:8px 16px;font-weight:700;cursor:pointer;border-radius:4px">Resume where I left off</button>' +
      '<button type="button" id="cc-resume-no" style="background:transparent;color:#fff;border:1px solid #c4ced8;padding:8px 16px;cursor:pointer;border-radius:4px">Start over</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.getElementById('cc-resume-yes').onclick = function () {
      try {
        cfg.resume(saved.draft);
        last = JSON.stringify(saved.draft);
      } catch (e) {
        console.warn('[drafts] resume failed', e);
        alert('Sorry — the saved answers could not be restored. Please start the assessment again.');
      }
      bar.parentNode.removeChild(bar);
    };
    document.getElementById('cc-resume-no').onclick = function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      bar.parentNode.removeChild(bar);
    };
  }

  function start() {
    var saved = read();
    if (saved && saved.draft) {
      var ok = false;
      try { ok = !!call(cfg.has, saved.draft); } catch (e) { ok = false; }
      if (ok) banner(saved);
    }
    timer = setInterval(snapshot, 2500);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') snapshot(); });
    global.addEventListener('pagehide', snapshot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 600); });
  else setTimeout(start, 600);
})(typeof window !== 'undefined' ? window : this);
