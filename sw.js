/* =========================================================
   ROTINA — JOÃO — Service Worker
   Estratégia: network-first para código e cache-first para mídia.
   Evita misturar HTML novo com JavaScript antigo após publicações.
   ========================================================= */

const CACHE_VERSION = "v17";
const CACHE_NAME = `joaofit-shell-${CACHE_VERSION}`;

// Caminhos relativos ao escopo do service worker — funciona tanto
// na raiz de um domínio quanto em um subcaminho (ex: GitHub Pages
// no formato usuario.github.io/repositorio/).
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=17",
  "./script.js?v=17",
  "./auth.js?v=17",
  "./supabase-config.js?v=17",
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

  const codeRequest = req.mode === "navigate" || ["script", "style", "document"].includes(req.destination);
  if (codeRequest) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(async () => (await caches.match(req)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      }
      return res;
    }))
  );
});
