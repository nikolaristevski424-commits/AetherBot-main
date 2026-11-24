(() => {
    const el = id => document.getElementById(id);
    const componentTitles = { website: 'Website', discord: 'Discord connectivity', storage: 'Persistent storage' };
    const states = ['webState', 'botState', 'readyState', 'cadState', 'authState'];
    const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

    function set(id, label, kind) {
        const node = el(id);
        node.textContent = label;
        node.className = 'state-text ' + kind;
    }

    function headline(title, desc, tone) {
        el('healthHeadline').textContent = title;
        el('healthDescription').textContent = desc;
        el('healthSummary').dataset.tone = tone;
    }

    async function loadChecks() {
        try {
            const response = await fetch('/api/status?bridge=1', { cache: 'no-store' });
            if (!response.ok) throw Error('Service check unavailable');
            const state = await response.json();
            const web = state.website === 'operational';
            const bot = state.bot === 'reachable';
            const ready = state.readiness === 'ready';
            const bridge = state.bridgeVerified === true;
            const auth = state.auth === 'configured';
            set('webState', web ? 'Responding' : 'Unknown', web ? 'good' : 'wait');
            set('botState', bot ? 'HTTPS responding' : 'Unverified', bot ? 'good' : 'wait');
            set('readyState', ready ? 'Ready' : 'Readiness unverified', ready ? 'good' : 'wait');
            set('cadState', bridge ? 'Connection verified' : 'Unverified', bridge ? 'good' : 'wait');
            set('authState', auth ? 'Configured' : 'Not configured', auth ? 'good' : 'wait');
            const seconds = state.processUptimeSeconds;
            el('botProcessUptime').textContent = Number.isFinite(seconds) && seconds >= 0
                ? 'Bot process uptime · ' + Math.floor(seconds / 3600) + 'h ' + Math.floor(seconds % 3600 / 60) + 'm'
                : '';
            const measured = new Date(state.updatedAt);
            el('statusUpdated').textContent = Number.isFinite(measured.getTime()) ? 'Checked ' + measured.toLocaleString() : 'Checks completed';
            const healthy = web && bot && ready && bridge && auth;
            headline(healthy ? 'Core checks are passing' : 'Some checks need attention',
                healthy ? 'The website, bot readiness, and CAD connection responded.' : 'See the latest result for each service below.',
                healthy ? 'good' : 'watch');
        } catch {
            for (const id of states) set(id, 'Unknown', 'wait');
            el('botProcessUptime').textContent = '';
            el('statusUpdated').textContent = 'Service checks are unavailable.';
            headline('Service status is unverified', 'Aether could not complete the latest checks.', 'unknown');
        }
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function historyCard(name, title, days) {
        const card = element('article', 'history-card');
        card.append(element('h3', '', title));
        const bars = element('div', 'observation-strip');
        bars.setAttribute('aria-hidden', 'true');
        const details = element('details', 'observation-details');
        details.append(element('summary', '', 'Daily readings'));
        const list = element('ul');
        let sampled = 0;
        let allPassing = 0;
        for (const { day, checks } of days) {
            const label = dateFormat.format(new Date(day));
            const counts = checks[name];
            const inspected = counts && (counts.passed > 0 || counts.failed > 0);
            const tone = !inspected ? 'missing' : counts.failed === 0 ? 'good' : counts.passed > 0 ? 'watch' : 'failed';
            if (inspected) sampled++;
            if (tone === 'good') allPassing++;
            const info = label + ' · ' + (inspected ? counts.passed + ' passed, ' + counts.failed + ' failed' : 'No samples');
            const bar = element('span', 'observation-bar');
            bar.dataset.tone = tone;
            bar.title = info;
            bars.append(bar);
            list.prepend(element('li', '', info));
        }
        details.append(list);
        const caption = element('div', 'observation-caption');
        caption.append(element('span', '', '44 days ago'), element('span', '', sampled + '/45 days sampled · ' + allPassing + ' all passing'), element('span', '', 'Today'));
        card.append(bars, caption, details);
        return card;
    }

    async function loadHistory() {
        const target = el('observationBars');
        target.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/api/observations', { cache: 'no-store' });
            if (!response.ok) throw Error('History unavailable');
            const { days } = await response.json();
            if (!Array.isArray(days) || days.length !== 45) throw Error('History unavailable');
            target.replaceChildren(...Object.entries(componentTitles).map(([name, title]) => historyCard(name, title, days)));
        } catch {
            target.replaceChildren(element('p', 'publication-empty', 'Observation history is temporarily unavailable.'));
        } finally { target.setAttribute('aria-busy', 'false'); }
    }

    async function refresh() {
        const button = el('statusRefresh');
        button.disabled = true;
        await Promise.all([loadChecks(), loadHistory()]);
        button.disabled = false;
    }

    el('statusRefresh').addEventListener('click', refresh);
    void refresh();
})();
