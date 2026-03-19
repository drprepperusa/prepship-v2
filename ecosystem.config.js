export default {
  apps: [
    {
      name: "prepship-v2-api",
      cwd: "/Users/djmac/prepship-v2",
      script: "npm",
      args: "run dev:api",
      env: {
        NODE_ENV: "development",
        API_PORT: "4010",
        DB_PROVIDER: "sqlite",
        SQLITE_DB_PATH: "/Users/djmac/.openclaw/workspace/prepship/prepship.db",
        SESSION_TOKEN: "dev-only-insecure-token-change-me"
      },
      watch: false,
      restart_delay: 5000
    },
    {
      name: "prepship-v2-web",
      cwd: "/Users/djmac/prepship-v2",
      script: "npm",
      args: "run dev:web",
      env: {
        NODE_ENV: "development"
      },
      watch: false,
      restart_delay: 5000
    },
    {
      name: "prepship-v3-react",
      cwd: "/Users/djmac/prepship-v2/apps/react",
      script: "npm",
      args: "run dev",
      env: {
        NODE_ENV: "development",
        VITE_API_BASE: "http://127.0.0.1:4010"
      },
      watch: false,
      restart_delay: 5000
    }
  ]
};
