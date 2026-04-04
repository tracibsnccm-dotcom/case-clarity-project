/**
 * C.A.S.E. Clarity paid portal — shared header navigation (Back to Case, Back to Dashboard, Logout).
 */
(function (global) {
  var STORAGE_KEY = 'caseClarityLastCaseRef';

  function rememberCaseRefFromUrl() {
    try {
      var p = new URLSearchParams(window.location.search);
      var ref = p.get('case_ref');
      if (ref) global.localStorage.setItem(STORAGE_KEY, ref);
    } catch (e) {}
  }

  function backToCaseHref() {
    try {
      var p = new URLSearchParams(window.location.search);
      var ref = p.get('case_ref');
      if (ref) return '/case-detail.html?case_ref=' + encodeURIComponent(ref);
      var last = global.localStorage.getItem(STORAGE_KEY);
      if (last) return '/case-detail.html?case_ref=' + encodeURIComponent(last);
    } catch (e) {}
    return '/case-detail.html';
  }

  function initPortalHeaderNav() {
    rememberCaseRefFromUrl();
    var backCase = document.getElementById('portal-nav-back-case');
    if (backCase) backCase.setAttribute('href', backToCaseHref());

    var logoutBtn = document.getElementById('portal-nav-logout');
    if (logoutBtn) {
      logoutBtn.disabled = false;
      if (
        typeof global.attachLogoutHandler === 'function' &&
        !logoutBtn.getAttribute('data-portal-logout-bound')
      ) {
        logoutBtn.setAttribute('data-portal-logout-bound', '1');
        global.attachLogoutHandler('#portal-nav-logout');
      }
    }

    if (global.supabaseClient && global.supabaseClient.auth) {
      global.supabaseClient.auth.getSession().then(function (res) {
        var s = res.data && res.data.session;
        var el = document.getElementById('user-email');
        if (el && s && s.user) el.textContent = s.user.email || '';
      });
    }
  }

  global.caseClarityRememberCaseRef = rememberCaseRefFromUrl;
  global.initPortalHeaderNav = initPortalHeaderNav;
})(typeof window !== 'undefined' ? window : this);
