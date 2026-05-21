// ============================================================
// DEUS — PM2 Ecosystem + Cron Jobs
// ecosystem.config.cjs
//
// Kullanım: pm2 delete all && pm2 start ecosystem.config.cjs && pm2 save
// ============================================================

module.exports = {
  apps: [
    // ── ANA BOT ────────────────────────────────────────────────
    {
      name: "deus",
      script: "node",
      args: "--import tsx/esm src/index.ts",
      cwd: "/Users/exmachina/deus",
      interpreter: "none",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      error_file: "/tmp/deus-err.log",
      out_file: "/tmp/deus-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── GECE MUTABAKAT (00:05) ──────────────────────────────────
    {
      name: "deus-reconcile",
      script: "node",
      args: "--import tsx/esm src/cron/reconcile.ts",
      cwd: "/Users/exmachina/deus",
      interpreter: "none",
      autorestart: false,
      cron_restart: "5 0 * * *",   // Her gece 00:05
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "/tmp/deus-reconcile-err.log",
      out_file: "/tmp/deus-reconcile-out.log",
    },

    // ── SABAH RAPORU (08:00) ────────────────────────────────────
    {
      name: "deus-morning-report",
      script: "node",
      args: "--import tsx/esm src/cron/morning-report.ts",
      cwd: "/Users/exmachina/deus",
      interpreter: "none",
      autorestart: false,
      cron_restart: "0 8 * * *",   // Her sabah 08:00
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "/tmp/deus-morning-err.log",
      out_file: "/tmp/deus-morning-out.log",
    },

    // ── GECE GÜVENLİK DENETİMİ (23:00) ────────────────────────
    {
      name: "deus-security-audit",
      script: "node",
      args: "--import tsx/esm src/cron/security-audit.ts",
      cwd: "/Users/exmachina/deus",
      interpreter: "none",
      autorestart: false,
      cron_restart: "0 23 * * *",  // Her gece 23:00
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "/tmp/deus-audit-err.log",
      out_file: "/tmp/deus-audit-out.log",
    },

    // ── HAFTALIK ÖĞRENME (Pazar 03:00) ─────────────────────────
    {
      name: "deus-learning",
      script: "node",
      args: "--import tsx/esm src/cron/weekly-learning.ts",
      cwd: "/Users/exmachina/deus",
      interpreter: "none",
      autorestart: false,
      cron_restart: "0 3 * * 0",   // Her Pazar 03:00
      watch: false,
      env: { NODE_ENV: "production" },
      error_file: "/tmp/deus-learning-err.log",
      out_file: "/tmp/deus-learning-out.log",
    },

    // ── DASHBOARD SERVER (Port 4200) ────────────────────────────
    {
      name: "deus-dashboard",
      script: "dashboard-server.js",
      cwd: "/Users/exmachina/deus",
      interpreter: "node",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 5,
      env: {
        NODE_ENV: "production",
        DASHBOARD_PORT: "4200",
      },
      max_memory_restart: "100M",
      error_file: "/tmp/deus-dashboard-err.log",
      out_file: "/tmp/deus-dashboard-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── LOCALTUNNEL TUNNEL (deus-control.loca.lt) ─────────────────────
    {
      name: "deus-tunnel",
      script: "localtunnel-wrapper.sh",
      cwd: "/Users/exmachina/deus",
      interpreter: "bash",
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
      error_file: "/tmp/deus-tunnel-err.log",
      out_file: "/tmp/deus-tunnel-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
