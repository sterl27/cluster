# Service Discovery Architecture

## Overview

**Service Discovery** enables dynamic service location without hardcoding IP addresses. This is critical for:
- **Alic3X PRO** finding PostgreSQL/Redis on Node 3
- **Musaix** connecting to the orchestration layer
- **Failover**: Services can move to different nodes without code changes

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│           Application Layer (Node.js/TypeScript)        │
│  - Express API, gRPC Services, AI Engines               │
└────────────────┬────────────────────────────────────────┘
                 │ uses
┌────────────────▼────────────────────────────────────────┐
│        Discovery Client (ClusterDiscovery.ts)           │
│  - Caches service URLs (30s TTL)                        │
│  - Health checks (TCP connection test)                  │
│  - Python subprocess bridge                             │
└────────────────┬────────────────────────────────────────┘
                 │ spawns
┌────────────────▼────────────────────────────────────────┐
│   Discovery Registry (discovery.py)                     │
│  - ClusterNodeRegistry (static node map)                │
│  - Service endpoint mapping                             │
│  - Validation & error handling                          │
└─────────────────────────────────────────────────────────┘
```

---

## Static Node Map (Current)

```python
nodes = {
    "gateway": "192.168.1.101",      # Node 1
    "ai_engine": "192.168.1.102",    # Node 2
    "data_store": "192.168.1.103"    # Node 3
}

services = {
    "postgresql": ("192.168.1.103", 5432),
    "redis": ("192.168.1.103", 6379),
    "api": ("192.168.1.101", 3000),
    "grpc": ("192.168.1.102", 50051),
    "metrics": ("192.168.1.101", 9090),
}
```

---

## Usage Patterns

### 1. Get Database Connection String

**TypeScript:**
```typescript
import { discovery } from './core/discovery';

const dbUrl = await discovery.getDatabaseUrl();
// Returns: "postgresql://192.168.1.103:5432"

const redisUrl = await discovery.getRedisUrl();
// Returns: "redis://192.168.1.103:6379"
```

**Python (Direct):**
```python
from src.core.discovery import ClusterNodeRegistry

registry = ClusterNodeRegistry()
db_url = registry.get_service_url("postgresql")
# Returns: "postgresql://192.168.1.103:5432"
```

### 2. Health Checking

```typescript
const isAlive = await discovery.isServiceHealthy("postgresql");

if (isAlive) {
    // Safe to connect
} else {
    // Service down, try failover
}
```

### 3. List All Services

```typescript
const services = await discovery.listServices();
// Returns:
// {
//   postgresql: "postgresql://192.168.1.103:5432",
//   redis: "redis://192.168.1.103:6379",
//   api: "http://192.168.1.101:3000",
//   grpc: "http://192.168.1.102:50051"
// }
```

---

## Caching Strategy

The TypeScript client implements **30-second TTL caching** to avoid excessive Python subprocess spawning:

```
Request comes in
    ↓
Cache hit? → Return cached URL (fast path)
    ↓
Cache miss or expired
    ↓
Spawn Python interpreter (slower, ~50ms)
    ↓
Query discovery service
    ↓
Cache result for 30 seconds
    ↓
Return to caller
```

**Cache invalidation:**
```typescript
// Clear cache after failover
discovery.clearCache("postgresql");

// Clear all caches
discovery.clearCache();
```

---

## Performance Characteristics

| Operation | Duration | Notes |
|-----------|----------|-------|
| Cached lookup | < 1ms | Hash map lookup |
| Health check | 2-10ms | TCP connection attempt |
| Discovery query (cold) | 50-100ms | Python subprocess spawn + query |
| Discovery query (cached) | < 1ms | In-memory cache |

**Per-second capacity:**
- Unlimited cached lookups
- ~100 health checks/sec per node
- ~20 cold discovery queries/sec (limited by Python startup)

---

## Extension: Dynamic Discovery

For future scaling (Node 4+), replace static map with:

### Option 1: Consul-based Discovery
```typescript
// Future: Use HashiCorp Consul
import Consul from 'consul';

const consul = new Consul({
  host: '192.168.1.101',
  port: 8500
});

const service = await consul.health.service({
  service: 'postgresql',
  passing: true
});
```

### Option 2: Kubernetes Service Discovery
```yaml
# When running on K8s
kind: Service
metadata:
  name: cluster-db
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
```

```typescript
const dbUrl = `postgresql://cluster-db.default.svc.cluster.local:5432`;
```

---

## Configuration

### Environment Variables

Add to `.env`:
```bash
# Enable/disable discovery
DISCOVERY_ENABLED=true

# For future use: consul or kubernetes
DISCOVERY_BACKEND=static  # or "consul", "kubernetes"

# Custom node map (JSON)
CLUSTER_NODES_OVERRIDE={"gateway":"192.168.1.101","data_store":"192.168.1.103"}
```

---

## Failover & Recovery

### Node 3 (Data Store) Goes Down

**Current behavior:**
1. Application tries to connect to PostgreSQL at 192.168.1.103:5432
2. Connection attempt fails
3. Application logs error and retries (configurable backoff)

**Future: Auto-failover**
```typescript
// Automatic standby-node promotion
async function connectWithFailover() {
  try {
    const url = await discovery.getDatabaseUrl();
    return connectToDatabase(url);
  } catch {
    // Clear cache to force fresh discovery
    discovery.clearCache();
    
    // Retry with updated discovery
    const url = await discovery.getDatabaseUrl();
    return connectToDatabase(url);
  }
}
```

---

## Security

### Prevent MITM Attacks

1. **Restrict discovery to private network:**
   ```bash
   sudo ufw default deny incoming
   sudo ufw allow from 192.168.1.0/24 to any port 5432
   ```

2. **Use PostgreSQL/Redis passwords:**
   ```bash
   # In .env
   DB_PASSWORD=strong-password-here
   REDIS_PASSWORD=strong-password-here
   ```

3. **Encrypt inter-node traffic (future):**
   ```bash
   # TLS for PostgreSQL
   DB_HOST=192.168.1.103
   DB_SSL_MODE=require
   DB_CA_CERT=/path/to/ca.crt
   ```

---

## Monitoring

### Discovery Health Dashboard

```python
# Endpoint to check discovery status
GET /api/v1/discovery/health

Response:
{
  "statusChex": true,
  "services": {
    "postgresql": {
      "healthy": true,
      "url": "postgresql://192.168.1.103:5432",
      "latency_ms": 2
    },
    "redis": {
      "healthy": true,
      "url": "redis://192.168.1.103:6379",
      "latency_ms": 1
    }
  }
}
```

### Logging

```typescript
// Enable debug logging
process.env.DEBUG = 'cluster:discovery';

// Logs:
// cluster:discovery cache hit: postgresql
// cluster:discovery health check: postgresql → healthy (2ms)
// cluster:discovery query: redis → redis://192.168.1.103:6379
```

---

## Testing

### Unit Tests

```bash
npm test -- src/core/discovery.test.ts
```

```typescript
describe('ClusterDiscovery', () => {
  it('should return cached result on second call', async () => {
    const discovery = new ClusterDiscovery();
    
    // First call: cache miss
    const url1 = await discovery.getServiceUrl('postgresql');
    
    // Second call: cache hit (should be instant)
    const start = performance.now();
    const url2 = await discovery.getServiceUrl('postgresql');
    const duration = performance.now() - start;
    
    expect(url1).toEqual(url2);
    expect(duration).toBeLessThan(5); // < 5ms
  });

  it('should handle service not found', async () => {
    const discovery = new ClusterDiscovery();
    
    await expect(discovery.getServiceUrl('nonexistent'))
      .rejects.toThrow('Service not found');
  });
});
```

### Integration Tests

```bash
# Requires all 3 nodes running
npm run test:integration
```

```typescript
describe('3-Node Cluster', () => {
  it('should connect to all services', async () => {
    const dbUrl = await discovery.getDatabaseUrl();
    const db = new Pool({ connectionString: dbUrl });
    const result = await db.query('SELECT NOW()');
    expect(result.rows).toHaveLength(1);
  });
});
```

---

## Troubleshooting

### "Service not found" Error

```
Error: Service 'postgresql' not found
```

**Fix:**
1. Check service name is correct (lowercase)
2. Verify node IP is correct: `ping 192.168.1.103`
3. Ensure firewall allows traffic: `sudo ufw allow 5432`

### Discovery Returns Wrong IP

```typescript
// Override node map for testing
const discovery = new ClusterDiscovery({
  gateway: "192.168.1.201",
  data_store: "192.168.1.203"
});
```

### Performance: Health Checks Too Slow

```typescript
// Increase cache TTL from 30s to 5 minutes
discovery.cacheTTL = 300000;

// Or disable health checks
discovery.healthCheckEnabled = false;
```

---

## Next Steps

1. **Deploy**: Run `scripts/setup-node.sh` on all 3 Ubuntu servers
2. **Test**: Verify discovery from each node
3. **Monitor**: Set up alerts for service health
4. **Scale**: Plan Node 4+ and update discovery registry
5. **High Availability**: Add PostgreSQL replication + standby
