# Scam Guardian API + web UI. No npm dependencies (Node built-ins only).
FROM node:22-alpine
WORKDIR /app
COPY server.js store.js rules.js scam-check.js scenarios.js index.html lab.js lab.css live.js ./
COPY live ./live
COPY audio ./audio
COPY eval/results.json ./eval/results.json
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "server.js"]
