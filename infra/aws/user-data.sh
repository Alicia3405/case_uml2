#!/usr/bin/env bash
# ==============================================================================
# Script de Inicialización (User Data) para Instancia AWS EC2
# Proyecto: case_uml2
# Cuenta AWS: 886595575652
# Sistema Operativo: Ubuntu 24.04 / 22.04 LTS
# ==============================================================================

set -euo pipefail
exec > >(tee -a /var/log/user-data.log) 2>&1
echo "🚀 [INIT] Iniciando configuración de servidor EC2 exclusivo para case_uml2..."

# 1. Actualizar repositorios del sistema
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg lsb-release git ufw fail2ban jq

# 2. Instalar Docker oficial y Docker Compose Plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. Habilitar y configurar Docker para el usuario 'ubuntu'
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu
chmod 666 /var/run/docker.sock || true

# 4. Configurar swap de 4GB para estabilidad de compilación/Docker
if [ ! -f /swapfile ]; then
    echo "⚙️ Configurando archivo Swap de 4GB..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 5. Configuración de Firewall UFW
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP Nginx
ufw allow 443/tcp   # HTTPS SSL
ufw allow 3000/tcp  # Web frontend
ufw allow 3001/tcp  # Backend API
ufw --force enable

# 6. Preparar directorio de la aplicación case_uml2
APP_DIR="/home/ubuntu/case_uml2"
if [ ! -d "$APP_DIR" ]; then
    echo "📁 Clonando repositorio case_uml2 en $APP_DIR..."
    git clone https://github.com/Alicia3405/case_uml2.git "$APP_DIR"
    chown -R ubuntu:ubuntu "$APP_DIR"
fi

echo "✅ [DONE] Servidor EC2 listo exclusivamente para case_uml2!"
