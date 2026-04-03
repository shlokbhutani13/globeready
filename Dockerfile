FROM node:18-alpine

WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN cd server && npm install --production
RUN cd client && npm install

COPY server ./server
COPY client ./client

WORKDIR /app/client
RUN npm run build

WORKDIR /app

EXPOSE 5051

CMD ["node", "server/server.js"]