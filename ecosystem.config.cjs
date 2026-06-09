module.exports = {
  apps: [
    {
      name: "certistock-api",
      cwd: "/opt/certistock",
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
    {
      name: "certistock-ocr",
      cwd: "/opt/certistock/ocr-worker",
      script: ".venv/bin/uvicorn",
      args: "app:app --host 127.0.0.1 --port 8001",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};
