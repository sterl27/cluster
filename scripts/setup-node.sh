#!/bin/bash
# Cluster 3-Node Setup Script
# Automates installation across Ubuntu servers

set -e

CLUSTER_HOME="${CLUSTER_HOME:-.}"
NODE_ROLE=${1:-""}
NODE_IP=${2:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Validate arguments
if [ -z "$NODE_ROLE" ]; then
    print_error "Usage: $0 <gateway|ai-engine|data-store> [node-ip]"
    echo ""
    echo "Examples:"
    echo "  $0 gateway 192.168.1.101"
    echo "  $0 ai-engine 192.168.1.102"
    echo "  $0 data-store 192.168.1.103"
    exit 1
fi

# Validate role
case "$NODE_ROLE" in
    gateway|ai-engine|data-store) ;;
    *)
        print_error "Invalid role: $NODE_ROLE"
        print_info "Valid roles: gateway, ai-engine, data-store"
        exit 1
        ;;
esac

print_header "Cluster Setup: $NODE_ROLE"

# ============================================================================
# PHASE 1: SYSTEM UPDATES
# ============================================================================
print_header "PHASE 1: System Updates"

print_info "Updating package lists..."
sudo apt update -qq

print_info "Upgrading packages..."
sudo apt upgrade -y -qq

print_success "System updated"

# ============================================================================
# PHASE 2: RUNTIME INSTALLATION
# ============================================================================
print_header "PHASE 2: Runtime Installation"

# Node.js
if ! command -v node &> /dev/null; then
    print_info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
    sudo apt install -y nodejs > /dev/null
    print_success "Node.js $(node -v) installed"
else
    print_success "Node.js already installed: $(node -v)"
fi

# Python 3.11
if ! command -v python3 &> /dev/null; then
    print_info "Installing Python 3.11..."
    sudo apt install -y python3.11 python3-pip > /dev/null
    print_success "Python $(python3 --version) installed"
else
    print_success "Python already installed: $(python3 --version)"
fi

# Git
if ! command -v git &> /dev/null; then
    print_info "Installing Git..."
    sudo apt install -y git > /dev/null
    print_success "Git installed"
else
    print_success "Git already installed: $(git --version)"
fi

# ============================================================================
# PHASE 3: CLUSTER REPOSITORY
# ============================================================================
print_header "PHASE 3: Cluster Repository"

if [ ! -d "$CLUSTER_HOME/src" ]; then
    print_info "Cloning Cluster repository..."
    git clone https://github.com/sterl27/cluster.git "$CLUSTER_HOME" > /dev/null 2>&1
    print_success "Repository cloned"
else
    print_info "Repository already exists, pulling latest..."
    cd "$CLUSTER_HOME"
    git pull origin n > /dev/null 2>&1
    print_success "Repository updated"
fi

cd "$CLUSTER_HOME"

print_info "Installing npm dependencies..."
npm install > /dev/null 2>&1
print_success "Dependencies installed"

# ============================================================================
# PHASE 4: KERNEL TUNING
# ============================================================================
print_header "PHASE 4: Kernel Tuning (Low-Latency)"

if [ -f "scripts/kernel-tuning.sh" ]; then
    print_info "Running kernel optimization..."
    sudo bash scripts/kernel-tuning.sh "$NODE_ROLE" > /dev/null
    print_success "Kernel tuned for low-latency"
else
    print_error "kernel-tuning.sh not found"
fi

# ============================================================================
# PHASE 5: ROLE-SPECIFIC SETUP
# ============================================================================
case "$NODE_ROLE" in
    gateway)
        print_header "PHASE 5: Gateway Setup"
        
        # Create environment
        if [ ! -f ".env" ]; then
            cp .env.example .env
            print_success ".env created from template"
        fi
        
        # Build application
        print_info "Building TypeScript..."
        npm run build > /dev/null
        print_success "Build complete"
        
        # Setup systemd service
        print_info "Setting up systemd service..."
        sudo tee /etc/systemd/system/cluster-api.service > /dev/null << EOF
[Unit]
Description=Cluster API Gateway
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CLUSTER_HOME
ExecStart=$(which node) dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable cluster-api > /dev/null
        print_success "Systemd service configured"
        
        # Start service
        print_info "Starting API service..."
        sudo systemctl restart cluster-api
        sleep 2
        
        if curl -s http://localhost:3000/health > /dev/null; then
            print_success "API service running on port 3000"
        else
            print_error "API service failed to start"
        fi
        ;;
        
    ai-engine)
        print_header "PHASE 5: AI Engine Setup"
        
        # Create environment
        if [ ! -f ".env" ]; then
            cat > .env << EOF
NODE_ENV=production
PORT=3001
GRPC_PORT=50051
LOG_LEVEL=info

# Connect to data store (Node 3)
DB_HOST=192.168.1.103
DB_PORT=5432
DB_USER=cluster
DB_PASSWORD=change-me
DB_NAME=cluster_db

REDIS_HOST=192.168.1.103
REDIS_PORT=6379
EOF
            print_success ".env configured for data node 192.168.1.103"
        fi
        
        # Install AI dependencies
        print_info "Installing AI dependencies..."
        python3 -m pip install librosa soundfile numpy scipy > /dev/null 2>&1
        print_success "AI libraries installed"
        
        # Build application
        print_info "Building TypeScript..."
        npm run build > /dev/null
        print_success "Build complete"
        
        print_info "AI Engine ready on port 3001, gRPC on 50051"
        ;;
        
    data-store)
        print_header "PHASE 5: Data Store Setup"
        
        # PostgreSQL
        print_info "Setting up PostgreSQL..."
        sudo apt install -y postgresql postgresql-contrib > /dev/null
        sudo systemctl start postgresql
        sudo systemctl enable postgresql > /dev/null
        
        # Create database
        sudo -u postgres psql << SQL > /dev/null 2>&1
CREATE DATABASE cluster_db;
CREATE USER cluster WITH PASSWORD 'cluster-password';
ALTER ROLE cluster WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE cluster_db TO cluster;
SQL
        
        # Configure PostgreSQL for network access
        sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" \
            /etc/postgresql/*/main/postgresql.conf
        
        echo "host    all             all             0.0.0.0/0               md5" | \
            sudo tee -a /etc/postgresql/*/main/pg_hba.conf > /dev/null
        
        sudo systemctl restart postgresql
        print_success "PostgreSQL configured"
        
        # Redis
        print_info "Setting up Redis..."
        sudo apt install -y redis-server > /dev/null
        
        sudo sed -i 's/bind 127.0.0.1/bind 0.0.0.0/g' /etc/redis/redis.conf
        sudo sed -i 's/# maxmemory/maxmemory 4gb/g' /etc/redis/redis.conf
        sudo sed -i 's/# maxmemory-policy/maxmemory-policy allkeys-lru/g' /etc/redis/redis.conf
        
        sudo systemctl restart redis-server
        sudo systemctl enable redis-server > /dev/null
        print_success "Redis configured"
        
        print_info "PostgreSQL: 5432, Redis: 6379"
        ;;
esac

# ============================================================================
# VERIFICATION
# ============================================================================
print_header "Verification"

print_info "System Information:"
echo "  Hostname: $(hostname)"
echo "  IP Address: $(hostname -I | awk '{print $1}')"
echo "  Node Role: $NODE_ROLE"

print_info "Installed Versions:"
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"
echo "  Python: $(python3 --version)"
echo "  Git: $(git --version | awk '{print $3}')"

case "$NODE_ROLE" in
    gateway)
        print_info "Gateway Status:"
        if curl -s http://localhost:3000/health | grep -q "healthy"; then
            echo "  API: $(curl -s http://localhost:3000/health | jq .status)"
        fi
        ;;
    data-store)
        print_info "Data Store Status:"
        sudo -u postgres psql cluster_db -c "SELECT version();" | head -1
        redis-cli PING
        ;;
esac

# ============================================================================
# COMPLETE
# ============================================================================
print_header "Setup Complete!"
print_success "Cluster $NODE_ROLE is ready"
echo ""
print_info "Next steps:"
case "$NODE_ROLE" in
    gateway)
        echo "  1. Join other nodes to the cluster"
        echo "  2. Test: curl http://localhost:3000/health"
        ;;
    ai-engine)
        echo "  1. Ensure Node 3 (data-store) is running"
        echo "  2. Configure: nano .env (set DB_HOST to Node 3 IP)"
        echo "  3. Start: npm run dev"
        ;;
    data-store)
        echo "  1. Ensure firewall allows 5432 (PostgreSQL) and 6379 (Redis)"
        echo "  2. Test from other nodes: nc -zv $(hostname -I | awk '{print $1}') 5432"
        ;;
esac
echo ""
