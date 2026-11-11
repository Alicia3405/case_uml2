#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Remoto Exclusivo para case_uml2
# Cuenta AWS: 886595575652 (Sin tocar otros despliegues)
# ==============================================================================

set -euo pipefail

HOST_IP="${1:-}"
KEY_PATH="${2:-$HOME/Desktop/case-studio-key.pem}"
USER="${3:-ubuntu}"
DOMAIN="${4:-casestudio.duckdns.org}"

if [ -z "$HOST_IP" ]; then
    echo "❌ Error: Debes especificar la IP pública de la instancia EC2 para case_uml2."
    echo "Uso: ./deploy-to-ec2.sh <IP_PUBLICA> [RUTA_LLAVE_PEM] [USUARIO] [DOMINIO]"
    exit 1
fi

echo "=========================================================="
echo "🚀 Desplegando case_uml2 en AWS EC2: $HOST_IP"
echo "Cuenta AWS: 886595575652 (Proyecto aislado)"
echo "=========================================================="

if [ ! -f "$KEY_PATH" ]; then
    echo "⚠️ Advertencia: No se encontró la llave SSH en: $KEY_PATH"
fi

chmod 400 "$KEY_PATH" 2>/dev/null || true

ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$USER@$HOST_IP" bash -s << 'EOF'
set -e
echo "--- [1/4] Actualizando repositorio case_uml2 ---"
if [ -d "$HOME/case_uml2" ]; then
    cd "$HOME/case_uml2"
    git pull origin main || true
else
    git clone https://github.com/Alicia3405/case_uml2.git "$HOME/case_uml2"
    cd "$HOME/case_uml2"
fi

echo "--- [2/4] Verificando permisos Docker ---"
sudo usermod -aG docker ubuntu || true
sudo chmod 666 /var/run/docker.sock || true

echo "--- [3/4] Levantando contenedores de case_uml2 ---"
cd "$HOME/case_uml2/infra"
sudo -E docker compose -p case_uml2 down || true
sudo -E docker compose -p case_uml2 up -d --build

echo "--- [4/4] Estado de los servicios de case_uml2 ---"
docker compose -p case_uml2 ps
echo "✅ Despliegue de case_uml2 completado con éxito."
EOF

echo ""
echo "=========================================================="
echo "🎉 Despliegue de case_uml2 finalizado!"
echo "Acceso Web: http://$HOST_IP"
echo "Backend API: http://$HOST_IP:3002"
echo "=========================================================="
