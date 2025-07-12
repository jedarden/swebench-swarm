import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Logger } from '../utils/Logger';

const logger = new Logger('RateLimit');

// Configure rate limiter
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req: Request) => req.ip,
  points: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'), // Number of requests
  duration: parseInt(process.env.RATE_LIMIT_WINDOW || '60'), // Per 60 seconds
});

export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes: any) {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      remainingPoints: rejRes.remainingPoints,
      msBeforeNext: rejRes.msBeforeNext
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 1,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string
    });
  }
}