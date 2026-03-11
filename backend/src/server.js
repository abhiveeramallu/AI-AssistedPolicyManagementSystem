const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, closeDatabase } = require('./config/database');

let httpServer;

const shutdown = async (signal) => {
  logger.info(`Received ${signal}; shutting down server`);

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  await closeDatabase();
  process.exit(0);
};

const startServer = async () => {
  try {
    await connectDatabase();

    httpServer = app.listen(env.port, () => {
      logger.info(`Secure access policy backend is running on port ${env.port}`);
    });
  } catch (error) {
    logger.error('Server startup failed', { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
