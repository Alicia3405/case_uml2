# Arquitectura del Sistema — CASE Studio AI

Documento formal de arquitectura de software, patrones de diseño, decisiones técnicas y flujos de secuencia.

---

## 1. Diagrama General de Arquitectura

```mermaid
graph TD
    subgraph Clientes
        Web[Web CASE Studio - Angular 21 / React TS]
        Mobile[Mobile Flutter - Voice-First & Offline]
        EA[Enterprise Architect 16+]
    end

    subgraph ReverseProxy[Nginx + SSL Certbot]
        Nginx[Nginx Reverse Proxy]
    end

    subgraph ServidorProduccion[AWS EC2 / Cloud VM]
        Backend[CASE Engine - Spring Boot 3 / Java 21]
        WS[WebSocket Engine - Exclusión Mutua]
        OMT[Motor OMT/DMO de Rumbaugh]
        CodeGen[Generador Spring Boot 5 Capas]
        Ollama[Ollama Local AI]
        DB[(PostgreSQL 16 Alpine)]
    end

    subgraph SalidaGenerada[Artefactos Generados]
        GeneratedBackend[Spring Boot Backend ZIP - 5 Capas + JPA]
        XMIExport[Archivo XMI 2.1 / 2.5]
    end

    Web <-->|HTTPS / WSS| Nginx
    Mobile <-->|HTTPS / WSS| Nginx
    EA <-->|XMI File Exchange| Web
    Nginx -->|:8080 REST & WS| Backend
    Backend --> WS
    Backend --> OMT
    OMT --> CodeGen
    CodeGen --> GeneratedBackend
    Backend --> DB
    Backend --> Ollama
    Web --> XMIExport
```

---

## 2. Flujo de Sincronización Colaborativa y Exclusión Mutua

El canvas colaborativo implementa exclusión mutua basada en tokens de bloqueo temporal para garantizar que dos diseñadores no editen los atributos o relaciones de la misma clase simultáneamente:

```mermaid
sequenceDiagram
    autonumber
    actor DevA as Diseñador A (Santa Cruz)
    participant WS as WebSocket Hub (Servidor)
    actor DevB as Diseñador B (La Paz)

    DevA->>WS: LOCK_NODE { nodeId: "cls-paciente", user: "DevA" }
    alt Nodo Disponible
        WS-->>DevA: LOCK_GRANTED { nodeId: "cls-paciente", expires: 15s }
        WS-->>DevB: NODE_LOCKED_BROADCAST { nodeId: "cls-paciente", lockedBy: "DevA" }
        Note over DevB: La clase aparece sombreada con candado visual y no es editable
    else Nodo ya bloqueado
        WS-->>DevA: LOCK_DENIED { nodeId: "cls-paciente", lockedBy: "DevB" }
    end

    DevA->>WS: PATCH_GRAPH { action: "ADD_ATTRIBUTE", nodeId: "cls-paciente", attr: "seguroSocial: String" }
    WS-->>DevB: GRAPH_MUTATION_APPLIED { action: "ADD_ATTRIBUTE", nodeId: "cls-paciente", attr: "seguroSocial: String" }
    Note over DevB: Atributo aparece incrementalmente sin re-renderizar todo el canvas

    DevA->>WS: UNLOCK_NODE { nodeId: "cls-paciente" }
    WS-->>DevB: NODE_UNLOCKED_BROADCAST { nodeId: "cls-paciente" }
```

---

## 3. Flujo de Generación de Backend (Reglas OMT/DMO de Rumbaugh)

```mermaid
sequenceDiagram
    autonumber
    actor User as Diseñador de Software
    participant Web as Web CASE Studio
    participant Engine as Motor OMT / CodeGen
    participant Generator as Ensamblador Spring Boot 3
    participant ZIP as Empaquetador ZIP

    User->>Web: Clic en "Generar Backend Spring Boot"
    Web->>Engine: POST /api/codegen/generate (Grafo UML JSON)
    Engine->>Engine: Aplicar Reglas OMT/DMO de James Rumbaugh
    Note over Engine: Clases a @Entity JPA, 1:N a @OneToMany/@ManyToOne, N:M a @ManyToMany + JoinTable
    Engine->>Generator: Ensamblar 5 Capas (Model, Repo, Service, Controller, DTOs)
    Generator->>Generator: Inyectar OpenAPI Swagger UI + application.yml (Postgres)
    Generator->>ZIP: Comprimir estructura de proyecto Maven
    ZIP-->>Web: Retornar spring-boot-backend.zip
    Web-->>User: Descarga automática lista para ejecutar (mvn spring-boot:run)
```

---

## 4. Decisiones Arquitectónicas (Trade-Offs)

| Decisión | Alternativa Evaluada | Justificación |
|---|---|---|
| **Spring Boot 3 (Java 21) en Backend Generado** | Node.js / Express, Django | Exigencia obligatoria del docente. Spring Data JPA y Hibernate proveen la abstracción ORM ideal para mapear reglas OMT/DMO a PostgreSQL automáticamente (`ddl-auto: update`). |
| **Monorepo Unificado** | Repositorios separados | Permite atomicidad en commits, facilidad de despliegue con un único `docker-compose.yml`, sincronización entre cliente Web, Backend y Móvil. |
| **Exclusión Mutua con Heartbeat** | Pessimistic Locking estricto en DB | Los WebSockets con leases de 15 segundos y heartbeats garantizan latencia inferior a 50ms y auto-recuperación si un usuario pierde la conexión. |
| **Parches de Grafo Incrementales** | Re-renderizado total con SVG/Canvas | Evita el consumo desmedido de CPU/GPU en navegadores web remotos exigido expresamente por el docente en la clase 1. |
| **Flutter con Arquitectura Offline-First** | React Native, PWA | Flutter compila a código nativo en ARM, ofrece acceso a motores locales de inferencia (IA on-device) y almacenamiento SQLite local con sincronización transaccional al conectarse con el backend. |
