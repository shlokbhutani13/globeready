FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN cd server && npm ci --omit=dev
RUN cd client && npm ci

COPY server ./server
COPY client ./client

WORKDIR /app/client
RUN npm run build

WORKDIR /app

EXPOSE 5051

CMD ["node", "server/src/index.js"]
