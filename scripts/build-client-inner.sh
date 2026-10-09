#!/bin/sh
# build-client-inner.sh — se ejecuta DENTRO del contenedor LibreChat.
# Reconstruye /app/client/dist con los fuentes custom (FASE 16: icono Ollama
# + panel "Modelos locales" en el selector de modelos).
#
# La imagen upstream no trae toolchain de build (no hay vite), por lo que las
# devDeps de build se instalan en /tmp/clientdeps (árbol standalone, con
# strict-ssl=false porque la red local termina TLS con un cert propio) y se
# enlazan al client. Las librerías compartidas (react, react-dom, react-query)
# se apuntan a las copias de la app para evitar doble instancia (crash de hooks).
set -e

cd /app/client

# 1) DevDeps de build en /tmp/clientdeps
if [ ! -x /tmp/clientdeps/node_modules/.bin/vite ]; then
  mkdir -p /tmp/clientdeps
  cat > /tmp/clientdeps/package.json <<'PKGEOF'
{
  "name": "client-build-deps",
  "private": true,
  "version": "1.0.0",
  "devDependencies": {
    "vite": "^8.0.16",
    "@vitejs/plugin-react": "^6.0.2",
    "vite-plugin-node-polyfills": "^0.28.0",
    "vite-plugin-pwa": "^1.3.0",
    "vite-plugin-compression2": "^2.5.3",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.31",
    "postcss-preset-env": "^11.2.0",
    "autoprefixer": "^10.4.20",
    "typescript": "^5.9.3",
    "fs-extra": "^11.2.0",
    "@tanstack/react-query-devtools": "^4.29.0",
    "monaco-editor": "^0.55.1"
  }
}
PKGEOF
  cd /tmp/clientdeps
  npm install --strict-ssl=false > /tmp/npm-deps.log 2>&1

  # Librerías compartidas → copias de la app (evita doble React / react-query)
  rm -rf node_modules/react node_modules/react-dom
  ln -sfn /app/node_modules/react node_modules/react
  ln -sfn /app/node_modules/react-dom node_modules/react-dom
  rm -rf node_modules/@tanstack/react-query node_modules/@tanstack/query-core
  ln -sfn /app/node_modules/@tanstack/react-query node_modules/@tanstack/react-query
  ln -sfn /app/node_modules/@tanstack/query-core node_modules/@tanstack/query-core
fi

# 2) Symlinks en el client para que vite resuelva las devDeps
mkdir -p /app/client/node_modules
# 2.1) El dist de @librechat/client (/app/packages/client/dist) importa
# lucide-react y rolldown lo busca subiendo desde /app/packages — se enlaza al
# root del monorepo (sin esto el build falla con "failed to resolve").
mkdir -p /app/node_modules
ln -sfn /app/client/node_modules/lucide-react /app/node_modules/lucide-react
cd /app/client/node_modules
for p in vite @vitejs/plugin-react vite-plugin-node-polyfills vite-plugin-pwa \
         vite-plugin-compression2 tailwindcss postcss postcss-preset-env \
         autoprefixer typescript fs-extra monaco-editor; do
  ln -sfn "/tmp/clientdeps/node_modules/$p" "$p"
done
mkdir -p @tanstack
ln -sfn /tmp/clientdeps/node_modules/@tanstack/react-query-devtools @tanstack/react-query-devtools

# 3) Build del bundle
cd /app/client
# Limpia caché de transformación de vite (evita chunks viejos tras editar fuentes)
rm -rf /app/client/node_modules/.vite /app/client/node_modules/.vite-temp \
       /tmp/clientdeps/node_modules/.vite 2>/dev/null || true
NODE_ENV=production NODE_OPTIONS=--max-old-space-size=4096 \
  node /tmp/clientdeps/node_modules/vite/bin/vite.js build > /tmp/client-build.log 2>&1
node scripts/post-build.cjs >> /tmp/client-build.log 2>&1

echo "OK: bundle del cliente reconstruido"
