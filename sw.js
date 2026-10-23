const CACHE_NAME = 'petits-explorateurs-v26';
const APP_FILES = [
  './', './index.html', './styles.css?v=14', './voice.js?v=11', './game-engine.js?v=12', './puzzle-game.js?v=7', './game.js?v=15', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
  './voice-lines.json', './content/animals.json', './content/credits.json',
];

// Photos and voice clips, listed from the same content files the game reads.
async function contentFiles() {
  const [lines, animals] = await Promise.all(['./voice-lines.json', './content/animals.json'].map((url) => fetch(url, { cache: 'reload' }).then((response) => response.json())));
  const voice = [lines.welcome && 'welcome', ...Object.entries(lines).filter(([group, value]) => typeof value === 'object' && !['names', 'named'].includes(group)).flatMap(([, value]) => Object.keys(value))];
  for (const name of Object.keys(lines.names || {})) voice.push(...Object.keys(lines.named || {}).map((key) => `names/${name}/${key}`));
  const files = [];
  for (const theme of animals.themes) {
    files.push(`./assets/themes/${theme.id}.webp`);
    voice.push(`t/${theme.id}/intro`, `t/${theme.id}/outro`);
    for (const animal of theme.animals) {
      files.push(`./assets/animals/${animal.id}.webp`);
      voice.push(...['prompt-1', 'prompt-2', 'yes-1', 'yes-2', 'name-1', 'name-2', 'hint-1', 'hint-2', 'fact', 'puzzle'].map((line) => `a/${animal.id}/${line}`));
    }
  }
  return [...files, ...voice.filter(Boolean).map((key) => `./assets/voice/${key}.m4a`)];
}

// Downloads a few files at a time and retries, since hosts like GitHub Pages answer a burst of
// hundreds of requests with occasional 503s. Returns the files that still failed.
async function store(cache, urls) {
  const queue = [...urls]; const failed = [];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        try { const response = await fetch(new Request(url, { cache: 'reload' })); if (response.ok) { await cache.put(url, response); ok = true; } } catch { /* retried below */ }
      }
      if (!ok) failed.push(url);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return failed;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // The app itself must be complete; a missing photo or clip is fetched later, when first used.
    if ((await store(cache, APP_FILES)).length) throw new Error('App files unavailable');
    await store(cache, await contentFiles());
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('petits-explorateurs-') && key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
