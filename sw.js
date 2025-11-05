// ================== 修正后的 sw.js ==================
const CACHE_NAME = 'video-app-cache-v1.0.0'; // 与index.html版本一致
const CURRENT_VERSION = '1.0.0'; 
const UPDATE_JSON_URL = 'https://wyw1.netlify.app/update.json'; 

const CACHE_RESOURCES = [
    '/', 
    '/index.html', 
    '/video-list.xlsx',
    'https://vjs.zencdn.net/8.6.1/video.min.js',
    'https://vjs.zencdn.net/8.6.1/video-js.css',
    'https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// 1. 安装阶段：缓存核心资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_RESOURCES))
            .then(() => self.skipWaiting()) 
    );
});

// 2. 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name)) 
            );
        }).then(() => self.clients.claim()) 
    );
});

// 3. 请求阶段：优化缓存策略（关键修正）
self.addEventListener('fetch', (event) => {
    // 关键：对update.json请求设置「不缓存」，确保每次获取最新
    if (event.request.url === UPDATE_JSON_URL) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }) // 禁止缓存update.json
                .then(networkResponse => {
                    // 检测到新版本，通知页面
                    if (networkResponse.ok) {
                        networkResponse.clone().json().then(updateData => {
                            if (compareVersion(updateData.latestVersion, CURRENT_VERSION) > 0) {
                                self.clients.matchAll().then(clients => {
                                    clients.forEach(client => {
                                        client.postMessage({
                                            type: 'UPDATE_AVAILABLE',
                                            updateData: updateData
                                        });
                                    });
                                });
                            }
                        });
                    }
                    return networkResponse;
                })
                .catch(error => {
                    console.error("获取update.json失败：", error);
                    return new Response(JSON.stringify({
                        latestVersion: CURRENT_VERSION,
                        updateLog: "网络异常，无法验证版本"
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                })
        );
        return; // 单独处理update.json，不进入后续缓存逻辑
    }

    // 其他资源：缓存优先+后台更新
    if (!event.request.url.startsWith(self.location.origin) && !CACHE_RESOURCES.includes(event.request.url)) {
        return;
    }
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const networkPromise = fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse.ok) {
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, networkResponse.clone()));
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse);
                return cachedResponse || networkPromise;
            })
    );
});

// 版本对比工具（不变）
function compareVersion(a, b) {
    const aArr = a.split('.').map(Number);
    const bArr = b.split('.').map(Number);
    const maxLen = Math.max(aArr.length, bArr.length);
    for (let i = 0; i < maxLen; i++) {
        const aVal = aArr[i] || 0;
        const bVal = bArr[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
}
