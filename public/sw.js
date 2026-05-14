// ⚠️ QUAN TRỌNG: Mỗi khi deploy mới, tăng version này lên (v3, v4, ...)
// để SW tự động xóa cache cũ và tải lại toàn bộ assets mới.
const CACHE_NAME = "app-cache-v2";

const PRECACHE_URLS = [
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Xoá TẤT CẢ cache cũ không khớp version hiện tại
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[SW] Xóa cache cũ:", name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Bỏ qua các request extension
  if (!(event.request.url.startsWith('http:') || event.request.url.startsWith('https:'))) return;

  const url = new URL(event.request.url);

  // API → Network First (không cache)
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // HTML → Network First (QUAN TRỌNG: luôn lấy HTML mới để tránh trang trắng khi deploy mới)
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets JS/CSS/images → Cache First với fallback network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
