import winston from 'winston';

/**
 * Logger utility class for consistent logging across the application
 */
export class Logger {
  private logger: winston.Logger;

  constructor(private component: string) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        component: this.component,
        service: 'swebench-swarm-coordinator'
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
              let log = `${timestamp} [${component}] ${level}: ${message}`;
              if (Object.keys(meta).length > 0) {
                log += ` ${JSON.stringify(meta)}`;
              }
              return log;
            })
          )
        })
      ]
    });

    // Add file transport if specified
    if (process.env.LOG_FILE) {
      this.logger.add(new winston.transports.File({
        filename: process.env.LOG_FILE,
        format: winston.format.json()
      }));
    }
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public error(message: string, error?: any, meta?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else {
      this.logger.error(message, { error, ...meta });
    }
  }
}