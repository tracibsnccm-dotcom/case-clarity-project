/**
 * Portal tool header: user label, logout, trial-friendly nav targets.
 * Used by tool3-caf.html (hybrid trial / paid shell).
 */
(function () {
  'use strict';

  async function resolveEmailDisplay() {
    try {
      var client = window.supabaseClient;
      if (client) {
        var r = await client.auth.getSession();
        var u = r && r.data && r.data.session && r.data.session.user;
        if (u && u.email) return String(u.email).trim();
      }
    } catch (e) {}
    try {
      var le = localStorage.getItem('email');
      if (le && String(le).trim()) return String(le).trim();
    } catch (e) {}
    return 'Trial access';
  }

  window.initPortalHeaderNav = async function initPortalHeaderNav() {
    var emailEl = document.getElementById('user-email');
    if (emailEl) {
      var em = await resolveEmailDisplay();
      emailEl.textContent = em || 'Trial access';
    }

    var logoutBtn = document.getElementById('portal-nav-logout');
    if (logoutBtn && typeof window.logoutUser === 'function') {
      logoutBtn.disabled = false;
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.logoutUser();
      });
    }

    var params = new URLSearchParams(window.location.search);
    var caseRef = params.get('case_ref');
    var backCase = document.getElementById('portal-nav-back-case');
    if (backCase) {
      if (caseRef) {
        backCase.setAttribute('href', 'case-detail.html?case_ref=' + encodeURIComponent(caseRef));
      } else {
        backCase.setAttribute('href', 'dashboard.html');
      }
    }

  };
})();
