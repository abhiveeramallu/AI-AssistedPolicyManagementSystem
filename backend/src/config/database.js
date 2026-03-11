const logger = require('./logger');

const connectDatabase = async () => {
  logger.warn(
    'Running in local datastore mode backed by backend/storage/local-db.json.'
  );
};

const closeDatabase = async () => {};

module.exports = { connectDatabase, closeDatabase };
