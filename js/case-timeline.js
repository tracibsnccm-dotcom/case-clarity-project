/*
 * C.A.S.E. Clarity — case timeline with automatic gap flags.
 * The attorney lists care events (ER, primary care, chiropractic, PT, specialist,
 * imaging, nerve testing, referrals, missed appointments). The timeline sorts
 * them and flags:
 *   - first treatment more than 72 hours after the date of injury
 *   - a gap of more than 30 days between care events
 *   - a referral with no specialist visit within 30 days after it
 *   - radiating / nerve symptoms noted with no nerve testing recorded
 *   - dates in the future
 * Saved in localStorage cc_timeline_active (synced to the account).
 */
(function (global) {
  var GAP_DAYS = 30;
  var FIRST_CARE_HOURS = 72;
  var TYPES = [
    ['er', 'Emergency room / urgent care'],
    ['primary', 'Primary care visit (MD, DO, NP, PA)'],
    ['specialist', 'Specialist visit'],
    ['chiro', 'Chiropractic visit(s)'],
    ['pt', 'Physical therapy visit(s)'],
    ['imaging', 'Imaging (X-ray, CT, MRI)'],
    ['nerve', 'Nerve testing (EMG / NCS)'],
    ['referral', 'Referral made'],
    ['missed', 'Missed or canceled appointment'],
    ['symptom', 'New or changed symptom reported'],
    ['other', 'Other event']
  ];
  var CARE = { er: 1, primary: 1, specialist: 1, chiro: 1, pt: 1, imaging: 1, nerve: 1 };
  var mountedId = null;

  function key() { return 'cc_timeline_active'; }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function save(list) { try { localStorage.setItem(key(), JSON.stringify(list)); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function d(iso) { var x = new Date(iso + 'T12:00:00'); return isNaN(x.getTime()) ? null : x; }
  function fmt(iso) { var x = d(iso); return x ? x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function days(a, b) { return Math.round((b - a) / 86400000); }
  function typeLabel(t) { var f = TYPES.find(function (x) { return x[0] === t; }); return f ? f[1] : t; }
  function caseInfo() { try { return JSON.parse(localStorage.getItem('dashboard_case_active') || '{}') || {}; } catch (e) { return {}; } }

  function sorted() {
    return load().slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }

  /** Flags computed from the timeline. Each: {level:'high'|'medium', text} */
  function flags() {
    var list = sorted().filter(function (e) { return d(e.date); });
    var out = [];
    var today = new Date();
    var doi = d(caseInfo().dateOfInjury || '');
    var care = list.filter(function (e) { return CARE[e.type]; });

    list.forEach(function (e) {
      if (d(e.date) > today) out.push({ level: 'medium', text: typeLabel(e.type) + ' is dated ' + fmt(e.date) + ', which is in the future. Check the date.' });
    });
    if (doi && care.length) {
      var first = care[0];
      var h = (d(first.date) - doi) / 3600000;
      if (h > FIRST_CARE_HOURS) out.push({ level: 'high', text: 'First treatment (' + typeLabel(first.type) + ', ' + fmt(first.date) + ') was ' + days(doi, d(first.date)) + ' days after the injury. Document the reason for the delay.' });
    }
    // Gaps: compare each care event's start with the latest care date seen so far
    // (a visit series counts through its "through" date).
    var lastIso = null;
    for (var i = 0; i < care.length; i++) {
      var startIso = care[i].date;
      if (lastIso) {
        var gap = days(d(lastIso), d(startIso));
        if (gap > GAP_DAYS) {
          var why = list.filter(function (e) { return e.type === 'missed' && d(e.date) >= d(lastIso) && d(e.date) <= d(startIso) && e.note; });
          out.push({ level: why.length ? 'medium' : 'high',
            text: 'Gap of ' + gap + ' days in care (' + fmt(lastIso) + ' to ' + fmt(startIso) + ').' +
            (why.length ? ' Reason noted: ' + why.map(function (w) { return w.note; }).join('; ') + '. Make sure the reason is in the medical record, not only here.'
                        : ' No reason is recorded. Document it now, before it is read as non-compliance.') });
        }
      }
      var endIso = care[i].end && d(care[i].end) ? care[i].end : startIso;
      if (!lastIso || endIso > lastIso) lastIso = endIso;
    }
    list.filter(function (e) { return e.type === 'referral'; }).forEach(function (r) {
      var rd = d(r.date);
      var seen = list.some(function (e) { return e.type === 'specialist' && d(e.date) >= rd && days(rd, d(e.date)) <= GAP_DAYS; });
      var later = list.some(function (e) { return e.type === 'specialist' && d(e.date) >= rd; });
      if (!seen && days(rd, today) > GAP_DAYS) out.push({ level: 'high', text: 'Referral on ' + fmt(r.date) + (r.provider ? ' (' + r.provider + ')' : '') + (later ? ' was not completed within 30 days.' : ' has no specialist visit recorded after it.') });
    });
    var nerveSym = list.some(function (e) { return /radiat|numb|tingl|weak|radicul|shooting/i.test((e.note || '') + ' ' + (e.provider || '')); });
    var nerveTest = list.some(function (e) { return e.type === 'nerve'; });
    if (nerveSym && !nerveTest) out.push({ level: 'medium', text: 'Radiating or nerve symptoms are noted, but no nerve testing (EMG/NCS) is recorded.' });
    return out;
  }

  function flagsHtml(fl) {
    if (!fl.length) return '<p style="margin:8px 0 0;font-size:13px;color:#1a5c3a">No timing flags from the events entered so far.</p>';
    return '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.55">' + fl.map(function (f) {
      return '<li style="margin-bottom:4px;color:' + (f.level === 'high' ? '#7a1a1a' : '#7a4a00') + '">' + esc(f.text) + '</li>';
    }).join('') + '</ul>';
  }

  function listHtml() {
    var list = sorted();
    if (!list.length) return '<p style="font-size:13px;color:#6a7a8a;margin:8px 0">No events yet. Add the first visit after the injury, then each visit, test, referral or missed appointment.</p>';
    var doi = d(caseInfo().dateOfInjury || '');
    return '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><thead><tr style="background:#f4f1ea">' +
      '<th style="text-align:left;padding:6px 8px">Date</th><th style="text-align:left;padding:6px 8px">Event</th><th style="text-align:left;padding:6px 8px">Provider / facility</th><th style="text-align:left;padding:6px 8px">Note</th><th></th></tr></thead><tbody>' +
      list.map(function (e) {
        var since = doi && d(e.date) ? ' <span style="color:#8a8a8a;font-size:11px">(day ' + days(doi, d(e.date)) + ')</span>' : '';
        var thru = e.end ? '<br><span style="font-size:11px;color:#5a6a7a">through ' + esc(fmt(e.end)) + '</span>' : '';
        return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">' + esc(fmt(e.date)) + since + thru + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(typeLabel(e.type)) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(e.provider || '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + esc(e.note || '') + '</td>' +
          '<td class="no-print" style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right"><button type="button" data-cc-tl-del="' + esc(e.id) + '" style="background:none;border:1px solid #c4ced8;color:#5a6a7a;padding:3px 8px;cursor:pointer;font-size:12px">Remove</button></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function render() {
    var el = mountedId && document.getElementById(mountedId);
    if (!el) return;
    el.innerHTML =
      '<div class="cc-timeline" style="background:#fff;border:1px solid #d6d0c4;border-top:3px solid #0c1c34;padding:20px 24px;margin:0 0 24px">' +
      '<h2 style="font-size:20px;margin:0 0 6px">Case Timeline</h2>' +
      '<p style="font-size:13px;color:#4a5568;margin:0 0 12px;line-height:1.5">List each visit, test, referral and missed appointment from the records. The timeline flags delays and gaps automatically. Optional, but it makes the timing questions much easier to answer.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
      '<label style="font-size:12px;color:#4a5568">Date<br><input type="date" id="cc-tl-date" style="padding:6px;border:1px solid #c4ced8"></label>' +
      '<label style="font-size:12px;color:#4a5568">Through (if a series of visits)<br><input type="date" id="cc-tl-end" style="padding:6px;border:1px solid #c4ced8"></label>' +
      '<label style="font-size:12px;color:#4a5568">Event<br><select id="cc-tl-type" style="padding:6px;border:1px solid #c4ced8;max-width:260px">' +
      TYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label style="font-size:12px;color:#4a5568">Provider / facility<br><input type="text" id="cc-tl-provider" placeholder="e.g. Dr. Lee, NP" style="padding:6px;border:1px solid #c4ced8;width:170px"></label>' +
      '<label style="font-size:12px;color:#4a5568;flex:1;min-width:180px">Note<br><input type="text" id="cc-tl-note" placeholder="e.g. car repossessed — no transportation" style="padding:6px;border:1px solid #c4ced8;width:100%"></label>' +
      '<button type="button" id="cc-tl-add" style="background:#0c1c34;color:#fff;border:none;padding:8px 18px;cursor:pointer">Add event</button></div>' +
      '<div id="cc-tl-list">' + listHtml() + '</div>' +
      '<div style="margin-top:14px;padding:10px 14px;background:#fafbfc;border-left:4px solid #b09837"><div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#0c1c34">Timeline flags</div>' + flagsHtml(flags()) + '</div>' +
      '</div>';
    var add = document.getElementById('cc-tl-add');
    if (add) add.onclick = function () {
      var date = document.getElementById('cc-tl-date').value;
      if (!date) { alert('Please enter the date of the event.'); return; }
      var list = load();
      list.push({
        id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: date,
        end: (function () { var v = document.getElementById('cc-tl-end').value; return v && v >= date ? v : ''; })(),
        type: document.getElementById('cc-tl-type').value,
        provider: document.getElementById('cc-tl-provider').value.trim(),
        note: document.getElementById('cc-tl-note').value.trim()
      });
      save(list);
      render();
    };
    el.querySelectorAll('[data-cc-tl-del]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-cc-tl-del');
        save(load().filter(function (e) { return e.id !== id; }));
        render();
      };
    });
  }

  function mount(id) { mountedId = id; render(); }

  /** Printable timeline section for the complete report (empty when no events). */
  function reportHtml() {
    var list = sorted();
    if (!list.length) return '';
    return '<section style="font-family:system-ui,Segoe UI,sans-serif;color:#1a2e3f;page-break-after:always;break-after:page">' +
      '<h2 style="font-size:18px;color:#0c1c34;margin:0 0 4px">Case Timeline</h2>' +
      '<p style="font-size:12px;color:#6a7a8a;margin:0 0 6px">Events entered by the attorney from the records.</p>' +
      listHtml().replace(/<td class="no-print"[\s\S]*?<\/td>/g, '').replace('<th></th>', '') +
      '<div style="margin-top:12px;padding:10px 14px;background:#fafbfc;border-left:4px solid #b09837"><div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#0c1c34">Timeline flags</div>' + flagsHtml(flags()) + '</div>' +
      '</section>';
  }

  global.caseClarityTimeline = { mount: mount, flags: flags, reportHtml: reportHtml, events: sorted, GAP_DAYS: GAP_DAYS };
})(typeof window !== 'undefined' ? window : this);
