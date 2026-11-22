(() => {
    const byId = id => document.getElementById(id);
    const formFor = (kind, action) => document.querySelector(`form[data-${kind}="${action}"]`);
    const field = (form, name) => form.elements.namedItem(name);

    async function json(path, method = 'GET', body) {
        const response = await fetch(path, {
            method, cache: 'no-store',
            ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || 'Aether could not complete the request.');
        return value;
    }

    const gate = (route, method, body) => json('/api/gateway?' + new URLSearchParams({ route }), method, body);
    const node = (tag, content, cls) => {
        const element = document.createElement(tag);
        if (content) element.textContent = content;
        if (cls) element.className = cls;
        return element;
    };
    const date = value => new Date(value).toLocaleString();
    const actionLabels = {
        status: 'Displayed status updated', maintenance: 'Page maintenance updated', publish: 'Devlog published',
        'staff.update': 'Staff access updated', 'staff.remove': 'Staff member removed',
        'invite.attempt': 'Server invite requested', 'invite.created': 'Server invite created',
        'leave.attempt': 'Bot removal requested', 'leave.applied': 'Bot removed from server',
        'protection.update': 'Protection updated', 'automod.update': 'Discord AutoMod updated', 'slowmode.set': 'Slowmode updated',
    };
    const options = (select, list, prompt) => {
        select.replaceChildren();
        if (prompt) select.add(new Option(prompt, ''));
        for (const item of list) select.add(new Option(item.name, item.id));
    };

    function activity(container, entries, label) {
        container.replaceChildren(...entries.map(entry => node('p', label(entry), 'control-row')));
        if (!entries.length) container.textContent = 'No activity recorded yet.';
    }

    function button(label, run, notice) {
        const control = node('button', label, 'btn btn-ghost btn-small');
        control.type = 'button';
        control.addEventListener('click', async () => {
            control.disabled = true;
            try { await run(); } catch (error) { notice.textContent = error.message; }
            finally { control.disabled = false; }
        });
        return control;
    }

    function handleSubmit(form, run, notice) {
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"],button:not([type])');
            submit.disabled = true;
            try { await run(form); } catch (error) { notice.textContent = error.message; }
            finally { submit.disabled = false; }
        });
    }

    async function ownerPanel() {
        const panel = byId('ownerPanel');
        if (!panel) return;
        const notice = byId('controlNotice');
        const guildSummary = byId('guildSummary');
        const statusForm = formFor('owner', 'status');
        const maintenanceForm = formFor('owner', 'maintenance');
        const staffForm = formFor('owner', 'staff');
        let current;

        function showMaintenance() {
            const saved = current.maintenance[field(maintenanceForm, 'page').value];
            field(maintenanceForm, 'enabled').checked = Boolean(saved);
            field(maintenanceForm, 'message').value = saved?.message || '';
        }

        function showStaff() {
            const list = byId('ownerStaff');
            list.replaceChildren();
            for (const [id, item] of Object.entries(current.staff)) {
                const row = node('div', '', 'control-row');
                row.append(node('span', `${item.name} · ${item.title}`));
                row.append(button('Edit', () => {
                    field(staffForm, 'userId').value = id;
                    for (const name of ['name', 'title']) field(staffForm, name).value = item[name];
                    for (const name of ['listed', 'access']) field(staffForm, name).checked = item[name];
                    field(staffForm, 'name').focus();
                }, notice), button('Remove', async () => {
                    if (!confirm(`Remove ${item.name} from the staff directory and revoke their panel access?`)) return;
                    await gate('owner/site', 'POST', { action: 'remove_staff', userId: id });
                    await loadSite('staff');
                    notice.textContent = 'Staff access removed.';
                }, notice));
                list.append(row);
            }
        }

        async function loadSite(section) {
            current = await gate('owner/site');
            if (!section || section === 'status') {
                field(statusForm, 'value').value = current.status.value;
                field(statusForm, 'message').value = current.status.message;
            }
            if (!section) options(byId('maintenancePages'), current.pages.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })));
            if (!section || section === 'maintenance') showMaintenance();
            if (!section || section === 'staff') showStaff();
            activity(byId('ownerAudit'), current.audit, entry => {
                const target = typeof entry.target === 'string' ? entry.target : `${entry.target.guildId} · ${entry.target.reason}`;
                return `${actionLabels[entry.action]} · ${target} · ${entry.userId} · ${date(entry.at)}`;
            });
        }

        async function loadGuilds() {
            try {
                const { guilds } = await gate('owner/guilds');
                guildSummary.textContent = `Installed in ${guilds.length} Discord ${guilds.length === 1 ? 'server' : 'servers'}.`;
                const list = byId('ownerGuilds');
                list.replaceChildren();
                for (const guild of guilds) {
                    const card = node('article', '', 'control-card');
                    const actions = node('div', '', 'control-row-actions');
                    card.append(node('h3', guild.name), node('p', `${guild.id} · ${guild.memberCount ?? 'Unknown'} members`), actions);
                    if (!guild.available) card.append(node('p', 'Discord reports this server is unavailable.'));
                    else {
                        const detail = node('div', '', 'control-list');
                        actions.append(button('Create an invite', async () => {
                            const route = `owner/guilds/${guild.id}/invite`;
                            const { channels } = await gate(route);
                            if (!channels.length) throw new Error('No channels where you and Aether can create invites.');
                            const form = node('form', '', 'control-form');
                            const label = node('label', 'Invite channel');
                            const select = node('select');
                            options(select, channels, 'Choose a channel');
                            select.required = true;
                            label.append(select);
                            form.append(label, node('button', 'Create 15-minute invite', 'btn btn-primary'));
                            detail.replaceChildren(form);
                            select.focus();
                            handleSubmit(form, async () => {
                                const { url } = await gate(route, 'POST', { channelId: select.value });
                                if (!/^https:\/\/discord\.gg\/[a-zA-Z0-9-]+$/.test(url)) throw new Error('Discord returned an invalid invite.');
                                const link = node('a', url);
                                link.href = url;
                                detail.replaceChildren(node('p', 'Expires after 15 minutes or one use.'), link);
                                link.focus();
                                await loadSite('audit');
                                notice.textContent = 'Server invite created.';
                            }, notice);
                        }, notice), button('Remove Aether', () => {
                            const form = node('form', '', 'control-form');
                            const confirmLabel = node('label', `Type the server ID to remove Aether from ${guild.name}`);
                            const confirmation = node('input');
                            confirmation.required = true;
                            confirmation.maxLength = 20;
                            confirmation.inputMode = 'numeric';
                            confirmLabel.append(confirmation);
                            const reasonLabel = node('label', 'Reason');
                            const reason = node('input');
                            reason.required = true;
                            reason.minLength = 5;
                            reason.maxLength = 240;
                            reasonLabel.append(reason);
                            form.append(confirmLabel, reasonLabel, node('button', 'Confirm removal', 'btn btn-primary'));
                            detail.replaceChildren(form);
                            confirmation.focus();
                            handleSubmit(form, async () => {
                                await gate(`owner/guilds/${guild.id}/leave`, 'POST', { confirmation: confirmation.value.trim(), reason: reason.value });
                                await Promise.all([loadGuilds(), loadSite('audit')]);
                                notice.textContent = `Aether left ${guild.name}.`;
                            }, notice);
                        }, notice));
                        card.append(detail);
                    }
                    list.append(card);
                }
            } catch (error) { guildSummary.textContent = error.message; }
        }

        try {
            await loadSite();
            panel.hidden = false;
            notice.textContent = '';
            void loadGuilds();
        } catch (error) { notice.textContent = error.message; }
        byId('maintenancePages').addEventListener('change', showMaintenance);
        for (const form of panel.querySelectorAll('[data-owner]')) {
            handleSubmit(form, async () => {
                const action = form.dataset.owner;
                const fields = Object.fromEntries(new FormData(form));
                for (const checkbox of form.querySelectorAll('[type="checkbox"]')) fields[checkbox.name] = checkbox.checked;
                await gate('owner/site', 'POST', { ...fields, action });
                if (action === 'publish' || action === 'staff') form.reset();
                await loadSite(action);
                notice.textContent = action === 'publish' ? 'Devlog published.' : 'Changes saved.';
            }, notice);
        }
    }

    function dashboardSetup() {
        const container = byId('guildSetupForms');
        if (!container) return;
        const notice = byId('setupNotice');
        const protection = formFor('setup', 'setup');
        const automod = formFor('setup', 'automod');
        const rulePicker = byId('protectionRules');
        const ruleNames = {
            joinSpike: 'Join spike', newAccount: 'New accounts', mentionSpam: 'Mention spam', mentionBurst: 'Mention burst',
            channelDelete: 'Channel deletion', roleDelete: 'Role deletion', banSpam: 'Repeated bans', webhookCreate: 'Webhook creation', kickSpam: 'Repeated kicks', botAdd: 'New bot added', roleEscalation: 'Role permission escalation',
        };
        let selected = '';
        let revision = 0;
        let rules = [];
        function showRule() {
            const rule = rules.find(item => item.id === rulePicker.value);
            if (!rule) return;
            field(protection, 'enabled').checked = rule.enabled;
            field(protection, 'threshold').value = rule.threshold ?? rule.minAgeHours;
            field(protection, 'threshold').max = rule.id === 'newAccount' ? 720 : 100;
            byId('protectionThresholdLabel').firstChild.textContent = rule.id === 'newAccount' ? 'Minimum account age in hours' : 'Events that trigger a response';
            const choices = rule.system === 'antiraid' ? ['alert', 'timeout', 'kick', 'ban'] : ['alert', 'strip_roles', 'kick', 'ban'];
            if (rule.action === 'quarantine') choices.push('quarantine');
            const labels = { alert: 'Alert only', timeout: 'Timeout', kick: 'Kick', ban: 'Ban', strip_roles: 'Remove manageable roles', quarantine: 'Keep current quarantine response' };
            options(field(protection, 'action'), choices.map(id => ({ id, name: labels[id] })));
            field(protection, 'action').value = rule.action;
            field(protection, 'alertChannelId').value = rule.alertChannelId || '';
        }
        rulePicker.addEventListener('change', showRule);

        async function load(guildId, manager) {
            const request = ++revision;
            selected = manager ? guildId : '';
            container.hidden = true;
            notice.textContent = selected ? 'Loading server settings…' : 'Choose a server you manage to configure protection and run commands.';
            if (!selected) return;
            try {
                const result = await gate(`guilds/${guildId}/setup`);
                if (request !== revision) return;
                const savedRule = rulePicker.value;
                rules = Object.entries(result.protections).flatMap(([system, items]) => Object.entries(items)
                    .map(([id, data]) => ({ ...data, id, system, name: ruleNames[id] })));
                options(rulePicker, rules);
                if (rules.some(rule => rule.id === savedRule)) rulePicker.value = savedRule;
                options(byId('securityAlertChannels'), result.alertChannels, 'No alert channel');
                showRule();
                options(byId('slowmodeChannels'), result.channels, 'Choose a channel');
                field(automod, 'enabled').checked = result.autoMod.enabled;
                field(automod, 'count').value = result.autoMod.count;
                [...automod.elements].forEach(element => { element.disabled = !result.autoMod.available; });
                activity(byId('guildControlAudit'), [...result.audit, ...result.events].sort((a, b) => new Date(b.at || b.timestamp) - new Date(a.at || a.timestamp)).slice(0, 20), entry => entry.operation
                    ? `${actionLabels[entry.operation]} · ${entry.target} · ${entry.outcome} · ${date(entry.at)}`
                    : `${entry.category} · ${entry.action} · ${entry.applied ? 'applied' : 'failed'} · ${date(entry.timestamp)}`);
                container.hidden = false;
                notice.textContent = [
                    result.autoMod.available ? '' : 'Aether needs Manage Server to configure Discord AutoMod.',
                    result.botPermissions.viewAuditLog ? '' : 'Aether needs View Audit Log for anti-nuke.',
                ].filter(Boolean).join(' ');
            } catch (error) { if (request === revision) notice.textContent = error.message; }
        }
        document.addEventListener('aether:guild-selected', event => void load(event.detail.guildId, event.detail.manager));
        for (const form of container.querySelectorAll('form')) {
            handleSubmit(form, async () => {
                const action = form.dataset.setup;
                const guildId = selected;
                if (!guildId) return;
                const data = Object.fromEntries(new FormData(form));
                if (action === 'setup') {
                    const rule = rules.find(item => item.id === data.rule);
                    if (data.action === 'quarantine') delete data.action;
                    Object.assign(data, { system: rule.system, type: rule.id, threshold: Number(data.threshold), alertChannelId: data.alertChannelId || null });
                }
                if (action === 'automod') data.count = Number(data.count);
                if (action === 'remote') Object.assign(data, { command: 'slowmode', seconds: Number(data.seconds) });
                else data.enabled = field(form, 'enabled').checked;
                await gate(`guilds/${guildId}/${action}`, action === 'remote' ? 'POST' : 'PATCH', data);
                if (guildId !== selected) return;
                await load(guildId, true);
                if (guildId === selected) notice.textContent = 'Changes saved. ' + notice.textContent;
            }, notice);
        }
    }

    async function publicPages() {
        const staff = byId('publicStaff');
        const devlog = byId('publicDevlog');
        const status = byId('publishedStatus');
        const team = byId('teamActivity');
        if (!(staff || devlog || status || team)) return;
        try {
            if (team) {
                const { activity: entries } = await gate('site/team');
                activity(team, entries, item => `${actionLabels[item.action]} · ${date(item.at)}`);
                return;
            }
            const content = await json('/api/content');
            if (staff) {
                staff.replaceChildren(...content.staff.map(member => {
                    const card = node('article', '', 'control-card');
                    card.append(node('h2', member.name), node('p', member.title));
                    return card;
                }));
                if (!content.staff.length) staff.textContent = 'No team members are listed yet.';
            }
            if (devlog) {
                devlog.replaceChildren(...content.devlogs.map(post => {
                    const card = node('article', '', 'control-card');
                    const time = node('time', date(post.at));
                    time.dateTime = post.at;
                    card.append(node('h2', post.title), time, node('p', post.text, 'control-post'));
                    return card;
                }));
                if (!content.devlogs.length) devlog.textContent = 'No devlogs have been published yet.';
            }
            if (status && content.status.value !== 'automatic') {
                const value = content.status.value;
                status.textContent = 'Published bot status · ' + value[0].toUpperCase() + value.slice(1) + (content.status.message ? ' · ' + content.status.message : '');
                status.hidden = false;
            }
        } catch (error) { for (const section of [staff, devlog, team]) if (section) section.textContent = error.message; }
    }

    const preview = document.querySelector('[data-security-preview]');
    if (preview) {
        const examples = {
            joins: ['Join threshold reached', 'Aether records the join spike and sends an alert to your configured staff channel.'],
            audit: ['Audit activity recorded', 'Aether matches the audit entry to a specific actor and applies the response chosen by the server manager.'],
            mentions: ['Too many mentions', 'Discord AutoMod blocks the message. Staff can review the rule directly in Discord.'],
        };
        preview.addEventListener('click', event => {
            const button = event.target.closest('button[data-example]');
            if (!button) return;
            for (const control of preview.querySelectorAll('button')) control.setAttribute('aria-pressed', String(control === button));
            const [title, detail] = examples[button.dataset.example];
            byId('preview-event').textContent = title;
            byId('preview-detail').textContent = detail;
            if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
                byId('preview-event').parentElement.animate([{ opacity: .55, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 240 });
            }
        });
    }

    dashboardSetup();
    void ownerPanel();
    void publicPages();
})();
