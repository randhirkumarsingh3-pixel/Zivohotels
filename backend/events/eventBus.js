import { EventEmitter } from 'events';

const emitter = new EventEmitter();

/**
 * Global Event Bus
 * Wrapped to allow future swap to Redis/Kafka/BullMQ without touching business logic.
 * 
 * @param {string} event - Event name (e.g. 'BOOKING_CREATED')
 * @param {object} payload - Event payload
 */
export const emitEvent = (event, payload) => {
  // Fire and forget (asynchronous decoupling)
  setImmediate(() => {
    emitter.emit(event, payload);
  });
};

import handleInvoiceEvents from './handlers/invoiceHandler.js';

/**
 * Register Event Handlers
 */
export const subscribeEvent = (event, handler) => {
  emitter.on(event, handler);
};

// --- INITIALIZE HANDLERS ---
subscribeEvent('CHECKOUT_COMPLETED', handleInvoiceEvents);
subscribeEvent('BOOKING_CONFIRMED', handleInvoiceEvents);

export default {
  emitEvent,
  subscribeEvent
};
