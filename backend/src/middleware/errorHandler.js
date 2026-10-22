export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[Error] ${req.method} ${req.url}:`, err);

  res.status(status).json({
    status: 'error',
    statusCode: status,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
