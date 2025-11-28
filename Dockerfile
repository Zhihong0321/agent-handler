FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source
COPY src ./src
COPY public ./public
COPY docs ./docs
COPY .env.example ./
COPY bill.csv ./
COPY bill.json ./

# Build and prune dev deps
RUN npm run build && npm prune --production

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
