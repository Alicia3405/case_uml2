# 🎨 UML/ER Collaborative Studio - Frontend

Aplicación web moderna y reactiva construida con **Angular 22+**, **Foblex Flow (`@foblex/flow`)** y **Tailwind CSS v4**. Ofrece un entorno integral para el modelado visual colaborativo de diagramas de clases UML, asistencia de Inteligencia Artificial en caliente (**Google Gemini**), interoperabilidad con **Enterprise Architect (XMI 2.1)** y previsualización interactiva de código generado para **Spring Boot** y **Flutter**.

---

## 📌 Tabla de Contenidos
1. [Características Principales](#-características-principales)
2. [Stack Tecnológico](#-stack-tecnológico)
3. [Configuración de Conexión con Backend](#-configuración-de-conexión-con-backend)
4. [Estructura del Proyecto](#-estructura-del-proyecto)
5. [Requisitos Previos](#-requisitos-previos)
6. [Instalación y Ejecución](#-instalación-y-ejecución)
7. [Módulos y Componentes Clave](#-módulos-y-componentes-clave)
8. [Scripts Disponibles](#-scripts-disponibles)

---

## ✨ Características Principales

* **Lienzo UML de Alto Rendimiento (@foblex/flow)**:
  * Creación y edición interactiva de clases, interfaces, enums y paquetes.
  * Gestión granular de miembros: visibilidades (`+`, `-`, `#`, `~`), tipos de datos de base de datos/Java, modificadores (`PK`, `AutoIncrement`, `Nullable`, `Unique`) y métodos con parámetros tipados.
  * Conexiones inteligentes con enrutamiento dinámico de conectores y visualización de multiplicidades ($1..1$, $0..*$, $1..*$) y nombres de relación mediante badges visibles.
  * Soporte para relaciones semánticas: Asociación, Agregación, Composición, Herencia/Generalización, Realización y Dependencia.
* **Colaboración Multiusuario en Tiempo Real**:
  * Sincronización instantánea mediante **Socket.io**.
  * Visualización de cursores remotos con identificación de usuario y color asignado.
  * Arrastre de nodos en vivo entre colaboradores.
  * Sistema de bloqueo exclusivo de nodos (`NodeLock`) para evitar conflictos de edición simultánea.
  * Chat integrado en vivo en cada sala de diagrama.
* **Copilot de Inteligencia Artificial Híbrido (Local & Multimodal)**:
  * Panel lateral flotante con historial conversacional reactivo.
  * Soporte de inferencia soberana local con **Ollama (`qwen2.5:3b`)** para mutaciones del AST sin salida de datos a internet, con respaldo cloud en **Google Gemini 2.5 Flash**.
  * Entrada visual mediante captura de cámara web (Webcam) o subida de imágenes para transformar bocetos en diagramas UML interactivos.
* **Interoperabilidad CASE (Enterprise Architect)**:
  * Exportación e importación de archivos estándar **XMI 2.1**.
  * Historial de versiones del diagrama con previsualización y restauración instantánea.
* **Explorador y Generador de Código Fullstack**:
  * Modal interactivo con árbol de archivos en tiempo real y resaltado de sintaxis.
  * **Spring Boot 3 (Java 21)** con JPA, Flyway, Docker Compose y PostgreSQL.
  * **Flutter Móvil (Clean Architecture / BLoC)** con **Asistente IA On-Device** integrado que descarga automáticamente el modelo **Qwen 2.5 GGUF** (`qwen2.5-0.5b-instruct-q4_k_m.gguf` desde Hugging Face) ejecutando inferencia 100% offline con `llama.cpp` en el dispositivo móvil, sin necesidad de apps externas.
  * Descarga directa del proyecto completo empaquetado en `.zip` o distribución en la nube mediante URLs prefirmadas de **Amazon S3**.
* **Guía Interactiva de Usuario & Chatbot Inteligente**:
  * **Sustituto del Manual Tradicional**: Asistente conversacional flotante disponible en toda la aplicación para orientar a nuevos usuarios en tiempo real.
  * **Tour Guiado en 7 Pasos**: Flujo paso a paso con controles de navegación (Anterior, Siguiente, Finalizar) cubriendo desde la creación de proyectos hasta el despliegue con Docker y Flutter.
  * **Chatbot con Búsqueda Semántica**: Respuestas instantáneas en lenguaje natural con renderizado enriquecido (Rich HTML), títulos estilizados, viñetas y alertas.
  * **Bloques de Código con Copia en 1 Clic**: Snippets de terminal para Docker, Gradle y Flutter con retroalimentación visual de copiado.
  * **Carrusel de Temas con Scroll y Flechas**: Selector horizontal con botones de desplazamiento suave, soporte de rueda de ratón (`mousewheel`) y barra de scroll estilizada (`topics-scrollbar`).
* **Gestión de Proyectos & Seguridad**:
  * Dashboard de proyectos con control de miembros y asignación de roles (`OWNER`, `EDITOR`, `VIEWER`).
  * Autenticación JWT persistente con interceptores HTTP reactivos y guardias de ruta.

---

## 🛠 Stack Tecnológico

* **Framework:** Angular 22+ (Standalone Components, Signals & Reactive Forms).
* **Motor de Diagramación:** `@foblex/flow` v19 + `@foblex/2d`.
* **Colaboración:** `socket.io-client`.
* **Estilos & Diseño:** Tailwind CSS v4 + Heroicons (`@ng-icons/heroicons`).
* **Formatos & Utilidades:** `fast-xml-parser` (XMI Parsing), `html-to-image` (Exportación PNG).
* **Pruebas:** Vitest.

---

## 🌐 Configuración de Conexión con Backend

Toda la configuración de conexión con el backend y websockets está **centralizada en un único lugar** mediante los entornos de Angular:

### 1. Modo Desarrollo (`DEV`)
Edita el archivo [`src/environments/environment.ts`](file:///mnt/datos/uagrm/8vo_semestre/sw1/parcial_1/frontend/src/environments/environment.ts):

```typescript
export const environment = {
  production: false,
  // Configura aquí el host/puerto del backend para desarrollo
  apiUrl: 'http://localhost:3000/api',
  socketUrl: 'http://localhost:3000/collaboration',
};
```

### 2. Modo Producción (`PROD`)
Edita el archivo [`src/environments/environment.prod.ts`](file:///mnt/datos/uagrm/8vo_semestre/sw1/parcial_1/frontend/src/environments/environment.prod.ts):

```typescript
export const environment = {
  production: true,
  // Configura aquí el host/puerto del backend para producción
  apiUrl: 'http://localhost:3000/api',
  socketUrl: 'http://localhost:3000/collaboration',
};
```

> **Nota:** Al ejecutar `ng build` (o `npm run build`), Angular CLI sustituye automáticamente `environment.ts` por `environment.prod.ts` mediante `fileReplacements` configurado en `angular.json`.

---

## 📂 Estructura del Proyecto

```text
frontend/
├── src/
│   ├── main.ts
│   ├── styles.css                    # Configuración de Tailwind CSS v4 y temas
│   ├── environments/                 # Configuración centralizada de backend
│   │   ├── environment.ts            # Entorno de desarrollo (DEV)
│   │   └── environment.prod.ts       # Entorno de producción (PROD)
│   └── app/
│       ├── app.config.ts             # Proveedores globales (Router, HttpClient con interceptores)
│       ├── app.routes.ts             # Rutas de la aplicación y guards de autenticación
│       ├── core/                     # Servicios singleton, componentes globales y lógica compartida
│       │   ├── components/           # Componentes globales reutilizables
│       │   │   ├── theme-toggle/     # Selector de tema (Claro / Oscuro)
│       │   │   └── user-guide-chatbot/ # 🤖 Guía interactiva & Manual de usuario con Chatbot
│       │   ├── guards/               # AuthGuard
│       │   ├── interceptors/         # jwtInterceptor
│       │   ├── models/               # Modelos TypeScript (diagram, project, user, auth)
│       │   └── services/             # Servicios HTTP, WebSocket y Guía
│       │       ├── auth.service.ts
│       │       ├── diagram.service.ts
│       │       ├── project.service.ts
│       │       ├── collaboration.service.ts
│       │       ├── ai-assistant.service.ts
│       │       ├── code-generator.service.ts
│       │       ├── user-guide.service.ts
│       │       └── xmi.service.ts
│       └── features/                 # Módulos de funcionalidad (UI)
│           ├── auth/                 # Login y Registro
│           ├── projects/             # Dashboard de proyectos y gestión de miembros
│           └── diagrams/             # Editor principal de diagramas
│               └── diagram-editor/
│                   ├── components/
│                   │   ├── ai-assistant-panel/
│                   │   ├── diagram-appbar/
│                   │   ├── diagram-toolbox/
│                   │   ├── spring-boot-modal/
│                   │   ├── user-profile-modal/
│                   │   ├── xmi-import-modal/
│                   │   └── xmi-versions-modal/
│                   └── diagram-editor.component.ts
├── angular.json
├── tsconfig.json
└── package.json
```

---

## 📋 Requisitos Previos

* **Node.js**: Versión `20.x` o `22.x`.
* **npm**: Versión `10.x` o superior.
* **Backend**: Backend API ejecutándose (por defecto en `http://localhost:3000`).

---

## 🚀 Instalación y Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar servidor de desarrollo:**
   ```bash
   npm start
   # o alternativamente:
   npx ng serve
   ```
   La aplicación se abrirá en `http://localhost:4200/`.

3. **Compilar para producción:**
   ```bash
   npm run build
   ```
   Los artefactos optimizados se generarán en el directorio `dist/frontend`.

---

## 🧩 Módulos y Componentes Clave

* **`UserGuideChatbotComponent`**: Manual de usuario interactivo global tipo chatbot con tour guiado en 7 etapas, búsqueda semántica en lenguaje natural, renderizado Markdown enriquecido, bloques con copia de comandos y carrusel de temas con scroll y flechas.
* **`DiagramEditorComponent`**: Lienzo principal con soporte de zoom, pan, selección múltiple, creación de nodos mediante doble clic o menú contextual, y conexión visual de relaciones UML.
* **`AiAssistantPanelComponent`**: Asistente inteligente lateral con integración de cámara web para captura en vivo y prompts en lenguaje natural.
* **`SpringBootModalComponent`**: Modal de generación de código fullstack con explorador de archivos y visor de código en tiempo real para Java/Spring Boot y Dart/Flutter.
* **`DiagramAppbarComponent`**: Barra de herramientas superior con opciones de guardado, historial de versiones XMI, exportación a imagen PNG, control de colaboradores, botón de Manual Interactivo y estado de conexión en vivo.

---

## 🛠 Scripts Disponibles

* `npm start`: Inicia el servidor de desarrollo local en el puerto 4200.
* `npm run build`: Compila la aplicación en modo producción en la carpeta `dist/`.
* `npm run watch`: Compila y escucha cambios continuos en modo desarrollo.
* `npm test`: Ejecuta la suite de pruebas unitarias con Vitest.
