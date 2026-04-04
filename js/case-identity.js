/**
 * CASE Clarity — case identity card (same markup as case-detail Case overview).
 */
(function (global) {
  var SELECT =
    'id, case_ref, case_title, client_name, date_of_injury, case_type, client_identifier, case_status, created_at';

  function formatCaseType(code) {
    if (code == null || code === '') return '—';
    var map = {
      PI: 'Personal Injury (PI)',
      WC: "Workers' Compensation (WC)",
      Disability: 'Disability',
    };
    return map[code] || String(code);
  }

  function formatInjuryDate(val) {
    if (val == null || val === '') return '—';
    var d =
      val instanceof Date
        ? val
        : new Date(val + (String(val).length <= 10 ? 'T12:00:00' : ''));
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  function formatCreationDate(val) {
    if (val == null || val === '') return '—';
    var d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function cardHTML() {
    function metaLine(inner) {
      return (
        '<div class="case-clarity-identity-meta-item">' +
        '<p class="case-clarity-identity-line">' +
        inner +
        '</p></div>'
      );
    }
    return (
      '<div class="case-clarity-identity-card">' +
      '<div class="case-clarity-identity-card-head">' +
      '<p class="case-clarity-identity-card-title">Case overview</p>' +
      '</div>' +
      '<div class="case-clarity-identity-primary">' +
      '<p class="case-clarity-identity-line case-clarity-identity-line--hero">' +
      '<strong>Case Title:</strong> ' +
      '<span class="case-clarity-identity-hero-value" data-case-identity="case_title">—</span>' +
      '</p>' +
      '</div>' +
      '<div class="case-clarity-identity-secondary">' +
      '<p class="case-clarity-identity-line">' +
      '<strong>Client Name:</strong> ' +
      '<span data-case-identity="client_name">—</span>' +
      '</p>' +
      '<p class="case-clarity-identity-line">' +
      '<strong>Case Type:</strong> ' +
      '<span data-case-identity="case_type">—</span>' +
      '</p>' +
      '</div>' +
      '<div class="case-clarity-identity-meta">' +
      metaLine(
        '<strong>System Identifier:</strong> <span data-case-identity="case_ref">—</span>'
      ) +
      metaLine(
        '<strong>Date of Injury / Loss:</strong> <span data-case-identity="date_of_injury">—</span>'
      ) +
      metaLine(
        '<strong>Client Identifier:</strong> <span data-case-identity="client_identifier">—</span>'
      ) +
      metaLine('<strong>Status:</strong> <span data-case-identity="case_status">—</span>') +
      metaLine(
        '<strong>Creation Date:</strong> <span data-case-identity="created_at">—</span>'
      ) +
      '</div>' +
      '</div>'
    );
  }

  function fillFields(root, row) {
    if (!root) return;
    row = row || {};
    root.querySelectorAll('[data-case-identity]').forEach(function (span) {
      var key = span.getAttribute('data-case-identity');
      var v = '—';
      if (key === 'case_ref') {
        v = row.case_ref != null ? String(row.case_ref) : '—';
      } else if (key === 'case_title') {
        v = row.case_title || '—';
      } else if (key === 'client_name') {
        v = row.client_name || '—';
      } else if (key === 'date_of_injury') {
        v = formatInjuryDate(row.date_of_injury);
      } else if (key === 'case_type') {
        v = formatCaseType(row.case_type);
      } else if (key === 'client_identifier') {
        v = row.client_identifier || '—';
      } else if (key === 'case_status') {
        v = row.case_status
          ? row.case_status.charAt(0).toUpperCase() + row.case_status.slice(1)
          : '—';
      } else if (key === 'created_at') {
        v = formatCreationDate(row.created_at);
      }
      span.textContent = v;
    });
  }

  /**
   * @param {string|HTMLElement} mountId - element id or node to replace contents
   * @param {import('@supabase/supabase-js').SupabaseClient} client
   */
  async function mount(mountId, client) {
    var el =
      typeof mountId === 'string'
        ? document.getElementById(mountId)
        : mountId;
    if (!el) return;
    var params = new URLSearchParams(window.location.search);
    var caseRef = params.get('case_ref');
    el.innerHTML = cardHTML();
    var root = el.firstElementChild;
    if (!caseRef || !client) {
      fillFields(root, null);
      return;
    }
    var sessRes = await client.auth.getSession();
    var session = sessRes.data && sessRes.data.session;
    if (!session) {
      fillFields(root, null);
      return;
    }
    var res = await client
      .from('case_cases')
      .select(SELECT)
      .eq('case_ref', caseRef)
      .eq('attorney_user_id', session.user.id)
      .maybeSingle();
    fillFields(root, res.data);
  }

  /** Fixed container id for paid tool pages (portal header → Case overview → tool body). */
  var TOOL_PAGE_CONTAINER_ID = 'case-header-fields';

  /**
   * Mount shared Case overview into the standard tool container.
   * @param {import('@supabase/supabase-js').SupabaseClient} client
   */
  function mountToolPage(client) {
    return mount(TOOL_PAGE_CONTAINER_ID, client);
  }

  global.caseClarityIdentity = {
    SELECT: SELECT,
    TOOL_PAGE_CONTAINER_ID: TOOL_PAGE_CONTAINER_ID,
    cardHTML: cardHTML,
    fillFields: fillFields,
    mount: mount,
    mountToolPage: mountToolPage,
    formatCaseType: formatCaseType,
    formatInjuryDate: formatInjuryDate,
    formatCreationDate: formatCreationDate,
  };
})(typeof window !== 'undefined' ? window : this);
