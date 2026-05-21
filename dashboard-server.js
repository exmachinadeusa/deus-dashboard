#!/usr/bin/env node
// ============================================================
// DEUS Dashboard Server — LocalTunnel (no deps)
// Serves: deus_dashboard.html + deus_mission_control.html
// Auth: Bearer token from .env DASHBOARD_TOKEN
// ============================================================

import http from 'http';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { parse } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DASHBOARD_PORT || 4200;

// Load env
const env = {};
readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) env[key.trim()] = val.trim();
});

const DASHBOARD_TOKEN = env.DASHBOARD_TOKEN || 'deus-secret-token-' + Math.random().toString(36).slice(2);

// ── Auth Check ───────────────────────────────────────────────
const checkAuth = (url) => {
  const parsed = parse(url, true);
  return parsed.query.token === DASHBOARD_TOKEN;
};

// ── Server ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Root: Menu
  if (url === '/' || url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <head>
          <title>DEUS Control Center</title>
          <style>
            body { background:#070d07; color:#00ff41; font-family:'Press Start 2P',monospace; padding:40px; text-align:center; }
            h1 { font-size:20px; letter-spacing:2px; margin-bottom:30px; }
            .menu { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; }
            a { background:#1a2e1a; border:2px solid #2a4a2a; color:#7fff00; padding:15px 20px; text-decoration:none; border-radius:8px; font-size:12px; transition:all 0.2s; }
            a:hover { background:#2a4a2a; border-color:#7fff00; }
            .token { margin-top:40px; font-size:10px; color:#4a7a4a; background:#0a140a; padding:15px; border-radius:4px; }
            code { background:#1a2e1a; padding:3px 8px; border-radius:3px; }
          </style>
        </head>
        <body>
          <h1>⚡ DEUS CONTROL CENTER</h1>
          <div class="menu">
            <a href="/dashboard?token=${DASHBOARD_TOKEN}">📊 Dashboard</a>
            <a href="/mission-control?token=${DASHBOARD_TOKEN}">🎮 Mission Control</a>
          </div>
          <div class="token">
            <p>Token: <code>${DASHBOARD_TOKEN.slice(0, 30)}...</code></p>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // Dashboard
  if (url.startsWith('/dashboard')) {
    if (!checkAuth(url)) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Access Denied</h1>');
      return;
    }
    const file = readFileSync(path.join(__dirname, 'deus_dashboard.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Mission Control
  if (url.startsWith('/mission-control')) {
    if (!checkAuth(url)) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Access Denied</h1>');
      return;
    }
    const file = readFileSync(path.join(__dirname, 'deus_mission_control.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Health
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ DEUS Dashboard Server aktif`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Token: ${DASHBOARD_TOKEN}`);
  console.log(`   Local: http://127.0.0.1:${PORT}/?token=${DASHBOARD_TOKEN}`);
});
