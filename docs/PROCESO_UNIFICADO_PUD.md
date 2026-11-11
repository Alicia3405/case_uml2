# Registro Metodológico del Proceso Unificado (PUDS) — CASE Studio AI

**Universidad Autónoma Gabriel René Moreno (UAGRM)**  
**Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones (FICCT)**  
**Materia:** Sistemas de Información II / Ingeniería de Software I — Docente: Ing. David Morales  
**Estudiante:** César (julioficctcr7) — Cuenta AWS: `cesar` (`8865-9557-5652`)  
**Repositorio Oficial:** [https://github.com/julioficctcr7/case-studio-ai](https://github.com/julioficctcr7/case-studio-ai)  

---

## 1. Principios Fundamentales del PUDS (Jacobson, Booch, Rumbaugh)

El Proceso Unificado de Desarrollo de Software (PUDS) se implementa en estricto apego a sus tres axiomas canónicos:
1. **Dirigido por Casos de Uso**: Cada disciplina técnica (desde el análisis de robustez BCE hasta el reporte final de pruebas de aceptación) está rigurosamente trazada a partir de los 15 Casos de Uso del sistema.
2. **Centrado en la Arquitectura**: La separación de capas desacopladas (Presentación en Angular 22, Orquestación en NestJS, Persistencia relacional en PostgreSQL y microservicios generados en Spring Boot 3.4.x / Flutter BLoC) garantiza la máxima absorción del cambio y longevidad.
3. **Iterativo e Incremental**: El ciclo de vida se descompone en 3 Ciclos de Desarrollo progresivos que mitigan riesgos técnicos tempranamente.

---

## 2. Fases del Ciclo de Vida PUDS

| Fase | Objetivo Principal | Hito de Cierre | Estado |
| :--- | :--- | :--- | :---: |
| **1. Fase de Inicio (Inception)** | Definición de visión, actores, alcance y análisis de viabilidad técnica (I-CASE). | Hito de Objetivos del Ciclo de Vida (LCO) | ✅ Aprobado |
| **2. Fase de Elaboración (Elaboration)** | Diseño de la arquitectura base, mitigación de riesgos de concurrencia y validación del AST UML. | Hito de Arquitectura del Ciclo de Vida (LCA) | ✅ Aprobado |
| **3. Fase de Construcción (Construction)** | Desarrollo de los 15 CUs distribuidos en 3 Ciclos y generadores de código Spring Boot + Flutter. | Hito de Capacidad Operativa Inicial (IOC) | ✅ Aprobado |
| **4. Fase de Transición (Transition)** | Despliegue en AWS EC2 con Nginx SSL, pruebas de aceptación y entrega de documentación. | Hito de Lanzamiento del Producto (PR) | 🚀 En Curso |

---

## 3. Matriz Canónica de los 15 Casos de Uso (3 Ciclos de Desarrollo)

### CICLO #1: Gobernanza, Espacios de Trabajo y Modelador Core UML
- **CU01: Autenticación Stateless y Gestión de Cuentas**:
  - *Actor:* Usuario / Arquitecto.
  - *Descripción:* Autenticación mediante tokens JWT Bearer de ciclo volátil en `sessionStorage` con revocación defensiva en evento `beforeunload`.
- **CU02: Control de Roles (RBAC) y Gobernanza**:
  - *Actor:* Administrador Principal.
  - *Descripción:* Administración de privilegios y control de acceso granular sobre proyectos y auditorías.
- **CU03: Gestión de Espacios de Trabajo (Workspaces) y Plantillas**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Creación, clonación profunda (*Deep Copy*) y gestión de proyectos UML basados en plantillas de dominio.
- **CU04: Auditoría Forense Global y Trazabilidad (`diagram_history`)**:
  - *Actor:* Administrador / Auditor.
  - *Descripción:* Registro inmutable de cada mutación del diagrama con diff semántico antes/después y autoría en PostgreSQL JSONB.
- **CU05: Modelado Canónico de Clases y Relaciones UML 2.5+**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Modelado visual interactivo en lienzo @foblex/flow con clases, atributos tipados, operaciones y relaciones (asociación, agregación, composición, generalización).
- **CU06: Certificación Heurística de Normalización Relacional (1NF a 3NF)**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Motor de validación formal que certifica la atomicidad (1NF), dependencias funcionales completas (2NF) y eliminación de transitividades (3NF).
- **CU07: Agente Tutor Interactivo y Onboarding (*Co-Pilot CASE*)**:
  - *Actor:* Usuario / Aprendiz.
  - *Descripción:* Chatbot interactivo flotante en UI con sensor de heurísticas (*flaz, flaz*) que asiste al arquitecto en el aprendizaje de la herramienta.

### CICLO #2: Interoperabilidad CASE y Generación Automatizada (MDD)
- **CU08: Exportación Gráfica y Documental Multiformato (XMI/PNG/PDF/Excel)**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Generación de imágenes rasterizadas Ultra HD (BMP/PNG), memoria técnica ejecutiva en PDF y diccionario de datos en Excel.
- **CU09: Importación XMI 2.1 con Auto-Layout Jerárquico**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Deserialización e importación de modelos XMI 2.1 procedentes de Enterprise Architect y StarUML con ordenamiento automático.
- **CU10: Generación de Backend Spring Boot 3.4.x en 5 Capas + PostgreSQL DDL (ZIP)**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Compilación automatizada de microservicio Java 21 en 5 capas desacopladas (Controller, Service, Repository, Entity JPA, DTO) con Maven Wrapper (`./mvnw`).
- **CU11: Generación de Suite de Pruebas Postman v2.1 y Swagger OpenAPI**:
  - *Actor:* Desarrollador / Tester.
  - *Descripción:* Creación de colecciones Postman con aserciones automáticas para los 4 métodos CRUD y documentación interactiva Swagger.
- **CU12: Generación de Cliente Móvil Flutter con SLM Local On-Device**:
  - *Actor:* Arquitecto / Ingeniero Móvil.
  - *Descripción:* Generación de aplicación Flutter multiplataforma estructurada bajo BLoC con soporte 100% offline mediante SLM local (`lib_llama_cpp`).

### CICLO #3: Asistencia IA Multimodal y Sincronización Concurrente
- **CU13: Modelado Asistido por Dictado de Voz (PLN)**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Interpretación semántica de audio mediante Web Speech API aplicando mutación incremental atómica al AST sin re-renderizar el lienzo.
- **CU14: Digitalización Óptica de Diagramas por Visión Artificial**:
  - *Actor:* Arquitecto de Software.
  - *Descripción:* Captura de fotos o bocetos de pizarras mediante Webcam con algoritmo de fusión de AST que previene duplicados.
- **CU15: Sincronización Colaborativa Concurrente en Tiempo Real (`nodeLocks`)**:
  - *Actor:* Colaborador / Arquitecto.
  - *Descripción:* Edición multiusuario simultánea sobre WebSockets STOMP con exclusión mutua mediante candados holográficos.

---

## 4. Diseño Físico de Base de Datos y Tabla de Volumetría

El modelo relacional persistido en PostgreSQL comprende 14 tablas normalizadas:

| Entidad Lógica | Tabla Física | Tamaño Registro (Bytes) | Frecuencia Inicial | Crecimiento Anual | Volumen Proyectado (MB/año) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `UserProfile` | `user_profiles` | 512 B | 100 | +500/año | 0.25 MB |
| `DiagramProject` | `diagram_projects` | 1,024 B | 50 | +1,000/año | 1.02 MB |
| `ClassNode` | `class_nodes` | 2,048 B | 500 | +15,000/año | 30.72 MB |
| `Relationship` | `relationships` | 512 B | 750 | +20,000/año | 10.24 MB |
| `DiagramHistory` | `diagram_history` | 8,192 B | 1,000 | +50,000/año | 409.60 MB |
| `AuditLog` | `audit_logs` | 1,024 B | 2,000 | +100,000/año | 102.40 MB |
| `DomainTemplate` | `domain_templates` | 4,096 B | 20 | +10/año | 0.04 MB |
| `ProjectArtifact`| `project_artifacts`| 512 B | 100 | +2,000/año | 1.02 MB |
| `AiPromptLog` | `ai_prompt_logs` | 2,048 B | 500 | +30,000/año | 61.44 MB |
| `CollaborationSession` | `collaboration_sessions` | 256 B | 50 | +1,200/año | 0.31 MB |
| `CollaborationParticipant` | `collaboration_participants` | 128 B | 150 | +3,600/año | 0.46 MB |
| `ElementLock` | `element_locks` | 128 B | Volátil (RAM/BD) | Efímero | 0.05 MB |
| `CollaborationMessage` | `collaboration_messages` | 512 B | 2,000 | +100,000/año | 51.20 MB |
| `NormalizationCertification` | `normalization_certifications` | 4,096 B | 50 | +1,000/año | 4.10 MB |
| **TOTAL CONSOLIDADO** | | | | | **~672.85 MB / año** |
