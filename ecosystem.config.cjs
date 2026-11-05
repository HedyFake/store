module.exports = {
  apps: [
    {
      name: 'pastimurahnya-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        API_PORT: '4000',
      },
    },
    {
      name: 'pastimurahnya-web',
      cwd: './apps/web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        API_URL: 'http://127.0.0.1:4000',
        NEXT_PUBLIC_SITE_URL: 'https://pastimurahnya.my.id',
      },
    },
  ],
};

