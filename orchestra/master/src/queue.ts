import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';

export const QUEUE_NAME = 'orchestra-jobs';

export const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const jobQueue = new Queue(QUEUE_NAME, { connection });

export const jobQueueEvents = new QueueEvents(QUEUE_NAME, { connection });
