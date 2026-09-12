FROM node:22-bookworm-slim

# Install FFmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Backend source
COPY backend ./backend

# Frontend
COPY index.html ./index.html
COPY app.js ./app.js
COPY styles.css ./styles.css

WORKDIR /app/backend

ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
