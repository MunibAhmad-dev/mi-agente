# opencode-bridge — Dockerfile
# ------------------------------------------------------------------------------
# Fase 2 (Docker). Imagen mínima: el bridge no tiene dependencias de npm (solo
# usa node:http y node:crypto de la librería estándar — ver package.json,
# sin campo "dependencies"), así que no hace falta `npm ci`.
#
# Estado de verificación: la imagen se revisó línea por línea contra
# src/server.ts y package.json reales del repo, y `node --check` (sintaxis)
# se corrió sobre server.ts y docker-entrypoint.sh en el entorno de
# construcción. NO se pudo hacer `docker build` ni levantar el contenedor
# real (sin Docker disponible en el entorno donde se escribió esto) — falta
# que lo confirmes con un build real.
# ------------------------------------------------------------------------------

FROM node:22-alpine

# Node >=22.6 soporta --experimental-strip-types de forma nativa (requerido
# por el script "start" de package.json). node:22-alpine trae una versión
# reciente del canal 22.x que lo incluye.
RUN node --version

WORKDIR /app

COPY package.json ./
COPY src/ ./src/
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh \
    # Usuario "node" ya viene en la imagen oficial; nos aseguramos de que sea
    # dueño de /app para poder correr sin root.
    && chown -R node:node /app \
    # Directorio de persistencia del mapa de sesiones (BRIDGE_STATE_FILE,
    # Fase A2): se monta como volumen en docker-compose.override.yml y debe
    # ser escribible por el usuario node.
    && mkdir -p /data && chown node:node /data

USER node

EXPOSE 8787

ENV BRIDGE_PORT=8787

# Healthcheck sin dependencias externas: usa el propio Node para pegarle a
# /v1/models. No manda Authorization a propósito — con BRIDGE_API_KEY
# configurada esto devuelve 401, que igual demuestra que el proceso está
# vivo y respondiendo HTTP (curl -f fallaría igual con 401; con Node
# hacemos un chequeo más laxo: cualquier respuesta HTTP = "healthy").
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.BRIDGE_PORT||8787,path:'/v1/models',timeout:4000},(r)=>{process.exit(0)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
