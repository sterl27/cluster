import express, { Router } from 'express';
import { IConfig } from '../types';

export class ApiRouter {
  private router: Router;
  private config: IConfig;

  constructor(config: IConfig) {
    this.config = config;
    this.router = express.Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Base API endpoint
    this.router.get('/status', (req, res) => {
      res.json({
        status: 'operational',
        version: this.config.api.version,
        timestamp: new Date().toISOString(),
      });
    });

    // Placeholder for services
    this.router.use('/services', this.servicesRouter());
  }

  private servicesRouter(): Router {
    const router = express.Router();
    
    router.get('/', (req, res) => {
      res.json({ services: [] });
    });

    return router;
  }

  getRouter(): Router {
    return this.router;
  }
}
