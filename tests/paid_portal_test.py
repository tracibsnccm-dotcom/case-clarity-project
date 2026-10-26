"""Paid portal test: runs the standing sample case through the PAID PORTAL's copies of the
six tools (built by tools/build-paid-portal.py), in paid mode (?case_ref=...).

Serve the paid portal first:  (cd ../case-clarity-paid-portal && python3 -m http.server 8766)
Checks the same results as the trial, that each run is saved to case_tool_runs, and that
nothing from the trial's own case data leaks into a paid case."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'standing_case_test.py')).read()

PAID_ROWS = """
    if(table==='case_cases') res.data={id:'case-1',case_ref:'CC-0001',case_title:'Danielle Harper',client_name:'Danielle Harper',date_of_injury:'2026-07-14',case_type:'PI',client_identifier:null,case_status:(localStorage.getItem('__stub_closed')==='1'?'closed':'active'),created_at:new Date().toISOString(),is_locked:false,attorney_user_id:'u1'};
    if(table==='case_attorney_profiles') res.data={id:'p1',user_id:'u1',is_portal_admin:false};
    if(table==='trial_users' && localStorage.getItem('__stub_unsubscribed')!=='1') res.data=Object.assign({}, res.data, {subscription_status:'active', subscription_tier:'professional'});
    if(table==='case_tool_runs'){ var rr=localStorage.getItem('__stub_run_row'); if(rr) res.data=JSON.parse(rr); }
"""
REC_INSERT = """    b.insert=function(x){ try{ var l=JSON.parse(localStorage.getItem('__stub_inserts')||'[]'); l.push({table:table,row:x}); localStorage.setItem('__stub_inserts', JSON.stringify(l)); }catch(e){} return b; };
    b.single="""

# 1. Paid portal server, paid URLs.
src = src.replace("BASE='http://localhost:8765/'", "BASE='http://localhost:8766/'")
src = src.replace("?caseType=active&tool=", "?case_ref=CC-0001&tool=")
# 2. Stub answers for the portal's tables, and records inserts.
src = src.replace("STUB=open(os.path.join(HERE,'supabase-stub.js')).read()",
                  "STUB=open(os.path.join(HERE,'supabase-stub.js')).read().replace(\"    var b={};\", " + repr(PAID_ROWS) + " + \"    var b={};\", 1).replace(\"    b.single=\", " + repr(REC_INSERT) + ", 1)")
# 3. Trial leftovers in the same browser must not leak in: seed a different trial case + timeline.
src = src.replace("""      localStorage.setItem('cc_timeline_active',""", """      localStorage.setItem('cc_shared_active', JSON.stringify({pain:{value:5,source:'CCI',at:new Date().toISOString()}}));
      localStorage.setItem('cc_timeline_active',""")
# 4. Paid has no case timeline yet.
src = src.replace("""expect(pg.evaluate("document.querySelectorAll('.cc-tl-hint').length")==2, 'CSA shows timeline flags')""",
                  """expect(pg.evaluate("document.querySelectorAll('.cc-tl-hint').length")==0, 'Paid case shows no trial timeline flags')""")
# 4b. The paid case has no dashboard mechanism text; the attorney chooses it in the RRF.
src = src.replace("""      [...document.querySelectorAll('button')].find(b=>/Calculate PI Risk/.test(b.textContent)).click();}""",
                  """      const mm=document.getElementById('pi_mechanism'); if(mm.value===''){ mm.selectedIndex=[...mm.options].findIndex(o=>/Motor Vehicle/i.test(o.text)); fire(mm); }
      [...document.querySelectorAll('button')].find(b=>/Calculate PI Risk/.test(b.textContent)).click();}""")
# 5. Replace the trial dashboard packet section with paid checks.
start = src.index("    # Dashboard packet")
end = src.index("    print('errors', ERRORS[:5])")
src = src[:start] + """    # Paid checks
    ins = pg.evaluate("JSON.parse(localStorage.getItem('__stub_inserts')||'[]')")
    runs = [i for i in ins if i['table'] == 'case_tool_runs']
    keys = sorted(set(r['row'].get('tool_key') for r in runs))
    print('   saved runs:', keys)
    expect(len(keys) == 6, 'All six tool runs saved to case_tool_runs')
    expect(all(r['row'].get('case_id') == 'case-1' and r['row'].get('result_json') for r in runs), 'Runs saved to the right case with results')
    sh = pg.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('cc_shared_')===0)")
    expect('cc_shared_case_CC-0001' in sh, 'Shared answers kept per paid case')
    cci = [r['row'] for r in runs if r['row'].get('tool_key') == 'CCI'][-1]
    expect('Re-run this assessment by' in (cci['result_json'].get('report_html') or ''), 'Finished report saved with the run')
    row = dict(cci, id='run-1', is_latest=True, run_number=1, completed_at='2026-10-25T20:00:00Z')
    pg.evaluate("r=>localStorage.setItem('__stub_run_row', JSON.stringify(r))", row)
    pg.goto(BASE+'saved-report-viewer.html?run_id=run-1&case_ref=CC-0001', wait_until='commit'); pg.wait_for_timeout(3500)
    fr = pg.frame_locator('#cc-saved-report-frame')
    txt = fr.locator('body').inner_text() if pg.locator('#cc-saved-report-frame').count() else ''
    expect('re-run this assessment by' in txt.lower() and 'case complexity' in txt.lower(), 'Saved-report viewer shows the report as generated')
    pg.screenshot(path=os.path.join(HERE, 'paid_viewer.png'), full_page=True)
    hdr = pg.inner_text('#user-email') if pg.locator('#user-email').count() else ''
    expect('CCP-TEST01' in hdr, 'Portal header shows the CCP number')
    # A case marked Closed in the portal gets the closed-case report treatment
    pg.evaluate("localStorage.setItem('__stub_closed','1')")
    pg.goto(BASE+'tool1-cci.html?case_ref=CC-0001&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2500)
    expect(pg.evaluate("caseClarityClosed.isClosed()") is True and 'do not apply' in pg.evaluate("caseClarityRerun.boxHtml('Every 10–14 days')"), 'Closed portal case: no re-run date')
    pg.evaluate("localStorage.setItem('tool1_report_html','<div>x</div>')")
    expect('Retrospective Review' in pg.evaluate("localStorage.getItem('tool1_report_html')"), 'Closed portal case: report banner')
    pg.evaluate("localStorage.removeItem('__stub_closed')")
    # Not a subscriber: sent to the subscription page
    pg.evaluate("localStorage.setItem('__stub_unsubscribed','1'); sessionStorage.removeItem('cc_portal_access');")
    pg.goto(BASE+'dashboard.html', wait_until='commit'); pg.wait_for_timeout(3000)
    expect(pg.url.endswith('subscribe.html'), 'Non-subscriber is sent to the subscription page')
    pg.evaluate("localStorage.removeItem('__stub_unsubscribed')")
    # Sign-in page: email link only, no password
    ctx.clear_cookies()
    pg.goto(BASE+'login.html', wait_until='commit'); pg.wait_for_timeout(300)
    pg.evaluate("window.redirectIfLoggedIn=async()=>false")
    expect(pg.locator('#password').count() == 0, 'No password field on sign-in')
    tr = pg.evaluate("JSON.parse(localStorage.getItem('cc_shared_active')||'{}')")
    expect(list(tr.keys()) == ['pain'], 'Trial shared answers untouched by the paid case')
""" + src[end:]
# Shared answers for this paid case start empty, so the "filled in from" checks still apply
# because each tool records its own answers into the paid case's set.
__file__ = os.path.join(HERE, 'standing_case_test.py')
exec(compile(src, 'paid_portal_test', 'exec'))
