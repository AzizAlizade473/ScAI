# Scam Guardian app (server.js at the repo root) with the MySQL store.
# Built by Backend/docker-compose.yml with the repo root as build context.
# No keys are copied into the image: they come from Backend/.env at run time.
FROM node:22-alpine
WORKDIR /app
COPY Backend/package.json Backend/package-lock.json ./Backend/
RUN cd Backend && npm ci --omit=dev --no-audit --no-fund
COPY server.js store.js rules.js scam-check.js scenarios.js index.html lab.js lab.css live.js call.js ./
COPY live ./live
COPY audio ./audio
COPY eval/results.json ./eval/results.json
COPY Backend/app ./Backend/app
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
USER node
CMD ["node", "server.js"]
