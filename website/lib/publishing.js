const categories = { product: 'Product update', changelog: 'Changelog', community: 'Community' };
const phases = { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved', scheduled: 'Scheduled' };
const services = { website: 'Website', discord: 'Discord bot', cad: 'CAD / MDT', erlc: 'ER:LC integration', music: 'Music' };
const severities = { minor: 'Minor', major: 'Major', critical: 'Critical', maintenance: 'Maintenance' };
const readableDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

export const publicationId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const stamp = value => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? '<time datetime="' + parsed.toISOString() + '">' + readableDate.format(parsed) + ' UTC</time>' : '';
};
const link = (path, title) => '<a href="' + path + '">' + escapeHtml(title) + '</a>';
const controlled = new Set(['home', 'features', 'commands', 'docs', 'faq', 'status', 'incidents', 'incident', 'staff', 'team', 'team-panel', 'blog', 'article', 'devlog', 'protection', 'dashboard', 'companion', 'cad', 'privacy', 'terms']);
const fallback = '<p class="publication-empty">Reports are temporarily unavailable.</p>';

export function maintenanceFor(content, page, id) {
    if (!controlled.has(page)) return null;
    const rules = content?.maintenance;
    if (!rules) return null;
    const detail = id ? rules[page + ':' + id] : null;
    const parent = page === 'article' ? rules.blog : page === 'incident' ? rules.incidents || rules.status : page === 'incidents' ? rules.status : null;
    return detail ?? rules[page] ?? parent ?? rules.all ?? null;
}

function articleList(content) {
    return [
        ...(Array.isArray(content?.articles) ? content.articles : []),
        ...(content?.devlogs ?? []).map(({id,title,text,at}) => ({ id, title, text, summary: text.slice(0, 150), category: 'changelog', publishedAt: at })),
    ].filter(article => article.published !== false && publicationId.test(article.id))
        .sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function incidentList(content) {
    return (Array.isArray(content?.incidents) ? content.incidents : []).filter(item => publicationId.test(item.id));
}

function articleCard(article) {
    return '<article class="publication-entry"><p class="publication-meta">' + escapeHtml(categories[article.category]) + ' · ' + stamp(article.publishedAt) +
        '</p><h2>' + link('/blog/' + article.id + '/', article.title) + '</h2><p>' + escapeHtml(article.summary) + '</p></article>';
}

function incidentCard(item) {
    const type = item.phase === 'resolved' ? 'resolved' : 'active';
    return '<article class="publication-entry"><p class="publication-meta"><span class="incident-label is-' + type + '">' +
        escapeHtml(phases[item.phase]) + '</span> ' + escapeHtml(services[item.service]) + ' · ' + stamp(item.updatedAt) +
        '</p><h3>' + link('/status/incidents/' + item.id + '/', item.title) + '</h3><p>' + escapeHtml(item.updates?.[0]?.text) + '</p></article>';
}

export function publicationView(page, content, id) {
    if (!content) return { unavailable: true, html: fallback };
    if (page === 'article') {
        const article = articleList(content).find(item => item.id === id);
        if (!article) return { missing: true };
        return { title: article.title, html: '<article class="publication-detail"><p class="publication-meta">' +
            escapeHtml(categories[article.category]) + ' · ' + stamp(article.publishedAt) + '</p><h1>' +
            escapeHtml(article.title) + '</h1><p class="publication-summary">' + escapeHtml(article.summary) +
            '</p><div class="publication-body">' + escapeHtml(article.text) + '</div></article>' };
    }
    if (page === 'incident') {
        const item = incidentList(content).find(incident => incident.id === id);
        if (!item) return { missing: true };
        return { title: item.title, html: '<article class="publication-detail"><p class="publication-meta">' +
            escapeHtml(services[item.service]) + ' · ' + escapeHtml(severities[item.severity]) + '</p><h1>' + escapeHtml(item.title) +
            '</h1><p class="publication-summary">Current phase · ' + escapeHtml(phases[item.phase]) +
            '</p><h2>Incident updates</h2><ol class="incident-timeline">' +
            item.updates.map(update => '<li><h3>' + escapeHtml(phases[update.phase]) + '</h3>' + stamp(update.at) +
                '<p class="publication-body">' + escapeHtml(update.text) + '</p></li>').join('') + '</ol></article>' };
    }
    if (page === 'blog') {
        const posts = articleList(content).filter(post => !maintenanceFor(content, 'article', post.id));
        return { html: posts.length ? posts.map(articleCard).join('') : '<p class="publication-empty">No articles have been published yet.</p>' };
    }
    if (page === 'status' && maintenanceFor(content, 'incidents')) {
        return { html: '<p class="publication-empty">Incident history is under maintenance.</p>' };
    }
    const incidents = incidentList(content).filter(item => !maintenanceFor(content, 'incident', item.id))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const active = incidents.filter(item => item.phase !== 'resolved' && item.phase !== 'scheduled').length;
    const scheduled = incidents.filter(item => item.phase === 'scheduled').length;
    const status = { operational: 'Operational', degraded: 'Degraded', maintenance: 'Maintenance', offline: 'Offline' };
    const override = status[content.status?.value];
    const notices = page === 'status'
        ? '<div class="incident-overview"><strong>' +
            (active ? active + (active === 1 ? ' active incident' : ' active incidents') : 'No active incidents reported') +
            '</strong>' + (scheduled ? '<span>' + scheduled + ' scheduled maintenance ' + (scheduled === 1 ? 'notice' : 'notices') + '</span>' : '') +
            (override ? '<p>Published bot status · ' + override + (content.status.message ? ' · ' + escapeHtml(content.status.message) : '') + '</p>' : '') + '</div>'
        : '';
    const items = page === 'status' ? incidents.slice(0, 4) : incidents;
    return { html: notices + (items.length ? items.map(incidentCard).join('') : '<p class="publication-empty">There are no published incident reports.</p>') };
}
