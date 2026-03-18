module.exports = {
  apps: [
    {
      name: 'prepship-api',
      script: 'node',
      args: '--experimental-strip-types apps/api/src/main.ts',
      cwd: '/Users/djmac/prepship-v2',
      env: {
        NODE_ENV: 'development',
        SESSION_TOKEN: 'dev-only-insecure-token-change-me',
        DB_PROVIDER: 'memory',
        API_PORT: '4010',
      },
    },
    {
      name: 'prepshipv3',
      script: 'apps/react/server.js',
      cwd: '/Users/djmac/prepship-v2',
      env: {
        SESSION_TOKEN: 'dev-only-insecure-token-change-me',
        PORT: '4012',
      },
    },
  ],
};
