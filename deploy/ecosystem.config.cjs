// PM2 process definitions for Somba&Teka.
// Run from the repo root:  pm2 start deploy/ecosystem.config.cjs
//
// The API reads api/.env; the web app bakes NEXT_PUBLIC_* at BUILD time, so
// build the web AFTER writing web/.env.local (see docs/DEPLOYMENT.md).
module.exports = {
  apps: [
    {
      name: 'somba-api',
      cwd: './api',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'somba-web',
      cwd: './web',
      // Launch Next.js directly so pm2 tracks the real process.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
