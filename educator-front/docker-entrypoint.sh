#!/bin/sh
set -e

# Replace VITE_API_URL placeholder in all JS files at container startup
if [ -n "$VITE_API_URL" ]; then
  find /app -type f -name '*.js' -exec sed -i "s|__VITE_API_URL_PLACEHOLDER__|${VITE_API_URL}|g" {} \;
  echo "Injected VITE_API_URL: ${VITE_API_URL}"
else
  echo "WARNING: VITE_API_URL is not set!"
fi

exec "$@"
