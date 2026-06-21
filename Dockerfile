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

RUN mkdir -p /app/data

# entrypoint script que garante /app/data writable antes de rodar o node
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# IMPORTANTE: rodando como root pra conseguir escrever no Volume do Railway
# (o mount point pertence a uid 0 e nao podemos chown depois sem root)
ENTRYPOINT ["/sbin/tini","--","/docker-entrypoint.sh"]
CMD ["node","src/server.js"]
