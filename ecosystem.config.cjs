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
        SESSION_TOKEN: '2431ac56eba4fdda-efde772175b96d2fe648a5df5a2126b0fff9ac3a6ef482b',
        DB_PROVIDER: 'sqlite',
      },
    },
  ],
};
