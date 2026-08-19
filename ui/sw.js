// VAULT LAB — Service Worker
// 目的: iPhoneでホーム画面に追加した際にオフラインでも起動できるようにする最小構成。
// キャッシュ戦略: 静的ファイルは cache-first、それ以外は network-first（失敗時のみキャッシュ）。

const CACHE_VERSION = 'vaultlab-v1'; // ← ファイルを更新したらこの数字を上げてください（v2, v3...）
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/vault-lab.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting(); // 新しいSWをすぐ有効化（開発中は更新をすぐ反映したいため）
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)) // 古いバージョンのキャッシュを掃除
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET以外（POSTなど）はキャッシュ対象外
  if (request.method !== 'GET') return;

  // 同一オリジンのみキャッシュ対象（外部CDN等はブラウザ標準に任せる）
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // 成功したレスポンスは常に最新版としてキャッシュを更新
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached); // オフライン時はキャッシュにフォールバック

      // キャッシュがあれば即返しつつ裏で更新（stale-while-revalidate）
      return cached || network;
    })
  );
});
