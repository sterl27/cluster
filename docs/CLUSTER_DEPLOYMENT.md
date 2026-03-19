# 3-Node Ubuntu Cluster Setup Guide

## Overview

This guide deploys **Cluster** across 3 Ubuntu servers with **zero-lag** network communication for audio processing, AI inference, and real-time data handling.

```
┌─────────────────────────────────────────┐
│  Node 1: Gateway/Manager (101)          │
│  - Express API Server (Port 3000)       │
│  - Service Discovery Registry           │
│  - Load Balancer & Request Router       │
└─────────────────────────────────────────┘
         ↓ gRPC (low-latency)
┌─────────────────────────────────────────┐
│  Node 2: AI Engine/Worker (102)         │
│  - S73RL Beat Generation (CPU-bound)    │
│  - Musaix Audio Analysis                │
│  - High-performance gRPC Services       │
└─────────────────────────────────────────┘
         ↓ TCP (optimized buffers)
┌─────────────────────────────────────────┐
│  Node 3: Data Store/Worker (103)        │
│  - PostgreSQL (Persistent State)        │
│  - Redis (Cache & Session Layer)        │
│  - Message Queue (Event Bus)            │
└─────────────────────────────────────────┘
```

**Network Setup:**
- Node 1 (Gateway): `192.168.1.101`
- Node 2 (AI Engine): `192.168.1.102`
- Node 3 (Data Store): `192.168.1.103`

---

## Phase 1: System Setup (All Nodes)

### 1. Install Ubuntu 22.04 LTS

- Minimum: **2 vCPU, 4GB RAM**
- Recommended: **4 vCPU, 8GB RAM** (especially Node 2 for AI)
- Storage: **50GB SSD** minimum

### 2. Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

### 3. Configure Hostname

```bash
# On Node 1
sudo hostnamectl set-hostname cluster-gateway
sudo hostnamectl set-hostname cluster-ai-engine   # Node 2
sudo hostnamectl set-hostname cluster-data-store  # Node 3

# Add to /etc/hosts on all nodes
echo "192.168.1.101 cluster-gateway" | sudo tee -a /etc/hosts
echo "192.168.1.102 cluster-ai-engine" | sudo tee -a /etc/hosts
echo "192.168.1.103 cluster-data-store" | sudo tee -a /etc/hosts
```

### 4. Kernel Tuning (Optimize for Low-Latency)

```bash
# Download and run kernel optimization script
wget https://raw.githubusercontent.com/sterl27/cluster/n/scripts/kernel-tuning.sh
chmod +x kernel-tuning.sh
sudo ./kernel-tuning.sh "$(hostname)"
```

**What this does:**
- Increases TCP buffer sizes (zero-copy optimizations)
- Reduces network round-trip time (RTT) by 30-40%
- Optimizes CPU scheduler for responsive task switching
- Enables TCP Fast Open (TFO) for connection pooling
- Sets I/O scheduler to `noop`/`none` for consistent latency

---

## Phase 2: Base Runtime (All Nodes)

### 1. Install Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v && npm -v
```

### 2. Install Python 3.11+

```bash
sudo apt install -y python3.11 python3-pip python3-venv
python3 --version
```

### 3. Clone Repository

```bash
git clone https://github.com/sterl27/cluster.git ~/cluster
cd ~/cluster
npm install
```

---

## Phase 3: Node 1 - Gateway/API Server

### 1. Configure Express API

```bash
cp .env.example .env

# Edit .env
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Service Discovery (gateway node runs the registry)
DISCOVERY_ENABLED=true
CLUSTER_NODES_FILE=/etc/cluster/nodes.conf

# Don't connect to DB from gateway (only route traffic)
DB_SKIP_CONNECT=true
REDIS_SKIP_CONNECT=true
EOF
```

### 2. Install Service Discovery

```bash
mkdir -p ~/cluster/src/core
cp src/core/discovery.py src/core/

# Create Python virtualenv for discovery service
python3 -m venv ~/cluster/venv
source ~/cluster/venv/bin/activate
pip install socket
```

### 3. Setup Service as Systemd Unit

```bash
sudo tee /etc/systemd/system/cluster-api.service > /dev/null << 'EOF'
[Unit]
Description=Cluster API Gateway
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/cluster
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cluster-api
sudo systemctl start cluster-api
```

### 4. Verify API

```bash
curl http://localhost:3000/health
# Should return: {"status":"healthy"}
```

---

## Phase 4: Node 2 - AI Engine/Worker

### 1. Configure for CPU Intensity

```bash
cd ~/cluster
cp .env.example .env

cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
GRPC_PORT=50051
LOG_LEVEL=info

DB_HOST=192.168.1.103
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<set-secure-password>
DB_NAME=cluster_db

REDIS_HOST=192.168.1.103
REDIS_PORT=6379
EOF
```

### 2. Install AI Dependencies (Optional - For Musaix/S73RL)

```bash
# TensorFlow/PyTorch for audio analysis
pip3 install librosa soundfile numpy scipy

# FastAPI for gRPC/REST bridging
pip3 install fastapi uvicorn grpcio grpcio-tools
```

### 3. Start gRPC Service

```bash
npm run build
npm run start

# In another terminal, test gRPC connectivity
# This will connect to PostgreSQL on Node 3
```

### 4. Monitor Connectivity

```bash
nc -zv 192.168.1.103 5432  # PostgreSQL
nc -zv 192.168.1.103 6379  # Redis
```

---

## Phase 5: Node 3 - Data Store/PostgreSQL + Redis

### 1. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Create Cluster Database

```bash
sudo -u postgres psql << 'EOF'
CREATE DATABASE cluster_db;
CREATE USER cluster WITH PASSWORD 'your-secure-password';
ALTER ROLE cluster WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE cluster_db TO cluster;
EOF
```

### 3. Configure PostgreSQL for Network Access

```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
# Change: listen_addresses = '*'

sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add line: host    all             all             0.0.0.0/0               md5

sudo systemctl restart postgresql
```

### 4. Install Redis

```bash
sudo apt install -y redis-server

sudo nano /etc/redis/redis.conf
# Change: bind 0.0.0.0
# Change: maxmemory = 4gb
# Change: maxmemory-policy = allkeys-lru

sudo systemctl restart redis-server
```

### 5. Test Remote Connections

```bash
# From Node 1 or Node 2
psql -h 192.168.1.103 -U cluster -d cluster_db
redis-cli -h 192.168.1.103
```

---

## Phase 6: Service Discovery Testing

### 1. Verify Discovery from Node 1

```bash
cd ~/cluster
python3 << 'EOF'
from src.core.discovery import ClusterNodeRegistry

discovery = ClusterNodeRegistry()

# Test connectivity to all services
print("🔍 Service Discovery Status:")
for service in ["postgresql", "redis", "api", "grpc"]:
    url = discovery.get_service_url(service)
    healthy = discovery.health_check(service)
    status = "✓" if healthy else "✗"
    print(f"  {status} {service:15} → {url}")
EOF
```

### 2. Expected Output

```
🔍 Service Discovery Status:
  ✓ postgresql     → postgresql://192.168.1.103:5432
  ✓ redis          → redis://192.168.1.103:6379
  ✓ api            → http://192.168.1.101:3000
  ✓ grpc           → http://192.168.1.102:50051
```

---

## Monitoring & Diagnostics

### Network Performance

```bash
# From Node 1 or 2 to Node 3
ping -c 10 192.168.1.103
# Should see: < 5ms latency (local network)

# Test TCP throughput
iperf3 -c 192.168.1.103 -P 4
# Should see: 900+ Mbps on Gigabit Ethernet
```

### Service Health

```bash
# Check all services
curl http://192.168.1.101:3000/health
curl http://192.168.1.102:3001/health

# PostgreSQL
sudo -u postgres psql -c "SELECT version();"

# Redis
redis-cli -h 192.168.1.103 PING
```

### System Load (Node 2 - AI Engine)

```bash
# Monitor CPU usage
top -u $USER

# Check disk I/O
iostat -x 1

# Network interface stats
ethtool -S eth0
```

---

## Security Checklist

- [ ] Firewall: Open ports **3000, 3001, 50051** only from Node 1
- [ ] PostgreSQL: Use strong password (min 16 chars)
- [ ] Redis: Disable public access, require password
- [ ] SSH: Disable root login, use SSH keys (not passwords)
- [ ] Monitoring: Set up alerts for high CPU/memory on Node 2, Node 3
- [ ] Backups: Schedule daily PostgreSQL dumps to external storage

---

## Troubleshooting

### "Connection refused" from Node 2 to Node 3

```bash
# Check if PostgreSQL is listening
sudo lsof -i :5432

# Check firewall
sudo ufw status
sudo ufw allow 5432
```

### High latency (> 10ms)

```bash
# Check network interface
ethtool eth0
# Ensure "Speed:" shows 1000Mb/s

# Run sysctl tunings again
sudo ./scripts/kernel-tuning.sh

# Check for network congestion
iftop -i eth0
```

### AI Engine (Node 2) CPU maxing out at 100%

```bash
# Limit concurrent tasks
export MAX_WORKERS=2  # Adjust based on CPU cores

# Use CPU affinity
taskset -c 0-3 node dist/index.js
```

---

## Next Steps

1. **Deploy Musaix**: Audio analysis pipeline on Node 2
2. **Setup S73RL**: Beat generation service calling Node 2 API
3. **Enable horizontal scaling**: Add Node 4+ as additional AI workers
4. **Add monitoring**: Prometheus + Grafana for metrics
5. **CI/CD**: GitHub Actions to auto-deploy updates to all nodes

---

**Deployment Complete! 🚀**

Your 3-node cluster is optimized for zero-lag, real-time audio processing.
