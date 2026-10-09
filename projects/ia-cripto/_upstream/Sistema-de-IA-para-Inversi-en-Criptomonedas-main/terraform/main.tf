# Terraform Configuration for Crypto AI Trading System
# ====================================================

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

# Variables
variable "do_token" {
  description = "DigitalOcean API Token"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Region for droplets"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "Droplet size"
  type        = string
  default     = "s-4vcpu-8gb"
}

variable "ssh_key_path" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

# SSH Key
resource "digitalocean_ssh_key" "crypto_ai" {
  name       = "crypto-ai-key"
  public_key = file(var.ssh_key_path)
}

# VPC Network
resource "digitalocean_vpc" "crypto_ai_network" {
  name     = "crypto-ai-vpc"
  region  = var.region
  ip_range = "10.0.0.0/16"
}

# Database Droplet (PostgreSQL + TimescaleDB)
resource "digitalocean_droplet" "database" {
  name     = "crypto-ai-db"
  size    = var.droplet_size
  image   = "ubuntu-22-04-x64"
  region  = var.region
  vpc_uuid = digitalocean_vpc.crypto_ai_network.id
  
  ssh_keys = [digitalocean_ssh_key.crypto_ai.fingerprint]
  
  user_data = <<-EOF
              #!/bin/bash
              export DEBIAN_FRONTEND=noninteractive
              
              # Update and install PostgreSQL
              apt-get update
              apt-get install -y postgresql postgresql-contrib
              
              # Configure TimescaleDB
              apt-get install -y timescaledb-2-postgresql-14
              
              # Start PostgreSQL
              systemctl enable postgresql
              systemctl start postgresql
              
              # Allow remote connections
              echo "listen_addresses = '*'" >> /etc/postgresql/14/main/postgresql.conf
              echo "host all all 0.0.0.0/0 md5" >> /etc/pg_hba.conf
              
              systemctl restart postgresql
              EOF
}

# App Droplet (API + Frontend)
resource "digitalocean_droplet" "app" {
  name     = "crypto-ai-app"
  size    = var.droplet_size
  image   = "ubuntu-22-04-x64"
  region  = var.region
  vpc_uuid = digitalocean_vpc.crypto_ai_network.id
  
  ssh_keys = [digitalocean_ssh_key.crypto_ai.fingerprint]
  
  user_data = <<-EOF
              #!/bin/bash
              export DEBIAN_FRONTEND=noninteractive
              
              # Install Docker
              apt-get update
              apt-get install -y docker.io docker-compose
              
              # Install Docker Compose
              curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
              chmod +x /usr/local/bin/docker-compose
              
              # Configure firewall
              ufw allow 80/tcp
              ufw allow 443/tcp
              ufw allow 8000/tcp
              ufw allow 3000/tcp
              EOF
}

# Load Balancer
resource "digitalocean_loadbalancer" "crypto_ai" {
  name         = "crypto-ai-lb"
  region       = var.region
  vpc_uuid     = digitalocean_vpc.crypto_ai_network.id
  algorithm   = "round_robin"
  redirect_http_to_https = true
  
  healthcheck {
    protocol = "http"
    path     = "/health"
    port     = 8000
  }
  
  forwarding_rule {
    entry_port     = 80
    entry_protocol = "http"
    target_port    = 80
    target_protocol = "http"
  }
  
  forwarding_rule {
    entry_port     = 443
    entry_protocol = "https"
    target_port    = 443
    target_protocol = "https"
  }
  
  droplet_ids = [digitalocean_droplet.app.id]
}

# Outputs
output "app_ip" {
  value     = digitalocean_droplet.app.ipv4_address
  sensitive = true
}

output "database_ip" {
  value     = digitalocean_droplet.database.ipv4_address
  sensitive = true
}

output "load_balancer_ip" {
  value     = digitalocean_loadbalancer.crypto_ai.ip
}