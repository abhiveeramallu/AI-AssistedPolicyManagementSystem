const { AppError } = require('./errorMiddleware');

const validateRequest = (schema) => (req, _res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body);
    }

    if (schema.params) {
      req.params = schema.params.parse(req.params);
    }

    if (schema.query) {
      req.query = schema.query.parse(req.query);
    }

    return next();
  } catch (error) {
    return next(new AppError('Validation failed', 400, error.errors || error.message));
  }
};

module.exports = { validateRequest };
