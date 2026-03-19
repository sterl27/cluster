export interface IConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    ssl: boolean;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  api: {
    version: string;
    prefix: string;
    timeout: number;
  };
  grpc: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiration: string;
  };
}

export interface IService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
