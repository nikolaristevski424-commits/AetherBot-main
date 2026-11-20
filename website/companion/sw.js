const VERSION='aether-companion-v3';const PUBLIC=['/companion/','/companion/companion.js','/companion/manifest.webmanifest','/assets/site.css','/assets/theme.css','/assets/theme.js','/assets/quicknav.css','/assets/quicknav.js','/assets/aether-mark.webp'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(PUBLIC)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache authentication, private API responses or signed sessions.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(!PUBLIC.includes(url.pathname))return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});