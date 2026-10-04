FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./

RUN npm ci --omit=dev

ENV NODE_ENV=production

COPY server/src ./src

EXPOSE 5051

CMD ["node", "src/index.js"]
