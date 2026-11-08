# Yunex pipeline: fetch -> bronze -> silver -> gold, with quality checks between layers.
FROM node:22-alpine
WORKDIR /backend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY pipeline ./pipeline
USER node
ENTRYPOINT ["node", "pipeline/run.js"]
