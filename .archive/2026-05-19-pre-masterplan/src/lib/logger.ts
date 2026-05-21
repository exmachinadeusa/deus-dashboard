/**
 * Pino Logger - DEUS Operasyon Sistemi
 * Geliştirme: pino-pretty, Production: JSON
 */
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: { service: 'deus' },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
    },
  }),
});

export default logger;
