#!/usr/bin/env python3
"""Copy the six tools (and the shared scripts they use) from this repo into the paid portal.

This repo is the single source for the tools. Run after any tool change:

    python3 tools/build-paid-portal.py ../case-clarity-paid-portal

Paid-portal differences applied to each tool:
  - Signed-in check uses the portal's requireAuth() (Supabase session + idle timeout).
  - Loads the portal's idle-session.js.
  - Trial-only scripts are left out: account sync, trial case list, plan rules, trial drafts
    (the portal saves drafts and runs to case_tool_drafts / case_tool_runs per case).
"""
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = ['tool1-cci.html', 'tool2-csa.html', 'tool3-caf.html', 'tool4-hsi.html', 'tool5-fci.html', 'tool6-rrf.html']
TRIAL_ONLY = ['js/workspace-sync.js', 'js/case-manager.js', 'js/plan-guard.js', 'js/trial-drafts.js']
SHARED_JS = ['print-frame.js', 'rerun-date.js', 'case-results.js', 'trial-print.js', 'shared-answers.js',
             'shared-wiring.js', 'tool-videos.js', 'case-timeline.js', 'paid-portal-tool-run.js',
             'supabase-client.js', 'case-identity.js', 'closed-case.js']
TRIAL_LOGIN = "const ok = (function(){ if (!localStorage.getItem('user_logged_in')) { window.location.href='login.html'; return false; } return true; })();"
PAID_LOGIN = "const ok = await requireAuth();"


def build_tool(src):
    out = src
    for js in TRIAL_ONLY:
        out, n = re.subn(r'[ \t]*<script src="' + re.escape(js) + r'"></script>\n', '', out)
        if n != 1:
            raise SystemExit('expected one %s tag, found %d' % (js, n))
    if out.count(TRIAL_LOGIN) != 1:
        raise SystemExit('trial sign-in check not found exactly once')
    out = out.replace(TRIAL_LOGIN, PAID_LOGIN)
    m = re.search(r'([ \t]*)<script src="js/auth-guard.js"></script>\n', out)
    if not m:
        raise SystemExit('auth-guard tag not found')
    if 'js/idle-session.js' not in out:
        out = out[:m.end()] + m.group(1) + '<script src="js/idle-session.js"></script>\n' + out[m.end():]
    return out


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    dest = os.path.abspath(sys.argv[1])
    if not os.path.isfile(os.path.join(dest, 'case-detail.html')):
        raise SystemExit('not the paid portal: ' + dest)
    for t in TOOLS:
        with open(os.path.join(HERE, t)) as f:
            html = build_tool(f.read())
        with open(os.path.join(dest, t), 'w') as f:
            f.write(html)
        print('tool  ', t)
    for js in SHARED_JS:
        shutil.copyfile(os.path.join(HERE, 'js', js), os.path.join(dest, 'js', js))
        print('script', js)
    # The portal's case card also reads is_locked.
    p = os.path.join(dest, 'js', 'case-identity.js')
    with open(p) as f:
        s = f.read()
    s = s.replace("client_identifier, case_status, created_at';", "client_identifier, case_status, created_at, is_locked';", 1)
    with open(p, 'w') as f:
        f.write(s)


if __name__ == '__main__':
    main()
