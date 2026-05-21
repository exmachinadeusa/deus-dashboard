#!/usr/bin/env node
// ============================================================
// DEUS Dashboard Server — Railway
// Serves: deus_dashboard.html + deus_mission_control.html
// Auth: ?token=DASHBOARD_TOKEN query param
// Env vars (Railway): DASHBOARD_TOKEN, SUPABASE_ANON_KEY, PORT
// ============================================================

import http from 'http';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { parse } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Railway sets PORT automatically; fallback 8080
const PORT = process.env.PORT || 8080;
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || 'deus-' + Math.random().toString(36).slice(2);
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ezmamahyyvqppjlzqazb.supabase.co';

// ── Auth ─────────────────────────────────────────────────────
const checkAuth = (url) => {
  const { query } = parse(url, true);
  return query.token === DASHBOARD_TOKEN;
};

// ── HTML inject ───────────────────────────────────────────────
// Replaces YOUR_ANON_KEY and SUPABASE_URL placeholders at runtime
const injectKeys = (html) => {
  return html
    .replace("'YOUR_ANON_KEY'", `'${SUPABASE_ANON_KEY}'`)
    .replace("'https://ezmamahyyvqppjlzqazb.supabase.co'", `'${SUPABASE_URL}'`);
};

// ── Login sayfası ────────────────────────────────────────────
const loginPage = (redirectTo = '/dashboard') => `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEUS — Giriş</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#070d07;color:#00ff41;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;height:100vh}
  .box{background:#0a1a0a;border:1px solid #1a3a1a;border-radius:8px;padding:40px;width:320px;text-align:center}
  h1{font-size:14px;letter-spacing:2px;margin-bottom:8px}
  .sub{font-size:9px;color:#4a7a4a;margin-bottom:28px}
  input{width:100%;background:#040904;border:1px solid #1a3a1a;color:#00ff41;font-family:'Courier New',monospace;font-size:13px;padding:10px 14px;border-radius:4px;outline:none;margin-bottom:14px}
  input:focus{border-color:#2a5a2a}
  button{width:100%;background:#0f2a0f;border:1px solid #2a5a2a;color:#00ff41;font-family:'Courier New',monospace;font-size:11px;padding:11px;border-radius:4px;cursor:pointer;letter-spacing:1px}
  button:hover{background:#1a3a1a;border-color:#00ff41}
  .err{color:#ff6666;font-size:9px;margin-top:10px;display:none}
</style>
</head>
<body>
<div class="box">
  <h1>⚡ DEUS</h1>
  <div class="sub">MISSION CONTROL — GİRİŞ</div>
  <form method="GET" action="${redirectTo}">
    <input type="password" name="token" placeholder="Erişim kodu..." autofocus>
    <button type="submit">GİRİŞ YAP</button>
  </form>
</div>
</body>
</html>`;

// ── Ana menü ─────────────────────────────────────────────────
const menuPage = () => `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEUS Control Center</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#070d07;color:#00ff41;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;height:100vh}
  .wrap{text-align:center}
  h1{font-size:16px;letter-spacing:3px;margin-bottom:8px}
  .sub{font-size:9px;color:#4a7a4a;margin-bottom:36px}
  .menu{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
  a{background:#0a1a0a;border:1px solid #1a3a1a;color:#7fff00;padding:18px 24px;text-decoration:none;border-radius:6px;font-size:10px;letter-spacing:1px;transition:all .15s;display:block}
  a:hover{background:#1a2e1a;border-color:#7fff00}
  .pip{width:8px;height:8px;background:#00ff41;border-radius:50%;display:inline-block;margin-right:8px;animation:p 1.5s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.2}}
</style>
</head>
<body>
<div class="wrap">
  <h1><span class="pip"></span>DEUS CONTROL</h1>
  <div class="sub">SUNNYVALE OPS CENTER v2.0</div>
  <div class="menu">
    <a href="/dashboard?token=${DASHBOARD_TOKEN}">📊 Dashboard</a>
    <a href="/mission-control?token=${DASHBOARD_TOKEN}">🎮 Mission Control</a>
  </div>
</div>
</body>
</html>`;

// ── Server ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url || '/';

  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check (Railway)
  if (url === '/health' || url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
    return;
  }

  // Root → menü (token ile) veya login
  if (url === '/' || url.startsWith('/?')) {
    if (checkAuth(url)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(menuPage());
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginPage('/'));
    }
    return;
  }

  // Dashboard
  if (url.startsWith('/dashboard')) {
    if (!checkAuth(url)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginPage('/dashboard'));
      return;
    }
    try {
      const raw = readFileSync(path.join(__dirname, 'deus_dashboard.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injectKeys(raw));
    } catch {
      res.writeHead(500);
      res.end('Dashboard dosyası bulunamadı');
    }
    return;
  }

  // Mission Control
  if (url.startsWith('/mission-control')) {
    if (!checkAuth(url)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginPage('/mission-control'));
      return;
    }
    try {
      const raw = readFileSync(path.join(__dirname, 'deus_mission_control.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(raw);
    } catch {
      res.writeHead(500);
      res.end('Mission Control dosyası bulunamadı');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Railway: 0.0.0.0 dinle (127.0.0.1 değil)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ DEUS Dashboard Server aktif`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Token    : ${DASHBOARD_TOKEN.slice(0, 12)}...`);
  console.log(`   Supabase : ${SUPABASE_URL}`);
  console.log(`   URL      : http://0.0.0.0:${PORT}/?token=${DASHBOARD_TOKEN}`);
});
