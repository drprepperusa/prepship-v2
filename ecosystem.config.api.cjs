module.exports = {
  apps: [
    {
      name: 'prepship-v2-api',

      script: 'npm',
      args: 'run dev:api',
      cwd: '/Users/djmac/projects/prepship-v2',
      env: {
        API_PORT: '4010',
        SQLITE_DB_PATH: '/Users/djmac/projects/prepship-v2/prepship.db',
        NODE_ENV: 'development',
        DB_PROVIDER: 'sqlite'
      },
      watch: false,
      autorestart: true
    }
  ]
};
