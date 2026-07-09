# ============================================================
# STAGE 1: "builder" — Dependencies install karta hai
# ============================================================
# node:20-alpine → Lightweight Linux image with Node.js 20
# "alpine" = 5MB base image vs normal 900MB — production mein
# hamesha alpine use karo
FROM node:20-alpine AS builder

# /app folder ko working directory set karo
# Saare aage ke commands yahan se chalenge
WORKDIR /app

# Pehle sirf package files copy karo
# Kyun? Docker layer caching — agar code change ho lekin
# package.json na badla, toh npm install dobara nahi chalega
# (build fast hogi)
COPY package*.json ./

# Production dependencies install karo
# --omit=dev = devDependencies skip karo (nodemon, etc.)
# Production mein dev tools ki zaroorat nahi
RUN npm install --omit=dev

# Ab baaki saara source code copy karo
COPY . .

# ============================================================
# STAGE 2: "runner" — Actual container jo chalega
# ============================================================
# Fresh alpine image — koi build tools nahi, sirf runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Security: "node" naam ka non-root user already alpine mein hota hai
# Root pe app chalana dangerous hai — agar hack ho toh
# poora system compromised ho sakta hai
# Is command se "node" user ko /app ka ownership dete hain
RUN chown -R node:node /app

# Ab "node" user pe switch karo (non-root)
USER node

# Builder stage se sirf compiled/installed files copy karo
# (source code ki zaroorat nahi production mein)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/index.js ./
COPY --from=builder --chown=node:node /app/db.js ./

# Port expose karo (documentation ke liye, actual binding docker-compose mein hoti hai)
EXPOSE 5000

# Health check — Docker ko batao app healthy hai ya nahi
# Every 30s check karo, 10s wait karo response ka, 3 attempts
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Production command — "npm run dev" NAHI, seedha node chalao
# nodemon restart karta hai file change pe — production mein ye nahi chahiye
CMD ["node", "index.js"]