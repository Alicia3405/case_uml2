# 🚀 UML/ER Studio - Backend API

Servicio backend de alto rendimiento desarrollado con **NestJS**, **TypeORM**, **PostgreSQL** y **Socket.io**. Proporciona la infraestructura REST y en tiempo real para el modelado colaborativo de diagramas de clases UML, integración con modelos de lenguaje multimodal (**Google Gemini**), interoperabilidad con suites CASE tradicionales (**Enterprise Architect XMI 2.1**) y compilación automática de diagramas a código fuente fullstack (**Spring Boot 3 + PostgreSQL** y **Flutter**).

---

## 📌 Tabla de Contenidos
1. [Características Principales](#-características-principales)
2. [Arquitectura del Sistema](#-arquitectura-del-sistema)
3. [Módulos del Backend](#-módulos-del-backend)
4. [Requisitos Previos](#-requisitos-previos)
5. [Variables de Entorno](#-variables-de-entorno)
6. [Instalación y Ejecución](#-instalación-y-ejecución)
7. [Documentación de la API (Swagger)](#-documentación-de-la-api-swagger)
8. [Estructura del Código](#-estructura-del-código)
9. [Scripts Disponibles](#-scripts-disponibles)

---

## ✨ Características Principales

* **Autenticación & Autorización Segura**: JWT con Bcrypt, guardias globales y decorador `@Public()` para rutas públicas. Soporte para IDs polimórficos (`Long`, `Integer`, `UUID`, `String`) en los tokens y claims.
* **Persistencia Relacional Avanzada**: Esquema relacional en PostgreSQL mapeando el Abstract Syntax Tree (AST) de clases UML (nodos, atributos, métodos, tipos de datos, multiplicidades y relaciones).
* **Colaboración en Tiempo Real (WebSockets)**: Sincronización multiusuario por salas con Socket.io (cursores remotos, arrastre de nodos, bloqueo concurrente `lock_node` y chat integrado en el módulo de proyectos).
* **Asistente de Inteligencia Artificial Híbrido (Local & Cloud)**:
  * **Inferencia Local Soberana con Ollama (`qwen2.5:3b`)**: Ejecución de comandos de lenguaje natural para mutación estructural en caliente del diagrama mediante un servidor Ollama local (`http://localhost:11434`), garantizando privacidad absoluta sin salida de datos a la red externa.
  * **Cloud Multimodal de Respaldo con Google Gemini (`gemini-2.5-flash`)**: Análisis de visión artificial (Webcam / Bocetos) para digitalizar diagramas dibujados a mano y fallback cloud vía Google Cloud Vertex AI / Google AI Studio.
  * Selector dinámico de proveedor mediante variable de entorno `AI_PROVIDER` (`ollama` o `vertex`).
* **Generador de Código Fullstack Automatizado**:
  * **Spring Boot 3+ (Java 17/21)**: Arquitectura en capas limpia con servicios directos (`@Service`), entidades JPA con relaciones (`@OneToMany`, `@ManyToOne`, `@ManyToMany`), repositorios `JpaRepository`, DTOs y Mappers, controladores REST, scripts Flyway (`V1__create_tables.sql`) con soporte automático para claves primarias `BIGSERIAL` y `UUID` nativo (`pgcrypto`), configuración dual de Docker Compose (desarrollo local y despliegue autónomo con PostgreSQL 18).
  * **Flutter Móvil (Dart)**: Clean Architecture en capas (Data, Domain, Presentation), gestión de estado reactiva con **BLoC**, persistencia de sesión segura en `TokenStorageService`, pantalla de perfil con visualización del usuario conectado, y **Asistente IA On-Device Autónomo** que descarga automáticamente el modelo **Qwen 2.5 GGUF** (`qwen2.5-0.5b-instruct-q4_k_m.gguf` desde Hugging Face) ejecutando inferencia local vía `llama.cpp` en el propio dispositivo sin depender de servidores externos, complementado con un procesador semántico nativo para comandos CRUD y dictado por voz Speech-to-Text.
  * Previsualización de archivos en memoria y descarga empaquetada en formato `.zip` mediante `archiver`/`jszip`.
* **Interoperabilidad XMI 2.1**:
  * Exportación e importación bidireccional de esquemas XMI compatibles con **Enterprise Architect v17** integrada en el módulo de generación de código.
  * Versionado histórico de diagramas con capacidad de restauración de estados previos.
* **Almacenamiento y Distribución en la Nube (Amazon S3)**:
  * Integración nativa con **AWS SDK v3** (`@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`).
  * Almacenamiento seguro de paquetes `.zip` generados en buckets de **Amazon S3**.
  * Entrega mediante URLs prefirmadas (*Presigned URLs*) temporales y autenticadas con expiración configurable.
  * Soporte de autenticación dual: API keys (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) o asignación de **IAM Roles** de instancia EC2.

---

## 🏛 Arquitectura del Sistema

El backend está diseñado bajo una arquitectura modular y limpia en 5 capas:

```text
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway & WebSockets                 │
│         - REST Controllers (Pipes de Validación & Swagger)  │
│         - Socket.io Gateways (Salas de Colaboración en vivo)│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      Capa de Servicios                      │
│     - Lógica de Negocio      - Orquestador Gemini AI        │
│     - Parser AST / XMI 2.1   - Generadores Spring & Flutter │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Capa de Repositorios                     │
│               - TypeORM Custom Repositories                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                   Persistencia & Base de Datos              │
│               - PostgreSQL (Entidades Relacionales)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧩 Módulos del Backend

Ubicados en `src/modules/`:

| Módulo | Descripción |
| :--- | :--- |
| **`auth/`** | Registro, login, emisión de tokens JWT, hashing con Bcrypt, soporte para IDs polimórficos (`Long`, `UUID`, etc.) y gestión de perfiles. |
| **`projects/`** | Administración de proyectos colaborativos, control de miembros y roles (`OWNER`, `EDITOR`, `VIEWER`), junto con el **WebSocket Gateway de Colaboración** (`/collaboration`) para cursores en vivo, bloqueo de nodos (`NodeLock`) y chat de sala. |
| **`diagrams/`** | CRUD optimizado del AST del diagrama (clases, atributos, métodos, relaciones, multiplicidades y coordenadas). |
| **`ai-assistant/`** | Integración con Google Gemini para análisis multimodal de fotos/bocetos de cámara y comandos de mutación de diagramas en lenguaje natural. |
| **`code-generator/`** | Generación de arquitecturas completas en Spring Boot 3 y Flutter Móvil, empaquetado en ZIP, almacenamiento en Amazon S3 (URLs prefirmadas) y conversión bidireccional XMI 2.1 con Enterprise Architect. |

---

## 📋 Requisitos Previos

* **Node.js**: Versión `20.x` o `22.x` recomendada.
* **npm**: Versión `10.x` o superior.
* **PostgreSQL**: Versión `15` o `16+` en ejecución.

---

## ⚙️ Variables de Entorno

Crea un archivo `.env` en la raíz del directorio `backend/` con las siguientes variables:

```env
# Puerto del Servidor HTTP
PORT=3000

# Configuración de CORS y Frontend para Producción
FRONTEND_URL=https://evertrodriguez.dev
CORS_ORIGINS=https://evertrodriguez.dev,https://www.evertrodriguez.dev,http://localhost:4200,http://127.0.0.1:4200

# Configuración de Base de Datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=tu_password
DB_NAME=uml_studio_db
DB_SYNCHRONIZE=true
DB_LOGGING=false

# Configuración JWT
JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

# Proveedor de Inteligencia Artificial ('ollama' para Qwen local, 'vertex' para Google Cloud Gemini)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT_MS=120000

# Proveedor Cloud de Respaldo / Multimodal (Google Cloud Vertex AI)
GCP_PROJECT_ID=tu_gcp_project_id
GCP_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=tu_api_key_de_google_ai_studio

# Almacenamiento en la Nube (Amazon S3)
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=uml-studio-artifacts
AWS_ACCESS_KEY_ID=tu_access_key_opcional_si_usas_iam_role
AWS_SECRET_ACCESS_KEY=tu_secret_key_opcional_si_usas_iam_role
AWS_S3_PRESIGNED_EXPIRATION=3600
```

---

## 🚀 Instalación y Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Crear la base de datos en PostgreSQL:**
   ```sql
   CREATE DATABASE uml_studio_db;
   ```

3. **Iniciar en modo desarrollo con recarga en caliente:**
   ```bash
   npm run start:dev
   ```

4. **Compilar para producción:**
   ```bash
   npm run build
   ```

5. **Iniciar en modo producción:**
   ```bash
   npm run start:prod
   ```

---

## 📚 Documentación de la API (Swagger)

Una vez iniciado el servidor, puedes acceder a la interfaz interactiva de Swagger UI con todos los endpoints documentados:

🔗 **URL:** `http://localhost:3000/api/docs`

---

## 📂 Estructura del Código

```text
backend/
├── src/
│   ├── app.module.ts              # Módulo raíz que ensambla todos los submódulos
│   ├── main.ts                    # Punto de entrada (CORS, Swagger, Pipes globales)
│   ├── common/                    # Decoradores, filtros de excepción, guards JWT
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   └── interceptors/
│   ├── config/                    # Configuraciones (database.config.ts, jwt.config.ts)
│   └── modules/                   # Módulos del dominio
│       ├── ai-assistant/          # Copilot Google Gemini (texto y visión artificial)
│       ├── auth/                  # JWT auth, contraseñas BCrypt, soporte ID polimórfico
│       ├── code-generator/        # Generador Spring Boot 3, Flutter móvil y XMI 2.1
│       │   ├── templates/         # Plantillas Mustache para Java y Dart
│       │   └── xmi/               # Conversor bidireccional Enterprise Architect
│       ├── diagrams/              # AST del lienzo UML (clases, miembros, relaciones)
│       └── projects/              # Proyectos, miembros y WebSocket CollaborationGateway
├── test/                          # Tests e2e y configuraciones de prueba
├── tsconfig.json
└── package.json
```

---

## 🛠 Scripts Disponibles

* `npm run start:dev`: Inicia el servidor en modo desarrollo (`watch mode`).
* `npm run build`: Compila la aplicación a JavaScript en `dist/`.
* `npm run start:prod`: Ejecuta el build de producción desde `dist/main.js`.
* `npm run test`: Ejecuta los tests unitarios con Jest.
* `npm run lint`: Ejecuta el linter ultrarrápido con Oxlint.
* `npm run format`: Formatea el código con Prettier.
