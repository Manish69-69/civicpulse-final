FROM node:20-bullseye

WORKDIR /app

# Install build tools (safe fallback)
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy rest of the app
COPY . .

# Railway dynamic port
ENV PORT=3000

# Start app
CMD ["node", "index.js"]