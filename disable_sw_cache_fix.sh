#!/bin/sh
set -e

cd /root/CRM

# 1) Replace SW files with self-cleaning unregister scripts
cat > dist/sw.js <<'EOF'
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'SW_DISABLED_AND_CACHE_CLEARED' }));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', () => {
  // No interception
});
EOF

cat > dist/service-worker.js <<'EOF'
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'SW_DISABLED_AND_CACHE_CLEARED' }));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', () => {
  // No interception
});
EOF

# 2) Ensure SW/manifest are never cached by nginx
python3 - <<'PY'
from pathlib import Path
p = Path('/root/CRM/nginx/production.conf')
txt = p.read_text(encoding='utf-8')
block = """
    location = /sw.js {
        root /usr/share/nginx/html;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location = /service-worker.js {
        root /usr/share/nginx/html;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location = /manifest.webmanifest {
        root /usr/share/nginx/html;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
"""
if 'location = /sw.js' not in txt:
    txt = txt.replace(
        '    # Compression\n    gzip on;',
        block + '\n    # Compression\n    gzip on;'
    )
if txt.count('location = /sw.js') > 1:
    parts = txt.split('location = /sw.js')
    txt = parts[0] + 'location = /sw.js' + parts[1]
p.write_text(txt, encoding='utf-8')
print('production.conf updated')
PY

# 3) Cache-bust index refs to pull fresh app shell now
v=$(date +%s)
sed -E -i "s@(src=\"/assets/index-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/index-[^\"]+\.css)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/icons-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/vendor-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/date-utils-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
echo "cache-bust version=${v}"

echo "done"
