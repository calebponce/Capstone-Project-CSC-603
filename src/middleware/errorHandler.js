const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  // If it's a Zod validation error
  if (err.name === "ZodError") {
    logger.warn({ err }, "Validation Error");
    return res.status(400).json({
      error: "Validation failed",
      details: err.errors,
    });
  }

  logger.error({ err, req: { method: req.method, url: req.url } }, "Unhandled application error");

  res.status(err.status || 500).json({
    error: err.message || "An unexpected error occurred. Please try again later.",
  });
}

module.exports = errorHandler;
