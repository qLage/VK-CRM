/**
 * Error Handling Middleware
 *
 * Provides centralized error handling with:
 * - Error sanitization (prevents information disclosure)
 * - Structured logging
 * - Consistent error responses
 * - Development vs Production modes
 */

import { Request, Response, NextFunction } from 'express';
import { telegramBotService } from '../services/telegramBot.service';

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  statusCode: number;
  code: string | null;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    stack?: string;
    details?: any;
  };
}

interface SanitizedError {
  statusCode: number;
  response: ErrorResponse;
}

/**
 * Sanitize error for client response
 * Prevents leaking sensitive information in production
 */
const sanitizeError = (error: any, req: Request): SanitizedError => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log full error details server-side
  console.error('Error occurred:', {
    message: error.message,
    stack: isDevelopment ? error.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    code: error.code,
    statusCode: error.statusCode
  });

  // Notify Telegram about 500 errors
  if (!error.isOperational || error.statusCode >= 500) {
    telegramBotService.notifyError(error, `API Error: ${req.method} ${req.path}`).catch(console.error);
  }

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Build client response
  const response: ErrorResponse = {
    error: {
      message: error.isOperational
        ? error.message
        : (isDevelopment ? error.message : 'An unexpected error occurred'),
      code: error.code || undefined
    }
  };

  // Include stack trace only in development
  if (isDevelopment && error.stack) {
    response.error.stack = error.stack;
  }

  return { statusCode, response };
};

/**
 * Global error handler middleware
 * Should be registered last in middleware chain
 */
const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction): void => {
  // Handle specific error types

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' }
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: { message: 'Token expired', code: 'TOKEN_EXPIRED' }
    });
    return;
  }

  // Validation errors (express-validator)
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.details || err.errors
      }
    });
    return;
  }

  // Database errors
  if (err.code === '23505') { // PostgreSQL unique violation
    res.status(409).json({
      error: { message: 'Resource already exists', code: 'DUPLICATE_ENTRY' }
    });
    return;
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    res.status(400).json({
      error: { message: 'Referenced resource not found', code: 'FOREIGN_KEY_VIOLATION' }
    });
    return;
  }

  if (err.code === '23502') { // PostgreSQL not null violation
    res.status(400).json({
      error: { message: 'Required field missing', code: 'NOT_NULL_VIOLATION' }
    });
    return;
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      error: { message: 'CORS policy violation', code: 'CORS_ERROR' }
    });
    return;
  }

  // Rate limit errors
  if (err.statusCode === 429) {
    res.status(429).json({
      error: {
        message: err.message || 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    });
    return;
  }

  // Sanitize and send error
  const { statusCode, response } = sanitizeError(err, req);
  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper
 * Catches errors in async route handlers and passes to error middleware
 */
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
      path: req.path
    }
  });
};

export {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  sanitizeError
};
