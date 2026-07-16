FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./

RUN npm ci --omit=dev

COPY server/src ./src

EXPOSE 5051

CMD ["node", "src/index.js"]
