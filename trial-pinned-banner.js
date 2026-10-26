(function () {
    var TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

    /* Paid access (set by the dashboard from the account): {plan, label, until} */
    function paidAccess() {
        try {
            var a = JSON.parse(localStorage.getItem('cc_access') || 'null');
            if (a && a.until && new Date(a.until).getTime() > Date.now()) return a;
        } catch (e) { /* ignore */ }
        return null;
    }

    /* The trial ends at 11:59 PM Central time on day 30 (the signup day is day 1). */
    function chicagoOffsetMin(ms) {
        try {
            var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(new Date(ms));
            var tz = (p.find(function (x) { return x.type === 'timeZoneName'; }) || {}).value || 'GMT-6';
            var m = /GMT([+-])(\d+)(?::(\d+))?/.exec(tz);
            return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : -360;
        } catch (e) { return -360; }
    }
    function trialEndMs(raw) {
        var start = new Date(raw);
        if (isNaN(start.getTime())) return null;
        var ymd;
        try { ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(start).split('-').map(Number); }
        catch (e) { ymd = [start.getFullYear(), start.getMonth() + 1, start.getDate()]; }
        // 11:59 PM Central on (start date + 29 days)
        var guess = Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + 29, 23, 59);
        return guess - chicagoOffsetMin(guess) * 60000;
    }
    function getTrialEndTimeMs() {
        var raw = localStorage.getItem('trial_start_at');
        if (!raw) return null;
        return trialEndMs(raw);
    }

    function getRemainingMs() {
        var end = getTrialEndTimeMs();
        if (end == null) return TRIAL_DURATION_MS;
        return Math.max(0, end - Date.now());
    }

    function formatCountdown(ms) {
        if (ms <= 0) return '0d 00h 00m 00s';
        var sec = Math.floor(ms / 1000);
        var s = sec % 60;
        var m = Math.floor(sec / 60) % 60;
        var h = Math.floor(sec / 3600) % 24;
        var d = Math.floor(sec / 86400);
        function z2(n) { return n < 10 ? '0' + n : String(n); }
        return d + 'd ' + z2(h) + 'h ' + z2(m) + 'm ' + z2(s) + 's';
    }

    window.CaseClarityTrial = {
        TRIAL_DURATION_MS: TRIAL_DURATION_MS,
        getEndTimeMs: getTrialEndTimeMs,
        getRemainingMs: getRemainingMs,
        formatCountdown: formatCountdown,
        trialEndMs: trialEndMs,
        paidAccess: paidAccess
    };

    function shouldShowToolBanner() {
        return !!(localStorage.getItem('session_id') || localStorage.getItem('user_logged_in') || localStorage.getItem('trial_start_at'));
    }

    function tick() {
        var endMs = getTrialEndTimeMs();
        var ms = endMs == null ? TRIAL_DURATION_MS : Math.max(0, endMs - Date.now());
        var paid = paidAccess();
        var text = paid ? paid.label : formatCountdown(ms);
        var h = document.getElementById('trial-countdown');
        var c = document.getElementById('trial-countdown-card');
        var inj = document.getElementById('trial-pinned-countdown-text');
        if (h) h.textContent = text;
        if (c) c.textContent = text;
        if (inj) inj.textContent = text;

        var injRoot = document.getElementById('trial-global-pinned-bar');
        if (injRoot) {
            var rem = getRemainingMs();
            var started = !!localStorage.getItem('trial_start_at');
            injRoot.classList.toggle('trial-pinned--warning', !paid && started && rem > 0 && rem <= 2 * 86400000);
            injRoot.classList.toggle('trial-pinned--expired', !paid && started && rem <= 0);
            var lab = injRoot.querySelector('.trial-global-pinned-label');
            if (lab) lab.textContent = paid ? 'Subscriber' : 'Trial';
        }
    }

    function init() {
        var dashHeader = document.querySelector('header.app-header');
        if (dashHeader) {
            dashHeader.classList.add('trial-pinned-app-header');
            document.body.classList.add('has-trial-pinned-dashboard');
        } else if (shouldShowToolBanner()) {
            if (document.getElementById('trial-global-pinned-bar')) return;
            var bar = document.createElement('header');
            bar.id = 'trial-global-pinned-bar';
            bar.setAttribute('role', 'banner');
            bar.className = 'trial-global-pinned-bar';
            var a = document.createElement('a');
            a.className = 'trial-global-pinned-dash';
            a.href = 'dashboard.html';
            a.textContent = 'Dashboard';
            bar.innerHTML =
                '<div class="trial-global-pinned-inner">' +
                '<span class="trial-global-pinned-brand">Case Clarity</span>' +
                '<span class="trial-global-pinned-sep">|</span>' +
                '<span class="trial-global-pinned-label">Trial</span>' +
                '<span class="trial-global-pinned-clock">' +
                '<span class="trial-countdown-clock" id="trial-pinned-countdown-text" aria-live="polite">30d 00h 00m 00s</span>' +
                '<span class="trial-global-pinned-suffix">remaining</span>' +
                '</span></div>';
            bar.querySelector('.trial-global-pinned-inner').appendChild(a);
            document.body.insertBefore(bar, document.body.firstChild);
            document.body.classList.add('has-trial-tool-banner');
        }

        tick();
        if (window._trialPinnedBannerInterval) {
            clearInterval(window._trialPinnedBannerInterval);
        }
        window._trialPinnedBannerInterval = setInterval(tick, 1000);
    }

    window.CaseClarityTrial.refreshCountdown = tick;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
