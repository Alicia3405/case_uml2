# ==========================================
# CASE Studio AI — Backend Dockerfile (NestJS)
# Author: Cesar (julioficctcr7) - UAGRM FICCT
# ==========================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install --legacy-peer-deps

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/modules/code-generator/templates ./dist/modules/code-generator/templates

EXPOSE 3000

CMD ["node", "dist/main"]
