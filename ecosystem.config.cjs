module.exports = {
  apps: [
    {
      name: "certistock-api",
      cwd: "/opt/apps/certistock/current",
      script: "server/dist/index.js",
      interpreter: "/usr/bin/node",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        LOCAL_API_HOST: "127.0.0.1",
        LOCAL_API_PORT: "8787",
      },
    },
  ],
};
