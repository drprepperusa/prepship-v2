module.exports = {
  apps: [
    {
      name: 'prepship-api',
      script: '/Users/djmac/prepship-v2/apps/api/src/main.ts',
      cwd: '/Users/djmac/prepship-v2',
      interpreter: 'node',
      interpreterArgs: '--experimental-strip-types',
      env: {
        API_PORT: 4010,
        SQLITE_DB_PATH: '/Users/djmac/.openclaw/workspace/prepship/prepship.db',
        SESSION_TOKEN: '2431ac56eba4fdda-efde772175b96d2fe648a5df5a2126b0fff9ac3a6ef482b',
        DB_PROVIDER: 'sqlite',
      },
    },
    {
      name: 'prepship-v2-web',
      script: '/Users/djmac/prepship-v2/apps/web/src/main.ts',
      cwd: '/Users/djmac/prepship-v2',
      interpreter: 'node',
      interpreterArgs: '--experimental-strip-types',
      env: {
        PORT: 4011,
      },
    },
    {
      name: 'prepship-v3-react',
      script: 'npm',
      args: 'run dev:react',
      cwd: '/Users/djmac/prepship-v2',
      env: {
        PORT: 4014,
      },
    },
  ],
};
