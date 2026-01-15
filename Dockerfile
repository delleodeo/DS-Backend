FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM base AS dev
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

FROM base AS prod
COPY . .
RUN npm install -g pm2
EXPOSE 3001
CMD ["pm2-runtime", "start", "server.js"]
