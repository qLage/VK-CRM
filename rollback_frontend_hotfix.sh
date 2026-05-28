#!/bin/sh
set -e

cd /root/CRM

# 1) Remove injected runtime script from dist/index.html
if grep -q 'object-create-dialog-fix' dist/index.html; then
  sed -i '/<script id="object-create-dialog-fix">/,/<\/script>/d' dist/index.html
  echo "Removed object-create-dialog-fix script from dist/index.html"
else
  echo "No injected object-create-dialog-fix script found"
fi

# 2) Restore original bundle if backup exists
if [ -f dist/assets/index-CfEj8SIe.js.bak ]; then
  cp dist/assets/index-CfEj8SIe.js.bak dist/assets/index-CfEj8SIe.js
  echo "Restored dist/assets/index-CfEj8SIe.js from backup"
else
  echo "Bundle backup not found, skipping restore"
fi

# 3) Keep cache-busting query params intact (safe), just show head section
sed -n '14,28p' dist/index.html
