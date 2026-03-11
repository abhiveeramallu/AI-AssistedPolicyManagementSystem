const path = require('path');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    }),
    new transports.File({
      filename: path.resolve(__dirname, '..', '..', 'logs', 'app.log')
    }),
    new transports.File({
      filename: path.resolve(__dirname, '..', '..', 'logs', 'error.log'),
      level: 'error'
    })
  ]
});

module.exports = logger;
