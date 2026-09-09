import { parentPort } from 'node:worker_threads';
import { sweep } from './sweep.js';
import type { SweepTask } from './parallel-sweep.js';

if (!parentPort) throw new Error('sweep-worker must run inside a worker_threads Worker');

parentPort.on('message', (task: SweepTask) => {
  const result = sweep(task.level, task.strategy, task.runs, task.days, task.baseSeed);
  parentPort!.postMessage(result);
});
