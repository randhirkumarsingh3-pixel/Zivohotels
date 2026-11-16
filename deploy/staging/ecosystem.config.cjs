// PM2 process file for the ZivoHotels STAGING API.
// Start/reload:  pm2 startOrReload deploy/staging/ecosystem.config.cjs && pm2 save
// Settings come from backend/.env (loaded by backend/config/env.js).
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'zivohotels-staging-api',
      cwd: path.join(__dirname, '../../backend'),
      script: 'server.js',
      // Exactly ONE instance: the server runs scheduled jobs in-process (booking expiry,
      // payouts, emails...). Cluster mode or more instances would run them twice.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '800M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
