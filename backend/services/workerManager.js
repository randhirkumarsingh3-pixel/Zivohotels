import { eventBus } from '../services/eventBus.js';

/**
 * ZivoHotels Worker Manager
 * Handles self-healing, health monitoring, and lifecycle of distributed workers.
 */
class WorkerManager {
  constructor() {
    this.workers = new Map(); // workerName -> { status, lastPulse, restartCount }
  }

  register(name, startFn) {
    console.log(`[WorkerManager] Registering worker: ${name}`);
    this.workers.set(name, { status: 'INITIALIZING', lastPulse: Date.now(), restartCount: 0 });

    const safeStart = async () => {
      try {
        await startFn();
        this.updateStatus(name, 'RUNNING');
      } catch (err) {
        this.handleFailure(name, err, startFn);
      }
    };

    safeStart();
  }

  updateStatus(name, status) {
    const worker = this.workers.get(name);
    if (worker) {
      worker.status = status;
      worker.lastPulse = Date.now();
    }
  }

  async handleFailure(name, error, restartFn) {
    const worker = this.workers.get(name);
    worker.status = 'FAILED';
    worker.restartCount++;

    console.error(`[WorkerManager] Worker ${name} FAILED:`, error.message);

    // Emit Self-Healing Event
    eventBus.emitEvent('WORKER_FAILURE_DETECTED', {
      workerName: name,
      error: error.message,
      restartCount: worker.restartCount
    }, { severity: 'WARNING', source: 'WORKER_MANAGER' });

    if (worker.restartCount < 5) {
      console.log(`[WorkerManager] Attempting restart ${worker.restartCount} for ${name}...`);
      setTimeout(() => this.register(name, restartFn), 5000);
    } else {
      console.error(`[WorkerManager] Max restarts reached for ${name}. Manual intervention required.`);
      eventBus.emitEvent('CRITICAL_INFRASTRUCTURE_FAILURE', {
        workerName: name,
        message: 'Max restarts reached. Service dead.'
      }, { severity: 'CRITICAL', source: 'WORKER_MANAGER' });
    }
  }

  getHealthReport() {
    return Array.from(this.workers.entries()).map(([name, stats]) => ({
      name,
      ...stats
    }));
  }
}

export default new WorkerManager();
