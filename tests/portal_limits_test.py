"""Portal client limits: Foundation stops at 4 clients; removing a client needs the checkbox
and the CCP number, is recorded, keeps the client until the renewal date, and can be undone."""
import os, sys
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
      if(table==='trial_users') return {id:'u1',ccp:'CCP-TEST01',email:'a@firm.com',subscription_status:'active',subscription_tier:'professional',portal_import_done_at: '2026-10-25T00:00:00Z'};
      if(table==='case_attorney_profiles') return {id:'p1',user_id:'u1',is_portal_admin:false};
      if(table==='case_cases'){
        var cs=L('__cases',[]);
        if(op==='insert'){ var n=cs.length+1; var row=Object.assign({id:'case-'+n,case_ref:'CC-000'+n,created_at:new Date().toISOString()},payload); cs.push(row); S('__cases',cs); return row; }
        if(f.trial_case_key) return cs.filter(function(c){return c.trial_case_key===f.trial_case_key;})[0]||null;
        if(f.id) return cs.filter(function(c){return c.id===f.id;})[0]||null;
        if(f.case_ref) return cs.filter(function(c){return c.case_ref===f.case_ref;})[0]||null;
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
      if(name==='cc_mark_portal_import'){ localStorage.setItem('__imported', new Date().toISOString()); return Promise.resolve({data:new Date().toISOString(),error:null}); }
      if(name==='cc_portal_client_limit'){ var cs=L('__cases',[]); return Promise.resolve({data:{plan:'foundation',limit:4,used:cs.length,renewal_on:'2026-11-20T00:00:00Z'},error:null}); }
      if(name==='cc_schedule_client_removal'){ if(String(args.p_ccp).toUpperCase()!=='CCP-TEST01') return Promise.resolve({data:null,error:{message:'CCP_MISMATCH'}}); var cs=L('__cases',[]); cs.forEach(function(c){ if(c.id===args.p_case_id) c.removal_on='2026-11-20T00:00:00Z'; }); S('__cases',cs); var lg=L('__removals',[]); lg.push(args); S('__removals',lg); return Promise.resolve({data:'2026-11-20T00:00:00Z',error:null}); }
      if(name==='cc_cancel_client_removal'){ var cs=L('__cases',[]); cs.forEach(function(c){ if(c.id===args.p_case_id) c.removal_on=null; }); S('__cases',cs); return Promise.resolve({data:null,error:null}); }
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
    b = p.chromium.launch(); ctx = b.new_context()
    ctx.route('**/*', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB) if 'supabase-js' in r.request.url
              else (r.continue_() if r.request.url.startswith('http://localhost') else r.fulfill(status=200, body='')))
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + 'login.html', wait_until='commit'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ localStorage.clear(); const cs=[1,2,3].map(n=>({id:'case-'+n,case_ref:'CC-000'+n,client_name:'Client '+n,case_title:'Client '+n,case_type:'PI',case_status:'active',attorney_user_id:'u1',created_at:new Date().toISOString()})); localStorage.setItem('__cases', JSON.stringify(cs)); }""")
    pg.goto(BASE + 'dashboard.html', wait_until='commit'); pg.wait_for_timeout(3500)
    expect('Foundation plan · 3 of 4 clients' in pg.inner_text('#plan-status'), 'Dashboard shows 3 of 4 clients')
    expect(pg.get_attribute('a[href="/case-new.html"] >> nth=0', 'aria-disabled') is None, 'New Case available under the limit')
    pg.evaluate("""()=>{ const cs=JSON.parse(localStorage.getItem('__cases')); cs.push({id:'case-4',case_ref:'CC-0004',client_name:'Client 4',case_title:'Client 4',attorney_user_id:'u1',case_status:'active'}); localStorage.setItem('__cases', JSON.stringify(cs)); }""")
    pg.reload(wait_until='commit'); pg.wait_for_timeout(3500)
    expect('4 of 4' in pg.inner_text('#plan-status') and 'limit reached' in pg.inner_text('#plan-status'), 'Dashboard says the limit is reached')
    expect(pg.get_attribute('a[href="/case-new.html"] >> nth=0', 'aria-disabled') == 'true', 'New Case turned off at the limit')
    pg.goto(BASE + 'case-new.html', wait_until='commit'); pg.wait_for_timeout(3000)
    expect('client limit has been reached' in pg.inner_text('body'), 'New Case page explains the limit')
    # Remove Client 2
    pg.goto(BASE + 'case-detail.html?case_ref=CC-0002', wait_until='commit'); pg.wait_for_timeout(3500)
    pg.click('#cc-removal-mount summary')
    pg.check('#cc-rm-check')
    expect(pg.is_disabled('#cc-rm-go'), 'Checkbox alone does not enable removal')
    pg.fill('#cc-rm-ccp', 'CCP-WRONG1'); pg.dispatch_event('#cc-rm-ccp', 'input'); pg.click('#cc-rm-go'); pg.wait_for_timeout(600)
    expect('does not match' in pg.inner_text('#cc-rm-err'), 'Wrong CCP number is refused by the server')
    pg.fill('#cc-rm-ccp', 'ccp-test01'); pg.dispatch_event('#cc-rm-ccp', 'input'); pg.click('#cc-rm-go'); pg.wait_for_timeout(3500)
    logs = pg.evaluate("JSON.parse(localStorage.getItem('__removals')||'[]')")
    expect(len(logs) == 1 and logs[0]['p_case_id'] == 'case-2', 'Removal recorded on the server')
    body = pg.inner_text('#cc-removal-mount')
    expect('will be removed on November' in body, 'Case page shows the removal date')
    launch = pg.locator('a.tool-launch').first
    expect('being removed' in launch.inner_text().lower(), 'Tools turned off for a client being removed')
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portal_removal.png'), full_page=False)
    pg.click('#cc-keep-client'); pg.wait_for_timeout(3500)
    expect(pg.locator('#cc-removal-mount summary').count() == 1, 'Keep this client undoes the removal')
    expect(not errors, 'No page errors ' + str(errors[:2]))
    b.close()

print('\nAll checks passed' if not fails else '\n%d check(s) failed' % len(fails))
sys.exit(1 if fails else 0)
