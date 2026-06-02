FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++ tini

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Codigo da aplicacao
COPY src ./src
COPY public ./public
COPY database ./database

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","src/server.js"]
