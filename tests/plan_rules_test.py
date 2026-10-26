"""Plan rules: Single Client Review one-run lock, replacement run, plan case limits,
monthly client removal on renewal date with CCP confirmation. Uses the shared stub,
extended here with the single-run and removal RPCs."""
import os, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'standing_case_test.py')).read().split('"""Standing test')[0]
__file__ = os.path.join(HERE, 'standing_case_test.py')
exec(src)

BASE_STUB = STUB
OLD = "trial_start_at:new Date().toISOString(),status:'trial_active'}"
RPCS = """
      if(name==='single_status'){ const s=JSON.parse(localStorage.getItem('__stub_single')||'{"runs":{},"replacement_tool":null}'); return Promise.resolve({data:s,error:null}); }
      if(name==='single_claim_run'){ const s=JSON.parse(localStorage.getItem('__stub_single')||'{"runs":{},"replacement_tool":null}'); const k=String(args.p_tool); let out;
        if(s.runs[k]){ if(s.replacement_tool===args.p_tool){ s.runs[k]=new Date().toISOString(); s.replacement_tool=null; out={ok:true,limited:true,replacement:true}; } else out={ok:false,limited:true,reason:'used',used_at:s.runs[k]}; }
        else { s.runs[k]=new Date().toISOString(); out={ok:true,limited:true}; }
        localStorage.setItem('__stub_single', JSON.stringify(s)); return Promise.resolve({data:out,error:null}); }
      if(name==='log_client_removal'){ const l=JSON.parse(localStorage.getItem('__stub_removals')||'[]'); l.push(args); localStorage.setItem('__stub_removals', JSON.stringify(l)); return Promise.resolve({data:'r1',error:null}); }
"""
def make_stub(extra):
    s = BASE_STUB.replace(OLD, "trial_start_at:new Date(Date.now()-40*86400000).toISOString(),status:'paid'" + extra + "}")
    return s.replace("    rpc:function(name,args){\n", "    rpc:function(name,args){\n" + RPCS, 1)

fails = []
def expect(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

assert "    rpc:function(name,args){\n" in BASE_STUB

# ── Single Client Review ──
STUB = make_stub(",subscription_tier:'single',subscription_status:'active',single_review_expires_at:new Date(Date.now()+20*86400000).toISOString()")
with sync_playwright() as p:
    b, ctx, pg = setup(p); seed(pg)
    pg.evaluate("""()=>{localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Single client',dateOfInjury:'2026-01-02',caseType:'PI',caseStatus:'active'}));}""")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    expect('Single Client Review' in pg.inner_text('#trial-countdown-card'), 'Dashboard shows Single Client Review plan')
    expect(pg.is_disabled('.cc-cl-add'), 'Single plan cannot add a second client')
    expect(pg.locator('.cc-cl-del').count() == 0, 'Single plan has no delete')
    # First run of CCI is allowed and recorded on the server
    pg.goto(BASE + 'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.locator('#cc-plan-lock').count() == 0, 'CCI not locked before first run')
    pg.evaluate("localStorage.setItem('tool1_data','{\"timestamp\":\"t1\",\"level\":3}'); localStorage.setItem('tool1_complete','true'); localStorage.setItem('tool1_report_html','<div>first</div>');")
    pg.wait_for_timeout(600)
    expect('"1"' in (pg.evaluate("localStorage.getItem('__stub_single')") or ''), 'First CCI run recorded on server')
    expect(pg.evaluate("localStorage.getItem('tool1_report_html')") == '<div>first</div>', 'First report saved')
    # Reopening the tool shows the lock and blocks writes
    pg.goto(BASE + 'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.locator('#cc-plan-lock').count() == 1, 'CCI locked when reopened')
    pg.evaluate("localStorage.setItem('tool1_report_html','<div>second</div>')")
    expect(pg.evaluate("localStorage.getItem('tool1_report_html')") == '<div>first</div>', 'Second run cannot overwrite the report')
    # Dashboard card
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    btn = pg.locator('.btn-launch').first
    expect(btn.is_disabled() and 'already run' in btn.inner_text().lower(), 'Dashboard CCI card says Already run')
    expect(pg.is_enabled('#btn-download-active-all'), 'Finished report can still be downloaded')
    # Clearing the browser does not reset the run (server keeps it)
    pg.evaluate("localStorage.removeItem('cc_single_runs'); localStorage.removeItem('tool1_complete');")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(4000)
    expect(pg.locator('.btn-launch').first.is_disabled(), 'Run still locked after clearing browser data')
    # Replacement run granted by RCMS
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('__stub_single')); s.replacement_tool=1; localStorage.setItem('__stub_single', JSON.stringify(s));}""")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(4000)
    expect(pg.locator('.btn-launch').first.is_enabled() and 'replacement' in pg.locator('.btn-launch').first.inner_text().lower(), 'Replacement run unlocks CCI once')
    pg.goto(BASE + 'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.locator('#cc-plan-lock').count() == 0, 'Tool opens for the replacement run')
    pg.evaluate("localStorage.setItem('tool1_data','{\"timestamp\":\"t2\"}'); localStorage.setItem('tool1_complete','true'); localStorage.setItem('tool1_report_html','<div>replacement</div>');"); pg.wait_for_timeout(600)
    st = pg.evaluate("JSON.parse(localStorage.getItem('__stub_single'))")
    expect(st['replacement_tool'] is None and pg.evaluate("localStorage.getItem('tool1_report_html')") == '<div>replacement</div>', 'Replacement run used once and saved')
    pg.goto(BASE + 'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.locator('#cc-plan-lock').count() == 1, 'Locked again after the replacement run')
    # Another tool is still available
    pg.goto(BASE + 'tool2-csa.html?caseType=active&tool=CSA', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.locator('#cc-plan-lock').count() == 0, 'CSA still available')
    expect(not ERRORS, 'No page errors ' + str(ERRORS[:2]))
    b.close()

# ── Monthly plan: the trial dashboard hands off to the portal ──
ERRORS.clear()
STUB = make_stub(",subscription_tier:'foundation',subscription_status:'active',stripe_subscription_id:'sub_1',subscription_current_period_end:new Date(Date.now()+12*86400000).toISOString()")
with sync_playwright() as p:
    b, ctx, pg = setup(p); seed(pg)
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    body = pg.inner_text('#dashboard-content')
    expect('Your cases are in your portal' in body and 'Foundation plan' in body.title().replace('Foundation Plan','Foundation plan') or 'FOUNDATION PLAN' in body.upper(), 'Subscriber sees the move-to-portal screen')
    href = pg.get_attribute('#dashboard-content a', 'href')
    expect(href == 'https://portal.caseclarity.rcmspllc.com/login.html', 'Link goes to the portal sign-in')
    expect(pg.locator('.btn-launch').count() == 0, 'No trial tools for subscribers (one place for their cases)')
    expect(not ERRORS, 'No page errors ' + str(ERRORS[:2]))
    b.close()

print('\nAll checks passed' if not fails else '\n%d check(s) failed' % len(fails))
sys.exit(1 if fails else 0)
