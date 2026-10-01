FROM node:20-slim

WORKDIR /app

COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm ci --omit=dev

COPY backend/ ./

WORKDIR /app
COPY analyzer/ ./analyzer/

RUN mkdir -p /app/storage /app/backend/storage

ENV NODE_ENV=production

EXPOSE 5000

WORKDIR /app/backend

CMD ["npm", "start"]
