const rateLimit = require('express-rate-limit');

// A page loads several API resources. Use a short window so normal navigation
// does not exhaust a shared fifteen-minute quota for the whole application.
function createApiLimiter({ windowMs = 60 * 1000, max = 300 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
    // Login has its own limiter below, so a busy dashboard cannot lock users out.
    skip: req => req.method === 'POST' && /^\/auth\/login\/?$/i.test(req.path),
  });
}

// Strict limiter for auth endpoints
function createAuthLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again in 15 minutes.' },
    skipSuccessfulRequests: true,
  });
}

const apiLimiter = createApiLimiter();
const authLimiter = createAuthLimiter();

// File upload limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Upload limit reached, please try again later.' },
});

module.exports = { apiLimiter, authLimiter, uploadLimiter, createApiLimiter, createAuthLimiter };
