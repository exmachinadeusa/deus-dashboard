FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY dashboard-server.js ./
COPY deus_dashboard.html ./
COPY deus_mission_control.html ./

RUN npm install --omit=dev

EXPOSE 8080

CMD ["node", "dashboard-server.js"]
