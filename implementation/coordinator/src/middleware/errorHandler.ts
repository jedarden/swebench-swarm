import { Request, Response, NextFunction } from 'express';
import { SwarmException } from '../types';
import { Logger } from '../utils/Logger';

const logger = new Logger('ErrorHandler');

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Request error', error, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle SwarmException
  if (error instanceof SwarmException) {
    res.status(400).json({
      success: false,
      error: error.message,
      code: error.code,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.message,
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string
    });
    return;
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] as string
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date(),
    requestId: req.headers['x-request-id'] as string
  });
}