const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const env = require('./config/env');
const logger = require('./config/logger');
const { standardRateLimiter } = require('./middleware/rateLimiterMiddleware');
const { notFoundHandler, errorHandler, AppError } = require('./middleware/errorMiddleware');

const app = express();
const corsOriginConfig = env.corsOrigin.includes('*') ? true : env.corsOrigin;

app.use(helmet());
app.use(
  cors({
    origin: corsOriginConfig,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Access-Token', 'X-Access-Password']
  })
);
app.use(standardRateLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/', routes);

app.use((error, _req, _res, next) => {
  if (error?.name === 'MulterError') {
    return next(new AppError(`Upload error: ${error.message}`, 400));
  }

  return next(error);
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
