(() => {
    const kind = document.body.dataset.communityPage;
    if (!kind) return;
    const byId = id => document.getElementById(id);
    const notice = message => { byId('communityNotice').textContent = message; };
    const make = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const showDate = value => {
        const date = new Date(value);
        const stamp = make('time', date.toLocaleDateString());
        stamp.dateTime = value;
        return stamp;
    };
    let permissions = { ownPresets: [], ownReviews: [], canModerate: false };
    let book = { items: [], count: 0, average: null };
    const handle = (form, action) => form.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = form.querySelector('[type=submit]');
        submit.disabled = true;
        try { await action(Object.fromEntries(new FormData(form))); }
        catch (error) { notice(error.message); }
        finally { submit.disabled = false; }
    });
    async function request(path, method = 'GET', body) {
        const response = await fetch(path, {
            method, cache: 'no-store',
            ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
        const value = await response.json().catch(() => null);
        if (!response.ok || !value) throw new Error(value?.error || 'Aether could not complete the request.');
        return value;
    }
    const gate = (route, method, body) => request('/api/gateway?' + new URLSearchParams({ route }), method, body);

    function downloadPreset(item) {
        const blob = new Blob([JSON.stringify(item.snapshot, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = make('a');
        link.download = 'aether-preset-' + item.id.slice(0, 8) + '.json';
        link.href = url;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function renderFeed() {
        const feed = byId('communityFeed');
        const reviewFeed = kind === 'reviews';
        const summary = byId('reviewSummary');
        if (summary) summary.textContent = book.count ? book.average.toFixed(1) + ' / 5 · ' + book.count + (book.count === 1 ? ' review' : ' reviews') : 'No reviews yet';
        const owned = reviewFeed ? permissions.ownReviews : permissions.ownPresets;
        feed.replaceChildren();
        for (const item of book.items) {
            const article = make('article', '', 'community-card feed-card');
            const byline = make('p', '', 'publication-meta');
            byline.append(document.createTextNode(item.author + ' · '), showDate(item.at));
            article.append(byline);
            if (reviewFeed) {
                const score = make('p', '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating), 'review-stars');
                score.setAttribute('aria-label', item.rating + ' out of 5 stars');
                article.append(score, make('p', item.text, 'community-text'));
            } else {
                article.append(make('h3', item.title), make('p', item.description, 'community-text'));
                const rules = Object.values(item.snapshot.protections).flatMap(Object.values);
                article.append(make('p', rules.filter(rule => rule.enabled).length + ' enabled protection rules', 'publication-meta'));
                const download = make('button', 'Download preset', 'btn btn-ghost btn-small');
                download.type = 'button';
                download.addEventListener('click', () => downloadPreset(item));
                article.append(download);
            }
            if (owned.includes(item.id) || permissions.canModerate) {
                const remove = make('button', reviewFeed ? 'Remove review' : 'Remove preset', 'btn btn-ghost btn-small remove-post');
                remove.type = 'button';
                remove.addEventListener('click', async () => {
                    if (!confirm('Remove this post from the public community?')) return;
                    remove.disabled = true;
                    try {
                        await gate('site/community', 'POST', { action: 'remove', kind, id: item.id });
                        if (reviewFeed && owned.includes(item.id)) byId('reviewForm').reset();
                        await refresh();
                        notice('Post removed.');
                    } catch (error) {
                        notice(error.message);
                        remove.disabled = false;
                    }
                });
                article.append(remove);
            }
            feed.append(article);
        }
        if (!book.items.length) feed.append(make('p', reviewFeed ? 'No reviews have been published.' : 'No presets have been shared.', 'publication-empty'));
    }

    async function refresh() {
        const feed = byId('communityFeed');
        feed.setAttribute('aria-busy', 'true');
        try {
            book = await request('/api/community?' + new URLSearchParams({ kind }));
            renderFeed();
        } catch (error) {
            feed.replaceChildren(make('p', error.message, 'publication-empty'));
        } finally { feed.setAttribute('aria-busy', 'false'); }
    }

    async function init() {
        if (kind !== 'profile') void refresh();
        const { authenticated, user } = await request('/api/auth/me');
        if (!authenticated) return;
        const account = byId('communityAccount');
        account.href = '/profile/';
        account.textContent = 'Your profile';
        if (kind === 'profile') {
            byId('profileDiscord').textContent = user.username;
            if (/^https:\/\/cdn\.discordapp\.com\/avatars\//.test(user.avatar)) {
                byId('profileAvatar').src = user.avatar;
                byId('profileAvatar').hidden = false;
            }
            const form = byId('profileForm');
            const profile = await gate('site/profile');
            for (const field of ['publicName', 'bio']) form.elements[field].value = profile[field];
            form.hidden = false;
            handle(form, async fields => {
                await gate('site/profile', 'PATCH', fields);
                notice('Profile saved.');
            });
            try {
                permissions = await gate('site/community');
                byId('profileCounts').textContent = permissions.ownPresets.length + ' shared presets · ' + permissions.ownReviews.length + ' published reviews';
            } catch { /* Profile editing is independent of the community feed. */ }
            return;
        }
        byId('communitySignin').hidden = true;
        permissions = await gate('site/community');
        renderFeed();
        if (kind === 'reviews') {
            const form = byId('reviewForm');
            if (permissions.review) {
                form.elements.rating.value = permissions.review.rating;
                form.elements.text.value = permissions.review.text;
            }
            form.hidden = false;
            handle(form, async fields => {
                const result = await gate('site/community', 'POST', { action: 'review', rating: Number(fields.rating), text: fields.text });
                permissions.ownReviews = [result.id];
                await refresh();
                notice('Your review was published.');
            });
        } else {
            const form = byId('presetForm');
            const { guilds } = await gate('guilds');
            const manageable = guilds.filter(guild => guild.permissions?.manager);
            if (!manageable.length) return notice('Choose a Discord account that manages a server with Aether installed.');
            for (const guild of manageable) form.elements.guild.add(new Option(guild.name, guild.id));
            const preferred = new URLSearchParams(location.search).get('guild');
            if (manageable.some(guild => guild.id === preferred)) form.elements.guild.value = preferred;
            form.hidden = false;
            handle(form, async fields => {
                if (!manageable.some(guild => guild.id === fields.guild)) throw new Error('Choose a server you manage.');
                const result = await gate('guilds/' + fields.guild + '/share-config', 'POST', { title: fields.title, description: fields.description });
                permissions.ownPresets.push(result.id);
                form.reset();
                await refresh();
                notice('Your preset was published.');
            });
        }
    }
    void init().catch(error => notice(error.message));
})();
