// ─────────────────────────────────────────
// SERVICE WORKER de Reps
// Estrategia "primero internet": siempre intenta traer la versión
// más nueva; si no hay señal, usa la copia guardada.
// (Así no vuelve a pasar lo de ver la versión vieja 😉)
// ─────────────────────────────────────────
const CACHE = "reps-v1";

const ARCHIVOS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
];

// 1. Instalación: guarda una copia de los archivos básicos
self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

// 2. Activación: borra copias viejas de versiones anteriores
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3. Cada pedido: primero internet, si falla → copia guardada
self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;

  // Solo nuestros archivos (los datos de Supabase NO se guardan acá)
  if (pedido.method !== "GET" || new URL(pedido.url).origin !== location.origin) return;

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        return respuesta;
      })
      .catch(() => caches.match(pedido).then((r) => r || caches.match("./")))
  );
});