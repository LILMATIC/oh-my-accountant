import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { loadDb } from './lib/store.js';

type AppOptions = {
  serveClient?: boolean;
};

export function createApp({ serveClient = false }: AppOptions = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', apiRouter);

  if (serveClient) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const clientDist = resolve(__dirname, '../../client');

    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
        return res.sendFile(join(clientDist, 'index.html'));
      });
    }
  }

  app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    void next;
    console.error(error);
    res.status(500).json({ error: error.message || 'Something went wrong.' });
  });

  loadDb();
  return app;
}
