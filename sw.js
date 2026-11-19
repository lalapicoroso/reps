// ─────────────────────────────────────────
// SERVICE WORKER de Reps (v2)
// Siempre le pregunta al servidor "¿hay algo nuevo?" (no-cache).
// Si no hay señal, usa la copia guardada.
// ─────────────────────────────────────────
const CACHE = "reps-v46";   // al cambiar este nombre, se borran las copias viejas

const ARCHIVOS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "importar.js",
  "nutricion.js",
  "gestion.js",
  "agenda.js",
  "temas.js",
  "hoy.js",
  "rutina.js",
  "entreno.js",
  "avisos.js",
  "registros.js",
  "personalidad.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
];

// 1. Instalación: guarda copias (si alguna falla, sigue igual)
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ARCHIVOS.map((archivo) => cache.add(archivo).catch(() => null)))
    )
  );
  self.skipWaiting();
});

// 2. Activación: borra las copias de versiones anteriores
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3. Cada pedido: primero el servidor (sin usar caché vieja), si falla → copia guardada
self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET" || new URL(pedido.url).origin !== location.origin) return;

  evento.respondWith(
    // cache: "no-cache" = "antes de usar algo guardado, preguntale al servidor si cambió"
    fetch(pedido.url, { cache: "no-cache" })
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return respuesta;
      })
      .catch(() =>
        // Sin señal: usamos la copia (ignoreSearch = "app.js?v=19" sirve como "app.js")
        caches.match(pedido, { ignoreSearch: true }).then((r) => r || caches.match("./"))
      )
  );
});