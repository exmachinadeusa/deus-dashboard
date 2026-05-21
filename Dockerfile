FROM node:22-alpine

WORKDIR /app

# dashboard-server.js sadece built-in Node modülleri kullanıyor
# (http, path, fs, url) — npm install gerekmez
RUN echo '{"name":"deus-dashboard","version":"1.0.0","type":"module"}' > package.json

COPY dashboard-server.js ./
COPY deus_dashboard.html ./
COPY deus_mission_control.html ./

EXPOSE 8080

CMD ["node", "dashboard-server.js"]
