#!/bin/sh
set -e

cd /root/CRM/dist

# Remove any injected runtime fixes from index.html
sed -i '/object-create-dialog-fix/d' index.html || true
sed -i '/object-dialog-fix\.js/d' index.html || true

# Remove any injected script block if still present
sed -i '/<script id="object-create-dialog-fix">/,/<\/script>/d' index.html || true

# Restore original bundle from backup if exists
if [ -f assets/index-CfEj8SIe.js.bak ]; then
  cp assets/index-CfEj8SIe.js.bak assets/index-CfEj8SIe.js
fi

# Delete extra custom file if present
rm -f /root/CRM/dist/object-dialog-fix.js || true

echo "Rollback complete. Current index.html head/body:"
sed -n '14,30p' index.html
