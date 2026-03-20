(function () {
    var TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

    function getTrialEndTimeMs() {
        var raw = localStorage.getItem('trial_start_at');
        if (!raw) return null;
        return new Date(raw).getTime() + TRIAL_DURATION_MS;
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
        formatCountdown: formatCountdown
    };

    function shouldShowToolBanner() {
        return !!(localStorage.getItem('session_id') || localStorage.getItem('user_logged_in') || localStorage.getItem('trial_start_at'));
    }

    function tick() {
        var endMs = getTrialEndTimeMs();
        var ms = endMs == null ? TRIAL_DURATION_MS : Math.max(0, endMs - Date.now());
        var text = formatCountdown(ms);
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
            injRoot.classList.toggle('trial-pinned--warning', started && rem > 0 && rem <= 2 * 86400000);
            injRoot.classList.toggle('trial-pinned--expired', started && rem <= 0);
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
                '<span class="trial-countdown-clock" id="trial-pinned-countdown-text" aria-live="polite">7d 00h 00m 00s</span>' +
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
