<<<<<<< HEAD
FROM node:20-bullseye

WORKDIR /app

# Install build tools (safe fallback)
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files (IMPORTANT: include lockfile if exists)
COPY package.json package-lock.json* ./

# Install dependencies properly
RUN npm ci --omit=dev || npm install --omit=dev

# Copy rest of the app
COPY . .

# Railway uses dynamic port
ENV PORT=3000

CMD ["node", "index.js"]
=======
FROM node:22-slim

WORKDIR /app

# Install build tools required by better-sqlite3 (node-gyp needs Python + C++ compiler)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install deps first (Docker layer cache: only re-runs when package.json changes)
COPY package.json ./
RUN npm install --production

# Copy application source
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
>>>>>>> 4a0773302b884c34aedd108824a1c275c9438810
