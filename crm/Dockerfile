# Satal — uygulama kalıbı
FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Europe/Istanbul
WORKDIR /uygulama
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY migrations ./migrations
COPY data ./data
COPY scripts ./scripts
COPY src ./src
RUN mkdir -p /veri/yuklemeler && chown -R node:node /veri
ENV YUKLEME_KLASORU=/veri/yuklemeler PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/saglik').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Önce veritabanını günceller, sonra uygulamayı başlatır.
CMD ["sh", "-c", "node scripts/migrate.js && node src/sunucu.js"]
