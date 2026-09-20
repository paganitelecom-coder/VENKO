// Service Worker VENKO — cache do shell do app
//
// IMPORTANTE: sempre que alterar index.html, login.html, css/styles.css,
// js/app.js, js/draft.js ou js/init.js, SUBA o número da versão abaixo
// (v6 -> v7...) pra forçar o navegador a descartar o cache antigo.
const CACHE_NAME = 'venko-cache-v8';

// App shell: casca do app, raramente muda de estrutura — cache-first
// (responde na hora, sem esperar rede) e atualiza em segundo plano.
const ARQUIVOS_CACHE = [
  './login.html',
  './index.html',
  './css/styles.css',
  './js/draft.js',
  './js/app.js',
  './js/init.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo-venko.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ARQUIVOS_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// URLs versionadas de terceiros (o número/hash na própria URL nunca
// muda de conteúdo) — seguro cachear por muito tempo, cache-first.
// Cobre a lib xlsx (carregada sob demanda no botão Exportar) e as
// fontes do Google (CSS + arquivos .woff2).
function ehRecursoVersionado(url) {
  return url.hostname === 'cdnjs.cloudflare.com'
      || url.hostname === 'fonts.googleapis.com'
      || url.hostname === 'fonts.gstatic.com';
}

// Chamadas de negócio (Google Sheets / ViaCEP) — dados que mudam e
// precisam ser frescos sempre que houver rede. Aqui sim faz sentido
// tentar a rede primeiro; o cache só entra como fallback offline.
// Não guardamos aqui nada com dado de cliente além do que o próprio
// app já mantém em localStorage — é só uma rede de segurança.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // nunca intercepta POST (envio de ficha etc.)

  const url = new URL(req.url);

  // ── App shell (mesma origem do site): cache-first + atualização em segundo plano ──
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const buscaNaRede = fetch(req).then(resp => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
          }
          return resp;
        }).catch(() => cached);
        return cached || buscaNaRede;
      })
    );
    return;
  }

  // ── Libs/fontes versionadas de terceiros: cache-first (nunca mudam de conteúdo) ──
  if (ehRecursoVersionado(url)) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
        }
        return resp;
      }))
    );
    return;
  }

  // ── Google Sheets, ViaCEP e qualquer outra coisa: rede primeiro, ──
  // cache só como fallback se estiver offline. Mantém o comportamento
  // original pra esses casos, onde dado fresco importa mais que velocidade.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
