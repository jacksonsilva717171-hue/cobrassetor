// CobraSetor — Service Worker v22
const CACHE = 'cobrassetor-v22';
const ASSETS = [
  './index.html',
  './js/config.js',
  './js/auth.js',
  './js/clientes.js',
  './js/cobrancas.js',
  './js/relatorios.js',
  './js/recibo.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Exo+2:wght@300;400;500;600&family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return c.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => {
      // Avisa todas as abas para recarregar depois que o novo SW ativar
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Requisições ao Google Sheets — sem cache
  if (e.request.url.includes('script.google.com') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('viacep.com') ||
      e.request.url.includes('brasilapi.com')) {
    return;
  }
  // Só o Cache API aceita gravar requisições GET — um POST (ou qualquer
  // outro método) que escape do filtro acima faz cache.put() rejeitar
  // (TypeError: método não suportado). Isso, mais o quota de armazenamento
  // do navegador, pode fazer caches.open().then(c => c.put(...)) falhar.
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          // Gravação em segundo plano — .catch() evita "Uncaught (in
          // promise)" quando cache.put() rejeita (quota cheia, etc.),
          // sem impedir a resposta de chegar à página.
          caches.open(CACHE)
            .then(c => c.put(e.request, clone))
            .catch(err => console.warn('SW: falha ao gravar no cache', e.request.url, err));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
