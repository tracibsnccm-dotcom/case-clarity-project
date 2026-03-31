(function (w) {
  'use strict';

  function normalizeTrialStorageScope(caseType) {
    var v = String(caseType == null ? '' : caseType).toLowerCase();
    if (v === 'retrospective' || v === 'retro' || v === 'closed') return 'retro';
    return 'active';
  }

  function trialToolStorageKey(toolIndex, caseType, suffix) {
    return 'tool' + toolIndex + '_' + normalizeTrialStorageScope(caseType) + '_' + suffix;
  }

  function legacyUnscopedKey(toolIndex, suffix) {
    return 'tool' + toolIndex + '_' + suffix;
  }

  /**
   * Prefer scoped key; for active scope only, fall back to legacy unscoped keys (pre-isolation).
   */
  function readTrialToolRaw(toolIndex, caseType, suffix) {
    var scoped = trialToolStorageKey(toolIndex, caseType, suffix);
    var v = localStorage.getItem(scoped);
    if (v != null) return v;
    if (normalizeTrialStorageScope(caseType) === 'active') {
      return localStorage.getItem(legacyUnscopedKey(toolIndex, suffix));
    }
    return null;
  }

  w.CaseClarityTrialStorage = {
    normalizeScope: normalizeTrialStorageScope,
    key: trialToolStorageKey,
    legacyKey: legacyUnscopedKey,
    readRaw: readTrialToolRaw
  };
})(typeof window !== 'undefined' ? window : this);
