#!/bin/sh
set -e
cd /root/CRM/dist
v=$(date +%s)
sed -E -i "s@(src=\"/assets/index-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" index.html
sed -E -i "s@(href=\"/assets/index-[^\"]+\.css)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" index.html
sed -E -i "s@(href=\"/assets/icons-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" index.html
sed -E -i "s@(href=\"/assets/vendor-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" index.html
sed -E -i "s@(href=\"/assets/date-utils-[^\"]+\.js)(\?v=[0-9]+)?\"@\1?v=${v}\"@g" index.html
echo "version=$v"
sed -n '14,24p' index.html
