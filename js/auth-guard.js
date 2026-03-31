/**
 * Auth helpers. Paid portal: Supabase Auth session. Trial: CCP#/PIN sets localStorage (see login.html).
 */
(function () {
  function getClient() {
    return window.supabaseClient;
  }

  function hasTrialLocalSession() {
    return localStorage.getItem('user_logged_in') === 'true' && !!localStorage.getItem('user_id');
  }

  async function requireAuth() {
    var client = getClient();
    if (!client) {
      window.location.href = '/login.html';
      return null;
    }
    var result = await client.auth.getSession();
    var session = result.data && result.data.session;
    if (session) {
      return session;
    }
    if (hasTrialLocalSession()) {
      return { trialLocalSession: true };
    }
    window.location.href = '/login.html';
    return null;
  }

  async function redirectIfLoggedIn() {
    var client = getClient();
    if (!client) return;
    var result = await client.auth.getSession();
    var session = result.data && result.data.session;
    if (session || hasTrialLocalSession()) {
      window.location.href = '/dashboard.html';
    }
  }

  async function logoutUser() {
    var client = getClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (e) {
        /* ignore */
      }
    }
    try {
      localStorage.clear();
    } catch (e) { /* ignore */ }
    window.location.href = '/login.html';
  }

  function attachLogoutHandler(buttonSelector) {
    var btn = document.querySelector(buttonSelector);
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      logoutUser();
    });
  }

  window.requireAuth = requireAuth;
  window.redirectIfLoggedIn = redirectIfLoggedIn;
  window.logoutUser = logoutUser;
  window.attachLogoutHandler = attachLogoutHandler;
})();
