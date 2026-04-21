/*
 * C.A.S.E. Clarity — session helpers (Supabase Auth)
 */

/**
 * @param {{ redirectUrl?: string }} [options]
 */
async function requireAuth(options) {
  const redirectUrl = (options && options.redirectUrl) || 'login.html';
  const client = window.supabaseClient;
  if (!client) {
    window.location.href = redirectUrl;
    return false;
  }
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session) {
    window.location.href = redirectUrl;
    return false;
  }
  return true;
}

async function redirectIfLoggedIn() {
  const client = window.supabaseClient;
  if (!client) return false;
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session) return false;
  window.location.href = 'dashboard.html';
  return true;
}

/**
 * @param {{ redirectUrl?: string }} [options]
 */
async function logoutUser(options) {
  const redirectUrl = (options && options.redirectUrl) || 'login.html';
  const client = window.supabaseClient;
  if (client) {
    await client.auth.signOut();
  }
  window.location.href = redirectUrl;
}

function attachLogoutHandler(buttonSelector) {
  const el = document.querySelector(buttonSelector);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
  });
}

async function ensureAttorneyProfile(session) {
  const client = window.supabaseClient;
  if (!client || !session?.user?.id) {
    return { profile: null, error: new Error('Missing client or session') };
  }

  const userId = session.user.id;
  const email = session.user.email || '';
  const fullName = session.user.user_metadata?.full_name || '';

  const { data: existing, error: selectError } = await client
    .from('case_attorney_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    return { profile: null, error: selectError };
  }
  if (existing) {
    return { profile: existing, error: null };
  }

  const { data: inserted, error: insertError } = await client
    .from('case_attorney_profiles')
    .insert({
      user_id: userId,
      email,
      full_name: fullName,
    })
    .select()
    .single();

  if (!insertError && inserted) {
    return { profile: inserted, error: null };
  }

  const dup =
    insertError &&
    (insertError.code === '23505' ||
      String(insertError.message || '').toLowerCase().includes('duplicate') ||
      String(insertError.message || '').toLowerCase().includes('unique'));

  if (dup) {
    const { data: retryRow, error: retryErr } = await client
      .from('case_attorney_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (retryErr) {
      return { profile: null, error: retryErr };
    }
    if (retryRow) {
      return { profile: retryRow, error: null };
    }
  }

  return { profile: null, error: insertError || new Error('Insert failed') };
}

window.requireAuth = requireAuth;
window.redirectIfLoggedIn = redirectIfLoggedIn;
window.logoutUser = logoutUser;
window.attachLogoutHandler = attachLogoutHandler;
window.ensureAttorneyProfile = ensureAttorneyProfile;
