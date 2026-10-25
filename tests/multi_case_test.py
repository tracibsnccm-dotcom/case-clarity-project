"""Multi-case trial test: add/switch/delete cases, closed-case labels, 10-case limit,
stale tool tab guard, compression round trip. Uses the same stub as the standing test."""
import os, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'standing_case_test.py')).read().split('"""Standing test')[0]
__file__ = os.path.join(HERE, 'standing_case_test.py')
exec(src)

fails = []
def expect(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b, ctx, pg = setup(p); seed(pg)
    pg.evaluate("""()=>{
      localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Case A',dateOfInjury:'2026-07-14',mechanism:'MVC',caseType:'PI',caseStatus:'active'}));
      localStorage.setItem('tool1_data', JSON.stringify({timestamp:'2026-10-01T00:00:00Z',level:3}));
      localStorage.setItem('tool1_complete','true');
      localStorage.setItem('tool1_report_html','<div id="rA">A report</div>');
      localStorage.setItem('cc_timeline_active', JSON.stringify([{id:'a1',date:'2026-07-14',type:'er',provider:'ER A'}]));
    }""")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(3500)
    rows = pg.locator('.cc-cl-row')
    print('   row:', rows.count(), rows.first.inner_text().replace('\n',' | ') if rows.count() else '')
    expect(rows.count() == 1 and 'Case A' in rows.first.inner_text() and 'open now' in rows.first.inner_text().lower(), 'One case listed (A, open now)')
    expect(pg.locator('input[name="active-case-status"][value="active"]').is_checked(), 'Status radio shows Active for A')

    # Add case B
    pg.click('.cc-cl-add'); pg.wait_for_timeout(3500)
    expect(pg.locator('.cc-cl-row').count() == 2, 'Two cases after add')
    expect(pg.evaluate("localStorage.getItem('tool1_data')") is None and pg.evaluate("localStorage.getItem('cc_timeline_active')") is None, 'New case starts empty')
    pg.check('input[name="active-case-status"][value="closed"]')
    expect(pg.is_visible('#cc-closed-note'), 'Closed note appears')
    pg.fill('#active-name-case-id', 'Case B'); pg.fill('#active-date-injury', '2024-01-05'); pg.select_option('#active-case-type', 'WC')
    pg.wait_for_timeout(900)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('dashboard_case_active')).caseStatus") == 'closed', 'Closed status saved')

    # Tool page for B: closed banner and closed box
    pg.goto(BASE + 'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    pg.evaluate("localStorage.setItem('tool1_report_html','<div id=\"rB\">B report</div>'); localStorage.setItem('tool1_complete','true');")
    rep = pg.evaluate("localStorage.getItem('tool1_report_html')")
    expect('Closed Case — Retrospective Review' in rep and 'B report' in rep, 'Closed banner added to B report')
    box = pg.evaluate("caseClarityRerun.boxHtml('Every 10–14 days')")
    expect('re-run dates do not apply' in box and 'cc-rerun-box' not in box, 'Closed case gets no re-run date')
    hdr = pg.evaluate("caseClarityRunningHeaderCss()")
    expect('CLOSED CASE' in hdr, 'Printed page header says closed case')

    # Switch back to A
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(3500)
    idA = pg.evaluate("caseClarityCases.list().find(r=>r.name==='Case A').id")
    idB = pg.evaluate("caseClarityCases.currentId()")
    pg.evaluate(f"ccOpenCase('{idA}')"); pg.wait_for_timeout(4000)
    expect(pg.evaluate("localStorage.getItem('tool1_report_html')") == '<div id="rA">A report</div>', 'A report restored unchanged')
    expect('ER A' in (pg.evaluate("localStorage.getItem('cc_timeline_active')") or ''), 'A timeline restored')
    expect(pg.evaluate("caseClarityCases.isClosed()") is False, 'A is not closed')
    lst = pg.evaluate("caseClarityCases.list()")
    expect(any(r['name'] == 'Case B' and r['status'] == 'closed' and r['done'] == 1 for r in lst), 'B listed as closed with 1/6')

    # Stale tab guard: tool tab opened on A, dashboard switches to B, tool tab write is blocked
    tool = ctx.new_page()
    tool.goto(BASE + 'tool2-csa.html?caseType=active&tool=CSA', wait_until='commit'); tool.wait_for_timeout(2000)
    pg.evaluate(f"ccOpenCase('{idB}')"); pg.wait_for_timeout(4000)
    tool.evaluate("localStorage.setItem('tool2_data','{\"x\":1}')")
    expect(pg.evaluate("localStorage.getItem('tool2_data')") is None, 'Stale tab cannot write into the other case')
    expect('stopped saving' in tool.inner_text('body'), 'Stale tab shows warning')
    tool.close()
    expect('Closed Case' in (pg.evaluate("localStorage.getItem('tool1_report_html')") or ''), 'B report restored with banner')

    # Summary for closed case
    summ = pg.evaluate("caseClaritySummary.buildSummaryHtml()")
    expect('Closed Case — Retrospective Review' in summ and 'Next re-run due' not in summ, 'Case summary marks closed and has no re-run date')

    # Limit of 10
    pg.evaluate("""async()=>{ for(let i=3;i<=12;i++){ const r=await caseClarityCases.add(); if(!r.ok){window.__limit=r.reason;break;} localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Case '+i,caseStatus:'active'})); } }"""); pg.wait_for_timeout(500)
    expect(pg.evaluate("caseClarityCases.list().length") == 10, 'Stops at 10 cases')
    expect('up to 10' in (pg.evaluate("window.__limit") or ''), 'Limit message given')
    pg.reload(wait_until='commit'); pg.wait_for_timeout(3500)
    expect(pg.locator('.cc-cl-row').count() == 10 and pg.is_disabled('.cc-cl-add'), 'Dashboard shows 10 and Add is disabled')

    # Delete a case with the checkbox
    victim = pg.evaluate("caseClarityCases.list().find(r=>r.name==='Case 5').id")
    pg.evaluate(f"ccAskDelete('{victim}')")
    go = pg.locator(f'#cc-del-{victim} .cc-cl-del-go')
    expect(go.is_disabled(), 'Delete disabled until box is checked')
    pg.check(f'#cc-del-{victim} input[type=checkbox]'); go.click(); pg.wait_for_timeout(4000)
    lst = pg.evaluate("caseClarityCases.list()")
    expect(len(lst) == 9 and not any(r['name'] == 'Case 5' for r in lst), 'Case deleted')
    expect(pg.evaluate(f"localStorage.getItem('cc_case_{victim}')") is None, 'Deleted case data removed')

    # Saved to account (stub)
    ws = pg.evaluate("JSON.parse(sessionStorage.getItem('__stub_ws')||'{}').data||{}")
    expect('cc_cases' in ws and any(k.startswith('cc_case_') for k in ws), 'Cases saved to account')

    # Compression
    ratio = pg.evaluate("""async()=>{ const big={tool1_report_html:'<div class="x">'+'Findings text '.repeat(30000)+'</div>'}; const s=await caseClarityCases._pack(big); const back=await caseClarityCases._unpack(s); return [s.length/JSON.stringify(big).length, back.tool1_report_html===big.tool1_report_html]; }""")
    expect(ratio[1] and ratio[0] < 0.2, 'Snapshots compress and restore exactly (ratio %.3f)' % ratio[0])
    expect(not ERRORS, 'No page errors ' + str(ERRORS[:3]))
    b.close()

print('\nAll checks passed' if not fails else '\n%d check(s) failed' % len(fails))
sys.exit(1 if fails else 0)
