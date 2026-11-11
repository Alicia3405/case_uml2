<#
.SYNOPSIS
    Script automatizado en PowerShell para desplegar exclusivamente case_uml2 en AWS EC2 sin tocar otros proyectos.
.DESCRIPTION
    Uso:
    .\deploy-to-ec2.ps1 -HostIp "54.xxx.xxx.xxx"
#>

param (
    [Parameter(Mandatory=$true, HelpMessage="IP Pública de la nueva instancia EC2 para case_uml2")]
    [string]$HostIp,

    [Parameter(Mandatory=$false)]
    [string]$User = "ubuntu",

    [Parameter(Mandatory=$false)]
    [string]$KeyPath = "C:\Users\jkira\Desktop\case-studio-key.pem",

    [Parameter(Mandatory=$false)]
    [string]$Domain = "casestudio.duckdns.org"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 Desplegando PROYECTO: case_uml2 en AWS EC2 ($HostIp)" -ForegroundColor Cyan
Write-Host "Cuenta AWS: 886595575652 (Aislado sin tocar deploy previo)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $KeyPath)) {
    Write-Warning "No se encontró el archivo de llave privada en: $KeyPath"
}

$RemoteScript = @"
set -e
echo '--- [1/4] Actualizando repositorio case_uml2 ---'
if [ -d "`$HOME/case_uml2" ]; then
    cd "`$HOME/case_uml2"
    git pull origin main || true
else
    git clone https://github.com/Alicia3405/case_uml2.git "`$HOME/case_uml2"
    cd "`$HOME/case_uml2"
fi

echo '--- [2/4] Verificando Docker y permisos ---'
sudo usermod -aG docker ubuntu || true
sudo chmod 666 /var/run/docker.sock || true

echo '--- [3/4] Desplegando contenedores de case_uml2 (proyecto aislado) ---'
cd "`$HOME/case_uml2/infra"
export DOMAIN_NAME="$Domain"
sudo -E docker compose -p case_uml2 down || true
sudo -E docker compose -p case_uml2 up -d --build

echo '--- [4/4] Verificando estado de los contenedores de case_uml2 ---'
docker compose -p case_uml2 ps

echo '✅ [AWS EC2] Despliegue de case_uml2 completado con éxito!'
"@

Write-Host "Ejecutando despliegue remoto vía SSH..." -ForegroundColor Green
ssh -o StrictHostKeyChecking=no -i $KeyPath "$User@$HostIp" $RemoteScript

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 case_uml2 está activo y corriendo en: http://$HostIp" -ForegroundColor Green
Write-Host "API Backend: http://$HostIp:3002" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
