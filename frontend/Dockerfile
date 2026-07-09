# ============================================================
# STAGE 1: "builder" — React app ko build karta hai
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Package files pehle copy karo (caching ke liye)
COPY package*.json ./

# Saari dependencies install karo (devDependencies bhi chahiye build ke liye)
RUN npm install

# Source code copy karo
COPY . .

# Vite build run karo — ye /app/dist folder banata hai
# Dist folder mein hote hain: index.html + compressed JS/CSS files
# Yahi production mein serve hota hai
RUN npm run build

# ============================================================
# STAGE 2: "runner" — Sirf static files serve karo
# ============================================================
# nginx:alpine = Ultra-lightweight web server (2MB!)
# Hum Node.js bhi nahi chahiye production frontend ke liye
# Nginx static files bahut fast serve karta hai
FROM nginx:alpine AS runner

# Builder se compiled dist folder copy karo nginx ke default serve location pe
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config copy karo (port 3005 pe listen karne ke liye)
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

# Port 3005 expose karo
EXPOSE 3005

# nginx start karo in foreground
# "daemon off" = background mein mat jao, foreground mein raho
# Docker containers background process se band ho jaate hain
CMD ["nginx", "-g", "daemon off;"]