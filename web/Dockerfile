# ==========================================
# CASE Studio AI — Web Dockerfile (Angular 22 + Nginx)
# Author: Cesar (julioficctcr7) - UAGRM FICCT
# ==========================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build --configuration=production

FROM nginx:alpine AS runner

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
