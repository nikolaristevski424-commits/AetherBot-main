import { cpSync, mkdirSync } from 'node:fs';

// Routed HTML stays in the page function bundle, outside public build output.
mkdirSync('dist/companion', { recursive: true });
for (const path of ['assets', '404.html', 'login', 'privacy', 'terms']) cpSync(path, 'dist/' + path, { recursive: true });
for (const name of ['sw.js', 'manifest.webmanifest', 'companion.js', 'icon.svg']) cpSync('companion/' + name, 'dist/companion/' + name);
