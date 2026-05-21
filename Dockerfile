FROM node:22-alpine

WORKDIR /app

# Copy files
COPY package*.json ./
COPY .env ./
COPY dashboard-server.js ./
COPY deus_dashboard.html ./
COPY deus_mission_control.html ./

# Install deps
RUN npm ci --only=production

# Expose port
EXPOSE 4200

# Start
CMD ["node", "dashboard-server.js"]
