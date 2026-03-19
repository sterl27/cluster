import { createClient } from 'redis';
import { IConfig } from '../types';

export class Cache {
  private client: ReturnType<typeof createClient>;
  private config: IConfig;
  private connected = false;

  constructor(config: IConfig) {
    this.config = config;
    this.client = createClient({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });
  }

  async connect() {
    try {
      await this.client.connect();
      this.connected = true;
      console.log('✓ Redis cache connected');
    } catch (error) {
      console.error('✗ Redis connection failed:', error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.connected) return;
    
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.disconnect();
      console.log('✓ Redis cache disconnected');
    }
  }
}
