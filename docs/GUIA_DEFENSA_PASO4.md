# Guía Rápida para el Paso 4: Defensa Oral y Modificaciones en Vivo

Instrucciones clave para responder exitosamente a las pruebas de autoría del docente.

---

## 1. Preguntas Teóricas Clave y Respuestas Precisas

### P1: "¿Cuál es el propósito fundamental de la Arquitectura de Software?"
> **Respuesta**: *"Lograr que el software viva el tiempo más largo posible. Su longevidad depende de la capacidad de absorber cambios con el menor costo, esfuerzo y tiempo, evitando el problema del dinosaurio en el pantano."*

### P2: "¿Por qué se requiere mapear el Diagrama de Clases a PostgreSQL y con qué reglas lo hicieron?"
> **Respuesta**: *"Porque el Diagrama de Clases es un modelo conceptual Orientado a Objetos (con herencia, polimorfismo y métodos) mientras que PostgreSQL es una base de datos Relacional basada en tablas y tuplas sin métodos. Aplicamos las reglas formales de transformación OMT/DMO de James Rumbaugh para mapear clases a tablas, atributos a columnas, relaciones 1:N a claves foráneas y relaciones N:M a tablas de unión intermedias con Spring Data JPA."*

### P3: "¿Por qué el asistente de voz no debe re-renderizar todo el diagrama?"
> **Respuesta**: *"Porque redibujar todo el grafo destruye la posición espacial que el usuario ya definió y sobrecarga el procesamiento gráfico del navegador en entornos colaborativos remotos. Nuestro motor aplica mutaciones atómicas incrementales al nodo o arista específica mediante un protocolo de parches."*

---

## 2. Comandos de Arranque Local para la Defensa (Sin Internet)

Si la conexión a internet en el aula se corta, levantar la infraestructura local en 10 segundos:

```bash
cd C:\Users\jkira\Desktop\case-studio-ai
docker compose -f infra/docker-compose.local.yml up -d
```
