# Despliegue Activo en AWS EC2 — Proyecto: case_uml2 (Cuenta 886595575652)

El despliegue de **case_uml2** está **100% activo, operativo y asegurado con HTTPS (SSL Let's Encrypt)** en una nueva máquina virtual independiente dentro de tu cuenta de AWS.

---

## 1. Datos de Producción

| Parámetro | Valor de Producción |
|---|---|
| **URL Pública Segura (Web)** | [https://kellyuml.duckdns.org](https://kellyuml.duckdns.org) |
| **Documentación Backend (Swagger)** | [https://kellyuml.duckdns.org/api/docs](https://kellyuml.duckdns.org/api/docs) |
| **API REST** | `https://kellyuml.duckdns.org/api/` |
| **WebSockets (Colaboración UML)** | `wss://kellyuml.duckdns.org/socket.io/` |
| **Dirección IP Pública** | `34.229.85.128` |
| **ID Instancia EC2** | `i-0ad8fc5858133055b` |
| **Cuenta AWS** | `886595575652` (Región: `us-east-1`) |
| **Grupo de Seguridad** | `case_uml2-sg` (`sg-0b07da6a64808b58e`) |
| **Protocolo Seguro** | SSL / TLS Let's Encrypt (HTTP/2 activado) |
| **Redirección Forzada** | HTTP (puerto 80) redirige automáticamente a HTTPS (puerto 443) |
| **Renovación de Certificado** | Cron automático diario a las 03:00 AM |

---

## 2. Aislamiento Respecto al Despliegue Previo

Este despliegue se ejecuta en su propia máquina virtual y bajo el namespace exclusivo **`case_uml2`**:
- **Directorio del código en el servidor**: `/home/ubuntu/case_uml2`
- **Proyecto Docker Compose**: `case_uml2`
- **Contenedores activos**:
  - `case_uml2_nginx`: Proxy inverso con terminación SSL (puertos 80, 443)
  - `case_uml2_web`: Frontend Angular compilado en producción
  - `case_uml2_backend`: Motor NestJS API + WebSockets
  - `case_uml2_db`: Base de datos PostgreSQL 16 Alpine
- **Volúmenes de datos independientes**: `case_uml2_pgdata`, `case_uml2_certbot_certs`

---

## 3. Comandos Útiles de Mantenimiento

Para conectarte vía SSH desde tu máquina local usando la clave `case-studio-key.pem` que tienes en el Escritorio:

```powershell
ssh -i C:\Users\jkira\Desktop\case-studio-key.pem ubuntu@34.229.85.128
```

Ver estado de los contenedores:
```bash
cd ~/case_uml2/infra && sudo docker compose -p case_uml2 ps
```

Ver logs del backend:
```bash
cd ~/case_uml2/infra && sudo docker compose -p case_uml2 logs -f backend
```

Reiniciar servicios:
```bash
cd ~/case_uml2/infra && sudo docker compose -p case_uml2 restart
```
