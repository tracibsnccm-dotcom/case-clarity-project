"""
Standing test case — Danielle Harper (fictional PI case).

Runs the case through all six trial tools in a headless browser against a local
copy of this repo, checks the key results, and writes the complete report packet
to tests/packet.html (used to refresh sample-case.html).

Run from the repo root:
    python3 -m http.server 8765 &      # serve the repo locally
    pip install playwright && python3 -m playwright install chromium   # first time only
    python3 tests/standing_case_test.py

Supabase is replaced by tests/supabase-stub.js, so nothing touches real data.
Re-run after every change; any FAIL line means something changed or broke.
"""
from playwright.sync_api import sync_playwright
import json, time, re
BASE='http://localhost:8765/'
import os
HERE=os.path.dirname(os.path.abspath(__file__))
STUB=open(os.path.join(HERE,'supabase-stub.js')).read()
def setup(p):
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900})
    def handler(r):
        u=r.request.url
        if 'supabase-js' in u: return r.fulfill(status=200, content_type='application/javascript', body=STUB)
        if u.startswith('http://localhost'): return r.continue_()
        return r.fulfill(status=200, body='')
    ctx.route('**/*', handler)
    pg=ctx.new_page()
    pg.on('dialog', lambda d: (DIALOGS.append(d.message), d.accept()))
    pg.on('pageerror', lambda e: ERRORS.append(str(e)))
    return b,ctx,pg
DIALOGS=[]; ERRORS=[]
def seed(pg, clear=True):
    pg.goto(BASE+'login.html', wait_until='commit'); pg.wait_for_timeout(800)
    pg.evaluate("""(clear)=>{ if(clear) localStorage.clear(); localStorage.setItem('user_id','u1'); localStorage.setItem('ccp','SAMPLE'); localStorage.setItem('trial_start_at', new Date().toISOString()); localStorage.setItem('user_logged_in','true'); localStorage.setItem('email','tester@example.com'); }""", clear)

"""Standing test + sample generator: runs the Danielle Harper case through all six tools,
checks key results, and writes the complete packet HTML (packet.html)."""
import sys
FIRE='const W=ms=>new Promise(r=>setTimeout(r,ms)); const fire=e=>{e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));};'
fails=[]
def expect(cond, msg):
    print(('PASS ' if cond else 'FAIL ')+msg)
    if not cond: fails.append(msg)
with sync_playwright() as p:
    b,ctx,pg=setup(p); seed(pg)
    pg.evaluate("""()=>{localStorage.setItem('dashboard_case_active', JSON.stringify({nameCaseId:'Danielle Harper (sample)',dateOfInjury:'2026-07-14',mechanism:'Rear-end MVC at red light, ~30 mph; head struck headrest',caseType:'PI',caseStatus:'active'}));
      const ev=[['2026-07-14','','er','ER — General Hospital','CT head negative; c-spine X-ray negative; dx cervical strain; head strike, "saw stars"'],
                ['2026-07-21','2026-08-28','chiro','Chiropractor','Adjustments 2x/week; templated notes; no referral'],
                ['2026-09-02','','primary','Primary care NP','Neck pain radiating to left arm; numbness/tingling thumb and index finger'],
                ['2026-09-10','','imaging','MRI cervical spine','C5–C6 herniation, left foraminal narrowing; multilevel degenerative changes'],
                ['2026-09-17','2026-09-24','pt','Physical therapy',''],
                ['2026-10-01','','missed','Physical therapy','Car repossessed — no transportation (reason not charted)']];
      localStorage.setItem('cc_timeline_active', JSON.stringify(ev.map((e,i)=>({id:'s'+i,date:e[0],end:e[1],type:e[2],provider:e[3],note:e[4]}))));}""")
    # CCI
    pg.goto(BASE+'tool1-cci.html?caseType=active&tool=CCI', wait_until='commit'); pg.wait_for_timeout(2000)
    pg.evaluate("async()=>{"+FIRE+"""const sel=document.getElementById('primary-region'); sel.value='cervical'; fire(sel); await W(200);
      const sp=document.getElementById('specific-injury'); sp.value=[...sp.options].find(o=>/Disc Herniation/.test(o.text)).value; fire(sp);
      ['Cognitive impairment present','Chronic or severe pain','Diabetes mellitus','Hypertension','Cognitive impairment','Reduced earning capacity','Financial instability due to wage loss','Physical Therapy','Chiropractic','Diagnostic imaging delayed or denied','Specialist referral delayed','Deviation from evidence-based pathway']
        .forEach(v=>{const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value===v); if(!c.checked) c.click();});
      const ref=document.getElementById('referral'); ref.value=[...ref.options].find(o=>/Limited/.test(o.text)).value; fire(ref);
      const dur=document.getElementById('duration'); dur.value=[...dur.options].find(o=>/Extended rehab/.test(o.text)).value; fire(dur);
      await calculate();}"""); pg.wait_for_timeout(900)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('tool1_data')).level")==3, 'CCI Level 3')
    # CSA
    pg.goto(BASE+'tool2-csa.html?caseType=active&tool=CSA', wait_until='commit'); pg.wait_for_timeout(2000)
    pg.evaluate("startAudit()"); pg.wait_for_timeout(500)
    expect(pg.evaluate("answers[0]&&answers[0][0]&&answers[0][0].value")=='no', 'CSA Right #1 filled in from CCI')
    expect(pg.evaluate("document.querySelectorAll('.cc-tl-hint').length")==2, 'CSA shows timeline flags')
    pg.evaluate("""()=>{['headStrike','degenerative','symptomMag','gapReason','nerveTesting'].forEach(k=>document.getElementById('recflag-'+k).click());
      const a=document.getElementById('csa-seq-pattern'); a.value='narrow-then-broad'; a.dispatchEvent(new Event('change')); const d=document.getElementById('csa-seq-date'); d.value='2026-09-02'; d.dispatchEvent(new Event('change'));
      const A=[['no','no','no','yes'],['no','no','no','no'],['no','no','no','no'],['no','yes','not-sure'],['no','no','no','no'],['yes','no','no','no'],['no','no','no','no']];
      A.forEach((row,ri)=>row.forEach((v,qi)=>{ if(ri===0&&qi<3) return; selectSub(ri,qi,v);}));}"""); pg.wait_for_timeout(1200)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('tool2_data')).data.overallKey")=='misaligned-r1', 'CSA Structurally Misaligned')
    # CAF
    pg.goto(BASE+'tool3-caf.html?caseType=active&tool=CAF', wait_until='commit'); pg.wait_for_timeout(2000)
    pg.evaluate("""()=>{const a={D1_Q0:4,D1_Q1:5,D1_Q2:5,D1_Q3:4,D1_Q4:5,D2_Q0:5,D2_Q1:5,D2_Q2:5,D2_Q3:5,D2_Q4:5,D3_Q0:1,D3_Q1:1,D3_Q2:5,D3_Q3:2,D3_Q4:3,D4_Q0:2,D4_Q1:5,D4_Q2:1,D4_Q3:5,D4_Q4:3,D5_Q0:1,D5_Q1:2,D5_Q2:2,D5_Q3:1,D5_Q4:1};
      for(const [k,v] of Object.entries(a)){document.querySelector('label[for="'+k+'_'+v+'"]').click();}}"""); pg.wait_for_timeout(1500)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('tool3_data')).finalLevel")==1, 'CAF Level 1')
    # HSI
    pg.goto(BASE+'tool4-hsi.html?caseType=active&tool=HSI', wait_until='commit'); pg.wait_for_timeout(2000)
    pg.evaluate("startAssessment()"); pg.wait_for_timeout(400)
    expect(pg.evaluate("A[4][2]")==1, 'HSI transportation filled in from CAF')
    pg.evaluate("""()=>{const a={'0-0':3,'0-1':3,'0-2':3,'0-3':2,'0-4':2,'1-0':3,'1-1':3,'1-2':3,'1-3':3,'1-4':3,'2-0':4,'2-1':3,'2-2':2,'2-3':2,'2-4':3,'3-0':5,'3-1':2,'3-2':3,'3-3':3,'3-4':3};
      for(const [k,v] of Object.entries(a)){const box=document.getElementById('domOpts-'+k); [...box.querySelectorAll('.stage-opt')].find(x=>x.getAttribute('onclick').startsWith('pickDomainStage('+v+',')).click();}}""")
    pg.evaluate("navNext()"); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{[4,4,null,4,2,3,3,4,3].forEach((v,i)=>{ if(v==null) return; [...document.querySelectorAll('[onclick]')].find(x=>x.getAttribute('onclick')===`pickDriver(${i},${v},this)`).click();});}""")
    pg.evaluate("navNext()"); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{[2,4,4].forEach((v,i)=>[...document.querySelectorAll('[onclick]')].find(x=>x.getAttribute('onclick')===`pickDestab(${i},${v},this)`).click());}"""); pg.wait_for_timeout(1200)
    if not pg.evaluate("!!localStorage.getItem('tool4_complete')"): pg.evaluate("navNext()"); pg.wait_for_timeout(2500)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('tool4_data')).intrinsic")==2, 'HSI Unstable (2)')
    # FCI
    pg.goto(BASE+'tool5-fci.html?caseType=active&tool=FCI', wait_until='commit'); pg.wait_for_timeout(2000)
    expect(pg.evaluate("S.vulnScores.pain")==2, 'FCI pain filled in from HSI')
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(b=>/Begin Analysis/.test(b.textContent)).click();}"); pg.wait_for_timeout(300)
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(b=>/Continue to Vulnerability/.test(b.textContent)).click();}"); pg.wait_for_timeout(400)
    pg.evaluate("()=>{['fvi-income','fvi-dep','fvi-sole'].forEach(id=>{const s=document.getElementById(id); s.value='prefer'; s.dispatchEvent(new Event('change',{bubbles:true}));});}"); pg.wait_for_timeout(300)
    pg.evaluate("()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null); bs.filter(b=>/moderate/i.test(b.textContent))[1].click();}"); pg.wait_for_timeout(300)
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&/Begin Assessment/.test(b.textContent)).click();}"); pg.wait_for_timeout(400)
    for dom in ['physical','psychological','psychosocial','professional']:
        pg.evaluate(f"document.querySelector('.level-card[data-domain=\"{dom}\"][data-score=\"3\"]').click()"); pg.wait_for_timeout(200)
        pg.evaluate("()=>{[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&/Next Domain|Finish/.test(b.textContent)).click();}"); pg.wait_for_timeout(600)
    expect(pg.evaluate("!!localStorage.getItem('tool5_complete')"), 'FCI complete')
    # RRF
    pg.goto(BASE+'tool6-rrf.html?caseType=active&tool=RRF', wait_until='commit'); pg.wait_for_timeout(2200)
    expect(pg.evaluate("document.getElementById('pi_altTransport').value")=='10', 'RRF transportation filled in from CAF')
    pg.evaluate("async()=>{"+FIRE+"""let b=[...document.querySelectorAll('button')].find(b=>/Continue to Access Form/.test(b.textContent)); if(b) b.click(); await W(300);
      b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).find(b=>/^\\s*Personal Injury/.test(b.textContent)); b.click(); await W(500);
      const v={pi_vehicleDamaged:'10',pi_liabilityOnly:'0',pi_waitingOtherInsurer:'0',pi_income:'na',pi_dependents:'na',pi_hourly:'na',pi_tenure:'na',pi_singleParent:'na',pi_caregiving:'0',pi_accessFriction:'4',pi_psych:'8',pi_comm:'0',pi_follow:'4'};
      for(const [k,x] of Object.entries(v)){const s=document.getElementById(k); s.value=x; fire(s);}
      const d=document.getElementById('pi_severityDomain'); const vals={structural:'1.15',neuro:'1.10',regions:'1.10',surgical:'1',chronic:'1.10',healing:'1.40'};
      for(const [k,x] of Object.entries(vals)){d.value=k; fire(d); await W(200); const s=document.getElementById('pi_severity_active'); s.value=x; fire(s); await W(120);}
      [...document.querySelectorAll('button')].find(b=>/Calculate PI Risk/.test(b.textContent)).click();}"""); pg.wait_for_timeout(2500)
    expect(pg.evaluate("JSON.parse(localStorage.getItem('tool6_data')).level")=='Moderate', 'RRF Moderate')
    vis=pg.evaluate("document.getElementById('rrf-paid-report-visible').innerText")
    expect('/ 100' not in vis and 'Estimated treatment duration' not in vis and not re.search(r'treatment course:[^\n]*\d+ days', vis, re.I), 'RRF shows no score or day count')
    # Dashboard packet
    pg.goto(BASE+'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4500)
    pg.evaluate("()=>{window.__printed=null; window.caseClarityPrintDocument=function(h){window.__printed=h;};}")
    pg.evaluate("printActiveReports()"); pg.wait_for_timeout(1500)
    h=pg.evaluate("window.__printed") or ''
    expect('Case Summary' in h and 'Case Timeline' in h, 'Packet has Case Summary and Timeline')
    expect('MMI' not in h, 'No MMI anywhere')
    expect(not re.search(r'(Case|Client|DOI):\s*(<[^>]+>\s*)*—', h), 'No blank case identifiers')
    open(os.path.join(HERE,'packet.html'),'w').write(h)
    print('errors', ERRORS[:5]); expect(not ERRORS, 'No page errors')
    b.close()
print('\n%d check(s) failed' % len(fails) if fails else '\nAll checks passed')
sys.exit(1 if fails else 0)
