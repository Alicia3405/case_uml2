# CASE Studio AI — Plataforma CASE Colaborativa, Generador Spring Boot y App Móvil Offline

Sistema de **Ingeniería de Software Asistida por Computadora (CASE)** orientado al **Diseño Conceptual de Datos** mediante **Diagramas de Clases UML 2.5+**, generación automatizada de **Backends completos en Spring Boot 3 con PostgreSQL** (aplicando formalmente las reglas de mapeo **OMT/DMO de James Rumbaugh**), e interoperabilidad estándar **XMI 2.1/2.5** con Enterprise Architect. Incluye un cliente móvil de pruebas en **Flutter con interacción por voz manos libres (Voice-First)** y capacidad de **operación 100% offline con IA Local on-device**.

---

## Tabla de contenidos

1. [Arquitectura](#arquitectura)
2. [Requisitos previos](#requisitos-previos)
3. [Configurar local](#configurar-local)
4. [Cómo correr los servicios](#cómo-correr-los-servicios)
5. [Variables de entorno](#variables-de-entorno)
6. [Despliegue en AWS](#despliegue-en-aws)
7. [Tareas frecuentes](#tareas-frecuentes)
8. [Solución de problemas](#solución-de-problemas)

---

## Arquitectura

```
                               ┌──────────────────────────────────────────┐
                               │              GitHub Actions              │
                               │    (Lint, Test, Docker Build & Push)     │
                               └────────────────────┬─────────────────────┘
                                                    │ docker build & push
                                                    ▼
                               ┌──────────────────────────────────────────┐
                               │       AWS ECR / Container Registry       │
                               └────────────────────┬─────────────────────┘
                                                    │ pull via SSH
                                                    ▼
┌─────────────────────────┐      ┌────────────────────────────────────────────────────────┐
│      Mobile Flutter     │      │                AWS EC2 / Cloud VM                      │
│ (Voice-First + LocalAI) │      │                 (Docker Compose)                       │
│    [BLoC + Offline]     │      │                                                        │
└────────────┬────────────┘      │  ┌──────────────────────────────────────────────────┐  │
             │                   │  │              Nginx Reverse Proxy + SSL           │  │
             │ HTTPS / WSS       │  │                      (Certbot)                   │  │
             ├──────────────────►│  └──────────┬────────────────────────────┬──────────┘  │
             │                   │             │                            │             │
┌────────────┴────────────┐      │             │ :8080 (REST / WS)          │ :3000       │
│      Web CASE Studio    │      │             ▼                            ▼             │
│ (Canvas UML 2.5+ / XMI) ├─────►│  ┌──────────────────────┐    ┌──────────────────────┐  │
│ (Voz + Visión + Tutor)  │      │  │  CASE Engine Backend │    │     Web CASE App     │  │
└─────────────────────────┘      │  │  (Spring Boot / Java)│    │  (Angular / React)   │  │
                                 │  └──────────┬───────────┘    └──────────────────────┘  │
                                 │             │ JPA / SQL                                │
                                 │             ▼                                          │
                                 │  ┌──────────────────────┐    ┌──────────────────────┐  │
                                 │  │ PostgreSQL Database  │    │     Ollama Local     │  │
                                 │  │  (Postgres 16 Alpine)│    │  (IA In-VM / Local)  │  │
                                 │  └──────────────────────┘    └──────────────────────┘  │
                                 └────────────────────────────────────────────────────────┘
```

### Tabla de Componentes

| Componente | Pila Tecnológica | Puerto Local | Despliegue en Producción |
|---|---|---|---|
| **Web CASE Studio** | Angular 21 / React TS + Canvas UML 2.5 | `http://localhost:3000` | Nginx Static en contenedor AWS |
| **CASE Engine & API** | Spring Boot 3.3 (Java 21) + WebSockets | `http://localhost:8080` | Contenedor Docker en AWS EC2 |
| **Database** | PostgreSQL 16 Alpine | `localhost:5432` | AWS RDS PostgreSQL / Contenedor |
| **IA Local (Servidor)** | Ollama / SLM (Modelos Llama 3 / Qwen) | `http://localhost:11434` | Contenedor en VM con GPU/CPU |
| **Reverse Proxy** | Nginx Alpine + SSL (Certbot) | `80`, `443` | Nginx con terminación SSL en AWS |
| **Mobile App** | Flutter 3.x (Android / iOS) + BLoC | Dispositivo / Emulador | APK de Release / App Bundle |

---

## Requisitos previos

- **Docker Desktop** (v24+) y **Docker Compose** (v2.20+)
- **Java JDK 21** y **Maven 3.9+** (para desarrollo local del backend)
- **Node.js 20+** y **npm 10+** (para desarrollo local del frontend web)
- **Flutter SDK 3.22+** y **Android Studio / Xcode** (para la aplicación móvil)
- **Git** y **OpenSSH Client**

---

## Configurar local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/tu-usuario/case-studio-ai.git
   cd case-studio-ai
   ```

2. **Crear archivo de variables locales**:
   ```bash
   cp .env.example .env
   ```

3. **Verificar servicios con Docker**:
   ```bash
   docker compose -f infra/docker-compose.local.yml up -d
   ```

4. **Acceder a las interfaces**:
   - Web CASE Studio: `http://localhost:3000`
   - Swagger / OpenAPI del Backend: `http://localhost:8080/swagger-ui.html`
   - Base de datos PostgreSQL: `localhost:5432` (`user: postgres`, `db: casestudio`)

---

## Cómo correr los servicios

### Opción 1: Todos los servicios vía Docker Compose (Recomendado)

```bash
# Iniciar todo el ecosistema local
docker compose -f infra/docker-compose.local.yml up -d

# Ver logs en tiempo real
docker compose -f infra/docker-compose.local.yml logs -f

# Detener los servicios
docker compose -f infra/docker-compose.local.yml down
```

### Opción 2: Correr cada servicio en modo Desarrollo individual

- **Backend (Spring Boot)**:
  ```bash
  cd backend
  ./mvnw spring-boot:run
  ```

- **Frontend Web (CASE Studio)**:
  ```bash
  cd web
  npm install
  npm run dev # o npm start
  ```

- **Aplicación Móvil (Flutter)**:
  ```bash
  cd mobile
  flutter pub get
  flutter run
  ```

---

## Variables de entorno

Configuración en `.env` (desarrollo) o `.env.production` (AWS):

| Variable | Descripción | Valor por Defecto |
|---|---|---|
| `POSTGRES_DB` | Nombre de base de datos | `casestudio` |
| `POSTGRES_USER` | Usuario de PostgreSQL | `casestudio_user` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `casestudio_secret_2026` |
| `SPRING_PROFILES_ACTIVE` | Perfil de Spring Boot | `prod` (o `dev`) |
| `JWT_SECRET` | Clave secreta para tokens JWT | Cadena segura de 256 bits |
| `GEMINI_API_KEY` | Llave API para Visión Foto-a-UML | Opcional en modo Cloud |
| `OLLAMA_BASE_URL` | URL de inferencia IA Local | `http://ollama:11434` |
| `DOMAIN_NAME` | Dominio para SSL Certbot | `tu-dominio.com` |

---

## Despliegue en AWS

### Despliegue Automatizado con GitHub Actions

1. Configurar Secrets en el repositorio (`Settings -> Secrets and variables -> Actions`):
   - `AWS_HOST`: IP pública de la instancia EC2.
   - `AWS_USER`: `ubuntu` o `ec2-user`.
   - `AWS_SSH_KEY`: Clave privada SSH (`.pem` / OpenSSH).
   - `DOCKER_REGISTRY`: URL del AWS ECR o Docker Hub.
2. Hacer push a la rama `main`. El pipeline `.github/workflows/deploy.yml` compilará las imágenes, las subirá al registro y ejecutará el despliegue automático en la VM.

### Certificado SSL con Let's Encrypt (Primera vez)

```bash
docker compose -f infra/docker-compose.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d tu-dominio.com -d api.tu-dominio.com
```

Renovación automática vía cron en la VM:
```cron
0 3 * * * cd ~/case-studio-ai && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

---

## Tareas frecuentes

### Generar y ejecutar el Backend Spring Boot desde un Diagrama UML

1. En el canvas web de **CASE Studio**, diseña o importa tu diagrama de clases.
2. Haz clic en **Generar Backend Spring Boot**.
3. Se descargará el archivo `spring-boot-backend.zip`.
4. Descomprime y ejecuta:
   ```bash
   cd spring-boot-backend
   ./mvnw clean compile
   ./mvnw spring-boot:run
   ```
5. Todas las tablas en PostgreSQL se crearán de forma automática con Hibernate JPA (`ddl-auto: update`), y la documentación estará lista en `http://localhost:8080/swagger-ui.html`.

### Interoperabilidad con Enterprise Architect

- **Exportar a EA**: Menú `Archivo -> Exportar XMI`. Genera un archivo `.xmi` compatible con Enterprise Architect (XMI 2.1).
- **Importar de EA**: Menú `Archivo -> Importar XMI`. Carga cualquier diagrama de clases modelado previamente en Enterprise Architect.

### Pruebas de la App Móvil

```bash
cd mobile
flutter test
flutter build apk --release
# Salida: build/app/outputs/flutter-apk/app-release.apk
```

---

## Solución de problemas

### Mobile: La app no conecta al backend desde el emulador Android

Los emuladores Android **no pueden acceder a `localhost` del host directamente**.
- Debe usarse la IP de gateway especial: `http://10.0.2.2:8080`.
- Esta configuración ya está mapeada en `mobile/lib/core/config/app_config.dart`.
- Verificar que el backend esté escuchando en `0.0.0.0:8080` (y no únicamente en `127.0.0.1`).

### Backend: `connection refused` a PostgreSQL

Verifica que el contenedor de PostgreSQL esté saludable:
```bash
docker ps --filter "name=db"
docker compose logs db
```

### Exclusión Mutua en Canvas: Bloqueo persistente de nodo

Si un usuario se desconectó abruptamente dejando una clase bloqueada:
- El servidor WebSocket libera automáticamente el bloqueo tras un timeout de 15 segundos sin heartbeat (`PING`/`PONG`).
- También se puede hacer clic derecho en el nodo y seleccionar `Forzar liberación de bloqueo (Admin)`.
