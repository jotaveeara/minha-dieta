/* =========================================================
   ROTINA — JOÃO — Service Worker
   Estratégia: cache-first para o app shell, com atualização
   em segundo plano. Funciona 100% offline após a 1ª visita.
   ========================================================= */

const CACHE_VERSION = "v8";
const CACHE_NAME = `joaofit-shell-${CACHE_VERSION}`;

// Caminhos relativos ao escopo do service worker — funciona tanto
// na raiz de um domínio quanto em um subcaminho (ex: GitHub Pages
// no formato usuario.github.io/repositorio/).
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./auth.js",
  "./supabase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("joaofit-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // só tratamos requisições GET do próprio app (mesma origem)
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));

      // cache-first: responde rápido com o cache e atualiza em segundo plano
      return cached || networkFetch;
    })
  );
});
