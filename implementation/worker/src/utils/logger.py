"""
Logging utilities for SWE-Bench Worker
"""
import logging
import structlog
import sys
from typing import Optional


def get_logger(name: str, level: Optional[str] = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance"""
    
    # Configure structlog if not already configured
    if not hasattr(get_logger, '_configured'):
        configure_logging(level)
        get_logger._configured = True
    
    return structlog.get_logger(name)


def configure_logging(level: Optional[str] = None):
    """Configure structured logging"""
    
    log_level = getattr(logging, (level or "INFO").upper(), logging.INFO)
    
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )