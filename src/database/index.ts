import { Pool } from 'pg';
import { IConfig } from '../types';

export class Database {
  private pool: Pool;
  private config: IConfig;

  constructor(config: IConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.name,
      ssl: config.database.ssl,
    });
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      console.log('✓ Database connected');
      client.release();
    } catch (error) {
      console.error('✗ Database connection failed:', error);
      throw error;
    }
  }

  async query(sql: string, params?: unknown[]) {
    return this.pool.query(sql, params);
  }

  async disconnect() {
    await this.pool.end();
    console.log('✓ Database disconnected');
  }
}
