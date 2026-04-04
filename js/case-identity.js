(function () {
  'use strict';

  function normalizeScope(ct) {
    var v = String(ct == null ? '' : ct).toLowerCase();
    if (v === 'retrospective' || v === 'retro' || v === 'closed') return 'retro';
    return 'active';
  }

  function storageKeyForScope(scope) {
    return scope === 'retro' ? 'dashboard_case_retro' : 'dashboard_case_active';
  }

  function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateDisplay(iso) {
    if (!iso) return '';
    var d = String(iso).trim();
    if (!d) return '';
    var m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      try {
        var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }
      } catch (e) {}
    }
    return d;
  }

  function readCasePayload() {
    var params = new URLSearchParams(window.location.search);
    var ct =
      params.get('caseType') ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('tool_caseType') : null) ||
      'active';
    var scope = normalizeScope(ct);
    var raw = null;
    try {
      raw = localStorage.getItem(storageKeyForScope(scope));
    } catch (e) {}
    var data = {};
    if (raw) {
      try {
        data = JSON.parse(raw) || {};
      } catch (e) {}
    }
    return { scope: scope, data: data };
  }

  function render() {
    var mount = document.getElementById('case-header-fields');
    if (!mount) return;
    var info = readCasePayload();
    var d = info.data || {};
    var scopeLabel = info.scope === 'retro' ? 'Retrospective (closed) case' : 'Active case';
    var name = d.nameCaseId || '';
    var doi = formatDateDisplay(d.dateOfInjury) || d.dateOfInjury || '';
    var mech = d.mechanism || '';
    var ctype = d.caseType || '';
    var empty = !name && !doi && !mech && !ctype;
    var dash = '\u2014';
    mount.innerHTML =
      '<section class="case-identity-card" aria-label="Case overview">' +
      '<h2 class="case-identity-heading">Case overview</h2>' +
      '<p class="case-identity-scope">' +
      escapeHtml(scopeLabel) +
      '</p>' +
      '<dl class="case-identity-dl">' +
      '<div class="case-identity-row"><dt>Name / Case ID</dt><dd>' +
      (name ? escapeHtml(name) : dash) +
      '</dd></div>' +
      '<div class="case-identity-row"><dt>Date of injury / loss</dt><dd>' +
      (doi ? escapeHtml(doi) : dash) +
      '</dd></div>' +
      '<div class="case-identity-row"><dt>Mechanism of injury</dt><dd>' +
      (mech ? escapeHtml(mech) : dash) +
      '</dd></div>' +
      '<div class="case-identity-row"><dt>Case type</dt><dd>' +
      (ctype ? escapeHtml(ctype) : dash) +
      '</dd></div>' +
      '</dl>' +
      (empty
        ? '<p class="case-identity-hint">Enter or edit case details on the dashboard; they apply to all trial instruments for this ' +
          (info.scope === 'retro' ? 'retrospective' : 'active') +
          ' case.</p>'
        : '') +
      '</section>';
  }

  function init() {
    render();
    window.addEventListener('storage', function (e) {
      if (e.key === 'dashboard_case_active' || e.key === 'dashboard_case_retro') render();
    });
    window.addEventListener('focus', function () {
      render();
    });
  }

  window.CaseClarityCaseIdentity = {
    render: render,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
