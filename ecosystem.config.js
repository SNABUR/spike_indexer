module.exports = {
  apps: [
    {
      name: 'poller-worker',
      // Ejecuta node directamente
      script: 'node',
      // Pasa la ruta al script de tsx y luego a tu propio script como argumentos
      args: './node_modules/tsx/dist/cli.mjs src/poller-worker.ts',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      error_file: 'logs/poller-err.log',
      out_file: 'logs/poller-out.log',
      time: true,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'processor-worker',
      // Mismo cambio aquí
      script: 'node',
      args: './node_modules/tsx/dist/cli.mjs src/processor-worker.ts',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
      error_file: 'logs/processor-err.log',
      out_file: 'logs/processor-out.log',
      time: true,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}