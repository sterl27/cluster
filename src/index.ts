import { Server } from './server';
import { config } from './config';

const start = async () => {
  try {
    const server = new Server(config);
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
