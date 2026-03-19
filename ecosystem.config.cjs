module.exports = {
  apps: [
    {
      name: 'prepship-api',
      script: '/Users/djmac/prepship-v2/apps/api/src/main.ts',
      cwd: '/Users/djmac/prepship-v2',
      interpreter: 'node',
      interpreterArgs: '--experimental-strip-types',
      env: {
        API_PORT: 3001,
        SQLITE_DB_PATH: '/Users/djmac/.openclaw/workspace/prepship/prepship.db',
        SESSION_TOKEN: 'dev-only-insecure-token-change-me',
        DB_PROVIDER: 'sqlite',
      },
    },
    {
      name: 'prepshipv3',
      script: '/Users/djmac/prepship-v2/apps/react/server.cjs',
      cwd: '/Users/djmac/prepship-v2/apps/react',
      env: {
        PORT: 4014,
        API_BASE: 'http://localhost:3001',
        SESSION_TOKEN: 'dev-only-insecure-token-change-me',
      },
    },
  ],
};
