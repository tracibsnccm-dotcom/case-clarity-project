"""Portal import test: a subscriber's trial cases move into the paid portal on first sign-in.

Serve the paid portal on 8766 first. Uses its own stub that tracks inserts and filters."""
import os, sys, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8766/'
STUB = r"""
(function(){
  function L(k,d){ try{ return JSON.parse(localStorage.getItem(k)||'null') || d; }catch(e){ return d; } }
  function S(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function q(table){
    var f={}, op='select', payload=null;
    var b={};
    ['select','in','order','limit','neq','is','gte','lte','filter','match'].forEach(function(m){ b[m]=function(){ return b; }; });
    b.eq=function(k,v){ f[k]=v; return b; };
    b.update=function(x){ op='update'; payload=x; return b; };
    b.insert=function(x){ op='insert'; payload=Array.isArray(x)?x[0]:x; return b; };
    function result(){
      if(table==='trial_users') return {id:'u1',ccp:'CCP-TEST01',email:'a@firm.com',subscription_status:'active',subscription_tier:'professional',portal_import_done_at: localStorage.getItem('__imported')||null};
      if(table==='case_attorney_profiles') return {id:'p1',user_id:'u1',is_portal_admin:false};
      if(table==='case_cases'){
        var cs=L('__cases',[]);
        if(op==='insert'){ var n=cs.length+1; var row=Object.assign({id:'case-'+n,case_ref:'CC-000'+n,created_at:new Date().toISOString()},payload); cs.push(row); S('__cases',cs); return row; }
        if(f.trial_case_key) return cs.filter(function(c){return c.trial_case_key===f.trial_case_key;})[0]||null;
        return cs;
      }
      if(table==='case_tool_runs'){
        var rs=L('__runs',[]);
        if(op==='insert'){ rs.push(payload); S('__runs',rs); return payload; }
        return rs;
      }
      return null;
    }
    b.single=function(){ return Promise.resolve({data:result(),error:null}); };
    b.maybeSingle=function(){ return Promise.resolve({data:result(),error:null}); };
    b.then=function(r,j){ var d=result(); return Promise.resolve({data:Array.isArray(d)?d:(d?[d]:[]),error:null}).then(r,j); };
    return b;
  }
  var sess={user:{id:'u1',email:'a@firm.com'},access_token:'x'};
  var client={
    auth:{getSession:function(){return Promise.resolve({data:{session:sess},error:null});},
          getUser:function(){return Promise.resolve({data:{user:sess.user},error:null});},
          onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};},
          signOut:function(){return Promise.resolve({});}},
    from:q,
    rpc:function(name,args){
      if(name==='trial_workspace_get') return Promise.resolve({data:[{data:L('__ws',{}),updated_at:new Date().toISOString()}],error:null});
      if(name==='cc_portal_client_limit'){ var lm=localStorage.getItem('__limit'); return Promise.resolve({data:{plan:'foundation',limit:lm?Number(lm):null,used:L('__cases',[]).length},error:null}); }
      if(name==='trial_workspace_save'){ S('__ws', args.p_data); return Promise.resolve({data:new Date().toISOString(),error:null}); }
      if(name==='cc_mark_portal_import'){ localStorage.setItem('__imported', new Date().toISOString()); return Promise.resolve({data:new Date().toISOString(),error:null}); }
      return Promise.resolve({data:1,error:null});
    },
    functions:{invoke:function(){return Promise.resolve({data:null,error:null});}}
  };
  window.supabase={createClient:function(){return client;}};
})();
"""

fails = []
def expect(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    ctx.route('**/*', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB) if 'supabase-js' in r.request.url
              else (r.continue_() if r.request.url.startswith('http://localhost') else r.fulfill(status=200, body='')))
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + 'login.html', wait_until='commit'); pg.wait_for_timeout(500)
    # Build a trial workspace: an open case (3 tools) and a closed case kept as a gzip snapshot.
    pg.evaluate("""async()=>{
      localStorage.clear();
      const open = {
        dashboard_case_active: JSON.stringify({nameCaseId:'D. Harper',dateOfInjury:'2026-07-14',caseType:'PI',caseStatus:'active'}),
        tool1_data: JSON.stringify({timestamp:'2026-10-20T15:00:00Z',level:3,caseType:'PI',assessmentData:{levelName:'Significant',composite:3}}),
        tool1_complete:'true', tool1_report_html:'<div class="r">CCI report A</div>',
        tool2_data: JSON.stringify({timestamp:'2026-10-20T16:00:00Z',data:{overallKey:'misaligned-r1',overallLabel:'Structurally Misaligned'}}),
        tool2_complete:'true', tool2_report_html:'<div class="r">CSA report A</div>',
        tool6_data: JSON.stringify({timestamp:'2026-10-21T10:00:00Z',branch:'PI',level:'Moderate',predictedDays:300}),
        tool6_complete:'true', tool6_report_html:'<div class="r">RRF report A</div>',
        cc_shared_active: JSON.stringify({pain:{value:2,source:'HSI',at:'2026-10-20T00:00:00Z'}})
      };
      const closed = {
        dashboard_case_active: JSON.stringify({nameCaseId:'M. Lopez',dateOfInjury:'2023-03-02',caseType:'WC',caseStatus:'closed'}),
        tool3_data: JSON.stringify({timestamp:'2026-10-22T09:00:00Z',finalLevel:1,determiningDomainTitle:'Transportation & Travel Access'}),
        tool3_complete:'true', tool3_report_html:'<div class="r">CAF report B closed</div>'
      };
      const stream = new Blob([JSON.stringify(closed)]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      let s=''; for (let i=0;i<buf.length;i++) s+=String.fromCharCode(buf[i]);
      const ws = Object.assign({}, open, { cc_current_case:'cAAA', cc_cases: JSON.stringify([{id:'cAAA'},{id:'cBBB'}]), cc_case_cBBB: 'g:'+btoa(s) });
      localStorage.setItem('__ws', JSON.stringify(ws));
      localStorage.setItem('__ws_orig', JSON.stringify(ws));
    }""")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    cases = pg.evaluate("JSON.parse(localStorage.getItem('__cases')||'[]')")
    runs = pg.evaluate("JSON.parse(localStorage.getItem('__runs')||'[]')")
    names = sorted(c['client_name'] for c in cases)
    expect(names == ['D. Harper', 'M. Lopez'], 'Both trial cases moved (open and closed)')
    lopez = [c for c in cases if c['client_name'] == 'M. Lopez'][0]
    expect(lopez['case_status'] == 'closed' and lopez['case_type'] == 'WC' and lopez['date_of_injury'] == '2023-03-02', 'Closed case keeps status, type, and date of injury')
    expect(sorted(r['tool_key'] for r in runs) == ['CAF', 'CCI', 'CSA', 'RRF'], 'Every completed tool moved as a saved run')
    cci = [r for r in runs if r['tool_key'] == 'CCI'][0]
    expect(cci['result_json'].get('report_html') == '<div class="r">CCI report A</div>' and cci['completed_at'] == '2026-10-20T15:00:00Z', 'Report moved exactly, with its original date')
    expect(cci['score_summary'].get('level') == 3, 'Score summary filled in')
    expect('We brought over 2 cases' in pg.inner_text('#trial-import-note'), 'Dashboard says the cases were brought over')
    ref = [c for c in cases if c['client_name'] == 'D. Harper'][0]['case_ref']
    expect('pain' in (pg.evaluate(f"localStorage.getItem('cc_shared_case_{ref}')") or ''), 'Carried-over answers kept with the moved case')
    expect(bool(pg.evaluate("localStorage.getItem('__imported')")), 'Move marked as done')
    # Opening the dashboard again copies nothing twice
    pg.reload(wait_until='commit'); pg.wait_for_timeout(3500)
    expect(len(pg.evaluate("JSON.parse(localStorage.getItem('__cases')||'[]')")) == 2, 'Nothing copied twice')
    # Even if the done-mark were lost, the per-case tag prevents duplicates
    pg.evaluate("localStorage.removeItem('__imported')")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(3500)
    expect(len(pg.evaluate("JSON.parse(localStorage.getItem('__cases')||'[]')")) == 2 and len(pg.evaluate("JSON.parse(localStorage.getItem('__runs')||'[]')")) == 4, 'Per-case tag also prevents duplicates')
    # ── More trial cases than the plan allows: the attorney chooses ──
    ws = pg.evaluate("localStorage.getItem('__ws_backup')")
    pg.evaluate("()=>{ const w=localStorage.getItem('__ws_orig'); localStorage.clear(); localStorage.setItem('__ws', w); localStorage.setItem('__limit','1'); sessionStorage.removeItem('cc_portal_access'); }")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(4000)
    expect(pg.locator('.cc-pick').count() == 2 and 'Your plan includes 1 client' in pg.inner_text('#trial-import-note'), 'Over the limit: attorney is asked to choose')
    expect(len(pg.evaluate("JSON.parse(localStorage.getItem('__cases')||'[]')")) == 0, 'Nothing copied before choosing')
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portal_picker.png'), full_page=True)
    pg.locator('.cc-pick').nth(1).check()
    expect(pg.locator('.cc-pick').nth(0).is_disabled(), 'Cannot choose more than the plan allows')
    pg.check('#cc-pick-ack')
    expect(pg.is_disabled('#cc-pick-go'), 'Needs the CCP number too')
    pg.fill('#cc-pick-ccp', 'ccp-test01'); pg.dispatch_event('#cc-pick-ccp', 'input')
    expect(pg.is_enabled('#cc-pick-go'), 'Checkbox + CCP enables it')
    pg.click('#cc-pick-go'); pg.wait_for_timeout(4500)
    cases = pg.evaluate("JSON.parse(localStorage.getItem('__cases')||'[]')")
    expect([c['client_name'] for c in cases] == ['M. Lopez'], 'Only the chosen case was brought over')
    expect(pg.evaluate("localStorage.getItem('__ws')") == '{}', 'Trial copy (including cases not chosen) deleted')
    expect(bool(pg.evaluate("localStorage.getItem('__imported')")), 'Move marked as done')
    expect(not errors, 'No page errors ' + str(errors[:2]))
    b.close()

print('\nAll checks passed' if not fails else '\n%d check(s) failed' % len(fails))
sys.exit(1 if fails else 0)
