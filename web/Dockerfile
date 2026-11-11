# ==========================================
# CASE Studio AI — Web Dockerfile (Angular 22 + Nginx)
# Author: Cesar (julioficctcr7) - UAGRM FICCT
# ==========================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN (npm ci --no-audit --no-fund || npm install --legacy-peer-deps --no-audit --no-fund) && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

COPY . .
RUN npm run build -- --configuration=production && \
    rm -rf /app/.angular /tmp/*

FROM nginx:alpine AS runner

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

RUN printf '%s\n' \
    'server {' \
    '    listen 80;' \
    '    root /usr/share/nginx/html;' \
    '    index index.html index.htm;' \
    '    location = /index.html {' \
    '        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;' \
    '        expires -1;' \
    '    }' \
    '    location ~* \.(?:js|css|woff2?|png|jpg|jpeg|svg|ico)$ {' \
    '        expires 7d;' \
    '        add_header Cache-Control "public, immutable";' \
    '    }' \
    '    location / {' \
    '        try_files $uri $uri/ /index.html;' \
    '    }' \
    '}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
