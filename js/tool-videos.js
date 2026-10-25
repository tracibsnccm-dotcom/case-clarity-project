/*
 * C.A.S.E. Clarity — "Learn more" videos in each tool.
 * Reads the Supabase table tool_videos (rows for this tool, plus rows marked ALL).
 * Shows a small "Learn more" button only when the tool has at least one video.
 * Videos open on YouTube in a new tab, so the attorney keeps their place.
 * Never printed and never part of a report.
 */
(function (global) {
  var page = (global.location.pathname.split('/').pop() || '').toLowerCase();
  var MAP = { 'tool1-cci': 'CCI', 'tool2-csa': 'CSA', 'tool3-caf': 'CAF', 'tool4-hsi': 'HSI', 'tool5-fci': 'FCI', 'tool6-rrf': 'RRF' };
  var TOOL = null;
  Object.keys(MAP).forEach(function (k) { if (page.indexOf(k) === 0) TOOL = MAP[k]; });
  if (!TOOL) return;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function safeUrl(u) { return /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(String(u || '')) ? u : null; }

  function mount(videos) {
    if (!videos.length || document.getElementById('cc-videos-btn')) return;
    var css = document.createElement('style');
    css.textContent =
      '#cc-videos-btn{position:fixed;left:16px;bottom:16px;z-index:3500;background:#0c1c34;color:#fff;border:2px solid #b09837;border-radius:22px;padding:9px 16px;font:600 13px system-ui,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(12,28,52,.25)}' +
      '#cc-videos-btn:hover{background:#13294a}' +
      '#cc-videos-panel{position:fixed;left:16px;bottom:64px;z-index:3501;width:min(360px,calc(100vw - 32px));max-height:60vh;overflow:auto;background:#fff;border:1.5px solid #d6dde8;border-top:4px solid #b09837;border-radius:8px;box-shadow:0 10px 30px rgba(12,28,52,.25);font-family:system-ui,Segoe UI,sans-serif;display:none}' +
      '#cc-videos-panel.open{display:block}' +
      '#cc-videos-panel .ccv-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #e5e1d8}' +
      '#cc-videos-panel .ccv-title{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0c1c34}' +
      '#cc-videos-panel .ccv-close{background:none;border:none;font-size:16px;cursor:pointer;color:#3a3f4a}' +
      '#cc-videos-panel a{display:block;padding:10px 14px;border-bottom:1px solid #f0ede6;text-decoration:none;color:#0c1c34}' +
      '#cc-videos-panel a:hover{background:#fdf8e8}' +
      '#cc-videos-panel .ccv-v{font-size:13.5px;font-weight:600;line-height:1.35}' +
      '#cc-videos-panel .ccv-d{font-size:12px;color:#5a6270;margin-top:2px;line-height:1.4}' +
      '#cc-videos-panel .ccv-foot{padding:8px 14px;font-size:11px;color:#6b7280}' +
      '@media print{#cc-videos-btn,#cc-videos-panel{display:none!important}}';
    document.head.appendChild(css);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cc-videos-btn';
    btn.className = 'no-print';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = '▶ Learn more (' + videos.length + ' video' + (videos.length === 1 ? '' : 's') + ')';

    var panel = document.createElement('div');
    panel.id = 'cc-videos-panel';
    panel.className = 'no-print';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Videos for this tool');
    panel.innerHTML = '<div class="ccv-head"><span class="ccv-title">Videos for the ' + esc(TOOL) + '</span>' +
      '<button type="button" class="ccv-close" aria-label="Close">✕</button></div>' +
      videos.map(function (v) {
        return '<a href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<div class="ccv-v">▶ ' + esc(v.title) + '</div>' +
          (v.description ? '<div class="ccv-d">' + esc(v.description) + '</div>' : '') + '</a>';
      }).join('') +
      '<div class="ccv-foot">Opens on YouTube in a new tab. Your answers stay here.</div>';

    function toggle(open) {
      panel.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.onclick = function () { toggle(!panel.classList.contains('open')); };
    panel.querySelector('.ccv-close').onclick = function () { toggle(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });

    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }

  async function load() {
    var client = global.supabaseClient;
    if (!client) return;
    try {
      var res = await client.from('tool_videos').select('title,url,description,sort_order,tool')
        .in('tool', [TOOL, 'ALL']).eq('active', true).order('sort_order', { ascending: true });
      if (res.error || !Array.isArray(res.data)) return;
      var vids = res.data.filter(function (v) { return v && v.title && safeUrl(v.url); });
      mount(vids);
    } catch (e) { /* no videos shown */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(load, 300); });
  else setTimeout(load, 300);
})(typeof window !== 'undefined' ? window : this);
