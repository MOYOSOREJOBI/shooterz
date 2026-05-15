FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev

# Copy source
COPY . .

# Non-root user for security
RUN addgroup -S shooterz && adduser -S shooterz -G shooterz
USER shooterz

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
