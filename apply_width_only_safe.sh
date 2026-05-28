#!/bin/sh
set -e

cd /root/CRM

# Safety: ensure no runtime injected scripts remain
sed -i '/object-create-dialog-fix/d' dist/index.html || true
sed -i '/object-dialog-fix\.js/d' dist/index.html || true
sed -i '/<script id="object-create-dialog-fix">/,/<\/script>/d' dist/index.html || true
rm -f dist/object-dialog-fix.js || true

# Apply only width fallback patch in active bundle
if grep -q 'dialog-content-max-width,32rem' dist/assets/index-CfEj8SIe.js; then
  sed -i 's/dialog-content-max-width,32rem/dialog-content-max-width,1500px/g' dist/assets/index-CfEj8SIe.js
  echo "Patched dialog fallback width to 1500px"
else
  echo "Fallback marker not found or already patched"
fi

# Cache-bust active assets so browser gets update immediately
v=$(date +%s)
sed -E -i "s@(src=\"/assets/index-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/index-[^\"]+\.css)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/icons-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/vendor-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
sed -E -i "s@(href=\"/assets/date-utils-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" dist/index.html
echo "Cache-bust version=${v}"
sed -n '14,28p' dist/index.html
