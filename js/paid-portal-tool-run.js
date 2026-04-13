/**
 * Paid portal — record a completed tool run to case_tool_runs.
 * Load after js/supabase-client.js (uses auth.getUser for RLS-safe uid).
 */
(function (global) {
  function caseClarityResolveCaseRef() {
    try {
      var p = new URLSearchParams(global.location.search);
      var r = p.get('case_ref');
      if (r && String(r).trim()) return String(r).trim();
    } catch (e) {}
    try {
      if (global.localStorage) {
        var l = global.localStorage.getItem('caseClarityLastCaseRef');
        if (l && String(l).trim()) return String(l).trim();
      }
    } catch (e) {}
    return null;
  }

  function parseRpcRunNumber(d) {
    if (d == null) return 1;
    if (typeof d === 'number' && Number.isFinite(d) && d >= 1) {
      return Math.max(1, Math.floor(d));
    }
    if (typeof d === 'string' && /^\s*\d+\s*$/.test(d)) {
      return Math.max(1, parseInt(d.trim(), 10));
    }
    if (typeof d === 'object' && d !== null) {
      for (var k in d) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        var v = d[k];
        if (typeof v === 'number' && Number.isFinite(v)) return Math.max(1, Math.floor(v));
        if (typeof v === 'string' && /^\d+$/.test(v)) return Math.max(1, parseInt(v, 10));
      }
    }
    var s = String(d);
    if (/^\s*\d+\s*$/.test(s)) return Math.max(1, parseInt(s.trim(), 10));
    return 1;
  }

  function cloneForJsonb(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return {
        _error: 'Could not serialize tool result',
        detail: String(e && e.message),
      };
    }
  }

  async function paidPortalRecordCaseToolRunAsync(opts) {
    var toolKey = opts.toolKey;
    var scoreSummary = opts.scoreSummary;
    var resultJson = opts.resultJson;
    try {
      var caseRef = caseClarityResolveCaseRef();
      if (!caseRef || !global.supabaseClient) return false;

      var client = global.supabaseClient;
      var gu = await client.auth.getUser();
      var user = gu.data && gu.data.user;
      if (gu.error || !user) {
        console.error('[paid-portal] getUser', gu.error);
        return false;
      }
      var uid = user.id;

      var cq = await client
        .from('case_cases')
        .select('id, attorney_user_id')
        .eq('case_ref', caseRef)
        .eq('attorney_user_id', uid)
        .maybeSingle();

      if (cq.error || !cq.data) {
        if (cq.error) console.error('[paid-portal] case lookup', cq.error);
        return false;
      }

      var caseId = cq.data.id;

      var runNumber = 1;
      var rpc = await client.rpc('get_next_tool_run_number', {
        case_id: caseId,
        tool_key: toolKey,
      });

      if (!rpc.error && rpc.data != null) {
        runNumber = parseRpcRunNumber(rpc.data);
      } else {
        if (rpc.error) {
          console.warn('[paid-portal] get_next_tool_run_number RPC, using fallback', rpc.error);
        }
        var mx = await client
          .from('case_tool_runs')
          .select('run_number')
          .eq('case_id', caseId)
          .eq('tool_key', toolKey)
          .order('run_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mx.error) {
          console.error('[paid-portal] run_number fallback failed', mx.error);
          return false;
        }
        runNumber =
          (mx.data && mx.data.run_number != null ? Number(mx.data.run_number) : 0) + 1;
      }

      if (!Number.isFinite(runNumber) || runNumber < 1) runNumber = 1;

      var upd = await client
        .from('case_tool_runs')
        .update({ is_latest: false })
        .eq('case_id', caseId)
        .eq('tool_key', toolKey)
        .eq('is_latest', true);
      if (upd.error) console.warn('[paid-portal] is_latest update', upd.error);

      var ins = await client.from('case_tool_runs').insert({
        case_id: caseId,
        attorney_user_id: uid,
        tool_key: toolKey,
        run_number: runNumber,
        is_latest: true,
        score_summary: cloneForJsonb(scoreSummary),
        result_json: cloneForJsonb(resultJson),
        completed_at: new Date().toISOString(),
      });

      if (ins.error) {
        console.error('[paid-portal] case_tool_runs insert', ins.error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[paid-portal] recordCaseToolRun', err);
      return false;
    }
  }

  global.caseClarityResolveCaseRef = caseClarityResolveCaseRef;
  global.paidPortalRecordCaseToolRunAsync = paidPortalRecordCaseToolRunAsync;
})(typeof window !== 'undefined' ? window : this);
