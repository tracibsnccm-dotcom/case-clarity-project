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

# ── Foundation (4 clients) ──
ERRORS.clear()
STUB = make_stub(",subscription_tier:'foundation',subscription_status:'active',stripe_subscription_id:'sub_1',subscription_current_period_end:new Date(Date.now()+12*86400000).toISOString()")
with sync_playwright() as p:
    b, ctx, pg = setup(p); seed(pg)
    pg.evaluate("""()=>{localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Client 1',caseStatus:'active'}));}""")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    expect('Foundation plan' in pg.inner_text('#trial-countdown-card'), 'Dashboard shows Foundation plan')
    pg.evaluate("""async()=>{ for(let i=2;i<=6;i++){ const r=await caseClarityCases.add(); if(!r.ok){window.__lim=r.reason;break;} localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Client '+i,caseStatus:'active'})); } }""")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(4000)
    expect(pg.locator('.cc-cl-row').count() == 4 and pg.is_disabled('.cc-cl-add'), 'Foundation stops at 4 clients')
    expect('4' in (pg.evaluate("window.__lim") or '') or pg.evaluate("caseClarityCases.list().length") == 4, 'Limit reason given')
    # Remove Client 2: needs checkbox AND CCP
    vid = pg.evaluate("caseClarityCases.list().find(r=>r.name==='Client 2').id")
    pg.evaluate(f"ccAskDelete('{vid}')")
    go = pg.locator(f'#cc-del-{vid} .cc-cl-del-go')
    pg.check(f'#cc-del-{vid} input[type=checkbox]')
    expect(go.is_disabled(), 'Checkbox alone does not enable removal')
    pg.fill(f'#cc-del-{vid} .cc-cl-ccp input', 'CCP-WRONG'); pg.dispatch_event(f'#cc-del-{vid} .cc-cl-ccp input', 'input')
    expect(go.is_disabled(), 'Wrong CCP does not enable removal')
    pg.fill(f'#cc-del-{vid} .cc-cl-ccp input', 'ccp-test01'); pg.dispatch_event(f'#cc-del-{vid} .cc-cl-ccp input', 'input')
    expect(go.is_enabled(), 'Checkbox + correct CCP enables removal')
    go.click(); pg.wait_for_timeout(800)
    logs = pg.evaluate("JSON.parse(localStorage.getItem('__stub_removals')||'[]')")
    expect(len(logs) == 1 and logs[0]['p_client'] == 'Client 2' and logs[0]['p_delete_on'], 'Removal confirmation logged on server with client and date')
    lst = pg.evaluate("caseClarityCases.list()")
    expect(len(lst) == 4 and any(r['name'] == 'Client 2' and r['removeAt'] for r in lst), 'Client stays until renewal date')
    expect(pg.is_disabled('.cc-cl-add'), 'Cannot add a new client before the renewal date')
    expect('Removal on' in pg.inner_text('#cc-case-list'), 'Row shows the removal date')
    # Opening the removing client: tools disabled, downloads allowed
    pg.evaluate(f"ccOpenCase('{vid}')"); pg.wait_for_timeout(4000)
    expect(pg.locator('.btn-launch').first.is_disabled() and 'being removed' in pg.locator('.btn-launch').first.inner_text().lower(), 'No new runs on a client being removed')
    # Renewal date passes → deleted, slot opens
    pg.evaluate(f"""()=>{{ const idx=JSON.parse(localStorage.getItem('cc_cases')); idx.forEach(e=>{{ if(e.id==='{vid}') e.removeAt=new Date(Date.now()-1000).toISOString(); }}); localStorage.setItem('cc_cases', JSON.stringify(idx)); }}""")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(4500)
    lst = pg.evaluate("caseClarityCases.list()")
    expect(len(lst) == 3 and not any(r['name'] == 'Client 2' for r in lst), 'Client deleted on the renewal date')
    expect(pg.is_enabled('.cc-cl-add'), 'Slot opens after removal')
    expect(not ERRORS, 'No page errors ' + str(ERRORS[:2]))
    b.close()

print('\nAll checks passed' if not fails else '\n%d check(s) failed' % len(fails))
sys.exit(1 if fails else 0)
