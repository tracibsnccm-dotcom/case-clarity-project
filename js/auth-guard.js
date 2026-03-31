/**
 * Minimal auth helpers for static HTML pages. Depends on window.supabaseClient.
 */
(function () {
  function getClient() {
    return window.supabaseClient;
  }

  async function requireAuth() {
    var client = getClient();
    if (!client) {
      window.location.href = '/login.html';
      return null;
    }
    var result = await client.auth.getSession();
    var session = result.data && result.data.session;
    if (result.error || !session) {
      window.location.href = '/login.html';
      return null;
    }
    return session;
  }

  async function redirectIfLoggedIn() {
    var client = getClient();
    if (!client) return;
    var result = await client.auth.getSession();
    var session = result.data && result.data.session;
    if (session) {
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
