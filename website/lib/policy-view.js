import { escapeHtml } from './publishing.js';
import { policyCopy } from '../assets/policy-copy.js';

function inline(text) {
    return text.split(/(\[[^\]\r\n]+\]\(https:\/\/[^\s)]+\))/).map(token => {
        const match = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(token);
        if (!match) return escapeHtml(token);
        try {
            const url = new URL(match[2]);
            if (url.protocol === 'https:' && !url.username && !url.password) {
                return '<a href="' + escapeHtml(url.href) + '">' + escapeHtml(match[1]) + '</a>';
            }
        } catch { /* Render malformed links as plain text. */ }
        return escapeHtml(token);
    }).join('');
}

export function policyView(document, stored) {
    const text = stored?.text ?? policyCopy[document];
    if (typeof text !== 'string') return '';
    const date = stored?.at ? new Date(stored.at) : new Date('2026-11-23T12:00:00.000Z');
    const byline = Number.isFinite(date.getTime()) ?
        '<p class="publication-meta">Last updated <time datetime="' + date.toISOString() + '">' +
        new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date) + '</time></p>' : '';
    const blocks = [];
    let list = [];
    const finishList = () => {
        if (list.length) blocks.push('<ul>' + list.map(item => '<li>' + inline(item) + '</li>').join('') + '</ul>');
        list = [];
    };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('- ')) {
            list.push(line.slice(2));
            continue;
        }
        finishList();
        if (line.startsWith('## ')) blocks.push('<h2>' + inline(line.slice(3)) + '</h2>');
        else if (line) blocks.push('<p>' + inline(line) + '</p>');
    }
    finishList();
    return byline + blocks.join('');
}
