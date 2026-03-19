import express from 'express';
import { IConfig } from './types';
import { ApiRouter } from './api';

export class Server {
  private app: express.Application;
  private config: IConfig;

  constructor(config: IConfig) {
    this.config = config;
    this.app = express();
  }

  async initialize() {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Routes
    const apiRouter = new ApiRouter(this.config);
    this.app.use(`/api`, apiRouter.getRouter());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });
  }

  async start() {
    this.app.listen(this.config.port, () => {
      console.log(`🚀 Cluster running on port ${this.config.port}`);
    });
  }
}
