/**
 * TypeScript wrapper for Python Service Discovery
 * Bridges Node.js application with cluster discovery service
 */

import { spawn } from 'child_process';
import path from 'path';

interface ServiceLocation {
  name: string;
  url: string;
  host: string;
  port: number;
  healthy: boolean;
}

export class ClusterDiscovery {
  private pythonPath: string;
  private discoveryScript: string;
  private cache: Map<string, ServiceLocation> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.discoveryScript = path.join(
      __dirname,
      '../core/discovery.py'
    );
  }

  /**
   * Get service URL with caching
   */
  async getServiceUrl(serviceName: string): Promise<string> {
    const cached = this.cache.get(serviceName);
    if (cached && this.isCacheValid(serviceName)) {
      return cached.url;
    }

    try {
      const url = await this.queryDiscovery('get_service_url', serviceName);
      this.cacheResult(serviceName, {
        name: serviceName,
        url,
        host: url.split('://')[1].split(':')[0],
        port: parseInt(url.split(':').pop() || '0'),
        healthy: true
      });
      return url;
    } catch (error) {
      console.error(`Failed to discover service ${serviceName}:`, error);
      throw new Error(`Service discovery failed for ${serviceName}`);
    }
  }

  /**
   * Get connection string for database
   */
  async getDatabaseUrl(): Promise<string> {
    return this.getServiceUrl('postgresql');
  }

  /**
   * Get Redis connection string
   */
  async getRedisUrl(): Promise<string> {
    return this.getServiceUrl('redis');
  }

  /**
   * Get gRPC service endpoint
   */
  async getGrpcEndpoint(): Promise<{ host: string; port: number }> {
    const url = await this.getServiceUrl('grpc');
    const [host, port] = url.replace('http://', '').split(':');
    return { host, port: parseInt(port) };
  }

  /**
   * Check if service is healthy
   */
  async isServiceHealthy(serviceName: string): Promise<boolean> {
    try {
      const result = await this.queryDiscovery('health_check', serviceName);
      return result === 'true';
    } catch {
      return false;
    }
  }

  /**
   * List all registered services
   */
  async listServices(): Promise<Record<string, string>> {
    try {
      const result = await this.queryDiscovery('list_services');
      return JSON.parse(result);
    } catch (error) {
      console.error('Failed to list services:', error);
      return {};
    }
  }

  /**
   * Query Python discovery service
   */
  private queryDiscovery(
    method: string,
    ...args: string[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const pythonCode = `
from src.core.discovery import get_discovery
import json

discovery = get_discovery()

try:
  if '${method}' == 'get_service_url':
    result = discovery.get_service_url('${args[0]}')
  elif '${method}' == 'health_check':
    result = discovery.health_check('${args[0]}')
  elif '${method}' == 'list_services':
    result = json.dumps(discovery.list_services())
  else:
    result = 'unknown method'
  
  print(result)
except Exception as e:
  print(f'ERROR: {str(e)}', file=__import__('sys').stderr)
  exit(1)
`;

      const python = spawn(this.pythonPath, ['-c', pythonCode]);
      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString().trim();
      });

      python.stderr.on('data', (data) => {
        error += data.toString().trim();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(error || 'Python script failed'));
        } else {
          resolve(output);
        }
      });
    });
  }

  /**
   * Cache result with TTL
   */
  private cacheResult(serviceName: string, location: ServiceLocation): void {
    this.cache.set(serviceName, location);
    this.cacheExpiry.set(serviceName, Date.now() + this.CACHE_TTL);
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(serviceName: string): boolean {
    const expiry = this.cacheExpiry.get(serviceName);
    if (!expiry) return false;
    return Date.now() < expiry;
  }

  /**
   * Clear cache for service (useful after failover)
   */
  clearCache(serviceName?: string): void {
    if (serviceName) {
      this.cache.delete(serviceName);
      this.cacheExpiry.delete(serviceName);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }
}

// Export singleton instance
export const discovery = new ClusterDiscovery();

// Example usage
export async function exampleUsage() {
  try {
    // Get database URL dynamically
    const dbUrl = await discovery.getDatabaseUrl();
    console.log(`📦 Database: ${dbUrl}`);

    // Get Redis URL
    const redisUrl = await discovery.getRedisUrl();
    console.log(`📦 Cache:    ${redisUrl}`);

    // Check service health
    const healthy = await discovery.isServiceHealthy('postgresql');
    console.log(`📡 DB healthy: ${healthy}`);

    // List all services
    const services = await discovery.listServices();
    console.log('📋 All services:', services);
  } catch (error) {
    console.error('Discovery failed:', error);
  }
}
