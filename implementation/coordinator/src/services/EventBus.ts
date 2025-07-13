import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';

export interface SwarmEvent {
  type: string;
  timestamp: Date;
  source: string;
  data: any;
  correlation_id?: string;
}

/**
 * Central event bus for swarm coordination
 */
export class EventBus extends EventEmitter {
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('EventBus');
    this.setMaxListeners(100); // Allow many listeners
  }

  /**
   * Initialize the event bus
   */
  async initialize(): Promise<void> {
    this.logger.info('Event bus initialized');
  }

  /**
   * Emit a swarm event
   */
  emitSwarmEvent(type: string, source: string, data: any, correlationId?: string): void {
    const event: SwarmEvent = {
      type,
      timestamp: new Date(),
      source,
      data,
      correlation_id: correlationId
    };

    this.logger.debug('Emitting swarm event', { type, source });
    this.emit(type, event);
    this.emit('*', event); // Wildcard listener
  }

  /**
   * Subscribe to events
   */
  onSwarmEvent(type: string, handler: (event: SwarmEvent) => void): void {
    this.on(type, handler);
  }

  /**
   * Subscribe to all events
   */
  onAllEvents(handler: (event: SwarmEvent) => void): void {
    this.on('*', handler);
  }

  /**
   * Cleanup
   */
  async shutdown(): Promise<void> {
    this.removeAllListeners();
    this.logger.info('Event bus shutdown');
  }
}