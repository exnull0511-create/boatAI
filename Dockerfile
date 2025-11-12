FROM node:22-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack and setup pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency files first (for better caching)
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install node-gyp globally and build better-sqlite3
RUN npm install -g node-gyp && \
    cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && \
    node-gyp rebuild && \
    cd /app

# Copy source code
COPY . .

ENV TZ=Asia/Tokyo \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["pnpm", "dev"]




