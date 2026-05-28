import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware для защиты от brute force атак
 */

// Общий rate limiter для всех API endpoints
const generalLimiter = rateLimit({
  // SECURITY: Explicitly check for production, default to strict limits
  windowMs: 15 * 60 * 1000, // 15 минут
  max: process.env.NODE_ENV === 'production' ? 5000 : 1000, // 5000 в проде, 1000 локально
  message: {
    error: {
      message: 'Слишком много запросов с этого IP. Попробуйте позже.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for successful requests from authenticated users
  skip: (req: Request) => {
    // Если пользователь авторизован и запрос успешен, не считаем
    return !!(req.user && req.statusCode && req.statusCode < 400);
  },
});

// Строгий rate limiter для auth endpoints (логин, регистрация)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: process.env.NODE_ENV === 'production' ? 50 : 500, // 50 в проде, 500 локально
  message: {
    error: {
      message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Логируем заблокированные попытки
  handler: (req: Request, res: Response) => {
    console.warn('Rate limit exceeded for auth:', {
      ip: req.ip,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: {
        message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
      }
    });
  },
});

// Rate limiter для создания ресурсов (предотвращает спам)
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10, // 10 создания в минуту
  message: {
    error: {
      message: 'Слишком много операций создания. Подождите минуту.',
      code: 'CREATE_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для экспорта данных (ресурсоёмкие операции)
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10, // 10 экспортов в час
  message: {
    error: {
      message: 'Слишком много операций экспорта. Попробуйте позже.',
      code: 'EXPORT_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для сброса пароля
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // 3 попытки сброса пароля в час
  message: {
    error: {
      message: 'Слишком много попыток сброса пароля. Попробуйте через час.',
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для ресурсоёмких вычислений (recalculate, reports)
const computeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 5, // 5 операций в 5 минут
  message: {
    error: {
      message: 'Слишком много ресурсоёмких операций. Попробуйте через несколько минут.',
      code: 'COMPUTE_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export {
  generalLimiter,
  authLimiter,
  createLimiter,
  exportLimiter,
  passwordResetLimiter,
  computeLimiter,
};
