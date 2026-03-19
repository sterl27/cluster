"""
ClusterNode Discovery Service
Minimalist service discovery for 3-node Ubuntu cluster
Enables dynamic IP resolution without hardcoding
"""

import socket
import os
from typing import Dict, Optional
from dataclasses import dataclass


@dataclass
class ServiceEndpoint:
    """Service endpoint definition"""
    name: str
    host: str
    port: int
    protocol: str = "http"
    
    def url(self) -> str:
        """Get full connection URL"""
        return f"{self.protocol}://{host}:{self.port}"


class ClusterNodeRegistry:
    """Service registry for 3-node cluster topology"""
    
    def __init__(self, node_map: Optional[Dict[str, str]] = None):
        """
        Initialize cluster node registry
        
        Args:
            node_map: Override default node mappings (for testing)
        
        Default topology:
        - Node 1 (192.168.1.101): Gateway/Manager
        - Node 2 (192.168.1.102): AI Engine/Worker
        - Node 3 (192.168.1.103): Data Store/PostgreSQL+Redis
        """
        self.nodes = node_map or {
            "gateway": "192.168.1.101",
            "ai_engine": "192.168.1.102",
            "data_store": "192.168.1.103"
        }
        
        # Service port mappings
        self.services = {
            "postgresql": (self.nodes["data_store"], 5432),
            "redis": (self.nodes["data_store"], 6379),
            "api": (self.nodes["gateway"], 3000),
            "grpc": (self.nodes["ai_engine"], 50051),
            "metrics": (self.nodes["gateway"], 9090),
        }
    
    def get_service_url(self, service_name: str) -> str:
        """
        Get full service URL for connection
        
        Args:
            service_name: Service identifier (postgresql, redis, api, etc)
            
        Returns:
            Connection string (e.g., "postgresql://192.168.1.103:5432")
            
        Raises:
            ValueError: If service not found in registry
        """
        if service_name not in self.services:
            available = ", ".join(self.services.keys())
            raise ValueError(
                f"Service '{service_name}' not found. "
                f"Available: {available}"
            )
        
        host, port = self.services[service_name]
        
        # Protocol-specific URL formatting
        if service_name == "postgresql":
            return f"postgresql://{host}:{port}"
        elif service_name == "redis":
            return f"redis://{host}:{port}"
        else:
            return f"http://{host}:{port}"
    
    def get_service_host(self, service_name: str) -> str:
        """Get just the host/IP for a service"""
        if service_name not in self.services:
            raise ValueError(f"Service '{service_name}' not found")
        return self.services[service_name][0]
    
    def get_service_port(self, service_name: str) -> int:
        """Get just the port for a service"""
        if service_name not in self.services:
            raise ValueError(f"Service '{service_name}' not found")
        return self.services[service_name][1]
    
    def list_services(self) -> Dict[str, str]:
        """List all registered services with their URLs"""
        return {
            name: self.get_service_url(name) 
            for name in self.services.keys()
        }
    
    def health_check(self, service_name: str, timeout: int = 2) -> bool:
        """
        Check if service is reachable
        
        Args:
            service_name: Service to check
            timeout: Connection timeout in seconds
            
        Returns:
            True if service is reachable
        """
        try:
            host = self.get_service_host(service_name)
            port = self.get_service_port(service_name)
            
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            
            return result == 0
        except Exception as e:
            print(f"Health check failed for {service_name}: {e}")
            return False


# Global singleton instance
_discovery = None


def get_discovery() -> ClusterNodeRegistry:
    """Get global discovery instance (singleton pattern)"""
    global _discovery
    if _discovery is None:
        _discovery = ClusterNodeRegistry()
    return _discovery


# Example/test usage
if __name__ == "__main__":
    discovery = ClusterNodeRegistry()
    
    print("🔍 Cluster Service Discovery")
    print("=" * 50)
    print("\nRegistered Services:")
    for service, url in discovery.list_services().items():
        print(f"  {service:15} → {url}")
    
    print("\n✓ Health Checks:")
    for service in discovery.services.keys():
        healthy = discovery.health_check(service)
        status = "✓ Online" if healthy else "✗ Offline"
        print(f"  {service:15} {status}")
    
    print("\n📡 Connection Examples:")
    print(f"  PostgreSQL: {discovery.get_service_url('postgresql')}")
    print(f"  Redis:      {discovery.get_service_url('redis')}")
    print(f"  API:        {discovery.get_service_url('api')}")
