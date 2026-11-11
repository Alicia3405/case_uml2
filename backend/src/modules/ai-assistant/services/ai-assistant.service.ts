import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAiService } from './vertex-ai.service';
import { OllamaAiService } from './ollama-ai.service';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';
import { AiPromptDto } from '../dtos/ai-prompt.dto';
import { AiVisionPromptDto } from '../dtos/ai-vision-prompt.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';

export interface UmlClassNode {
  id: string;
  name: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  isAnchor?: boolean;
  assocAnchorNodeId?: string;
  assocMainConnId?: string;
  attributes: { name: string; type: string }[];
  methods: { name: string; parameters: string; returnType: string }[];
}

export interface UmlConnection {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceId: string;
  targetId: string;
  type: string;
  lineStyle?: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  assocAnchorNodeId?: string;
}

const UML_SYSTEM_INSTRUCTION = `
Eres un Asistente Experto en Modelado UML 2.5 y Arquitectura de Software para una herramienta CASE interactiva.
Tu función es interpretar comandos de creación, modificación, eliminación y generación de diagramas de clases UML y emitir el Árbol de Sintaxis Abstracta (AST) en formato JSON.

REGLAS DE ORO / GUARDRAILS:
1. CRITERIO DE CLARIDAD vs ACLARACIÓN:
   - SI EL PROMPT CONTIENE ESPECIFICACIONES CONCRETAS (listas de tablas, atributos, tipos de datos, relaciones, multiplicidades, o comandos como "elimina tabla X", "cambia tipo de Y a Z en tabla W", "elimina todas las tablas", o un esquema con "1. Tablas y Atributos..."):
     DEBES RESPONDER OBLIGATORIAMENTE CON "isClarificationRequired": false Y APLICAR LA MUTACIÓN O GENERACIÓN COMPLETA.
   - ÚNICAMENTE debes responder "isClarificationRequired": true si el usuario solo envía un saludo vacío o una frase sin ninguna entidad ni acción técnica (ej: "hola qué tal" o "ayúdame con mi tarea").
   - SIEMPRE que respondas con "isClarificationRequired": true, incluye en "message" una guía amable explicando qué tablas o campos requiere indicar.

2. SOPORTE DE OPERACIONES CRUD COMPLETAS:
   - CREACIÓN: Generar nuevas clases con posiciones (x, y) en cuadrícula y atributos tipados.
   - ELIMINACIÓN DE TABLAS: Si el usuario pide eliminar una tabla (ej: "elimina la tabla Detalle de compra" o "borra Usuario"), NO incluyas dicha tabla en "nodes" y quita todas sus conexiones de "connections". PRESERVA todas las demás tablas y relaciones del diagrama.
     * RELACIONES MUCHOS A MUCHOS CON TABLA ASOCIATIVA INTERMEDIA: Si la tabla eliminada participa en una relación muchos a muchos con tabla asociativa intermedia (ej: TABLA A - AB - TABLA B, y el usuario pide "elimina la tabla A"): DEBES ELIMINAR también la tabla asociativa intermedia AB y su nodo ancla/conexiones vinculadas. La otra tabla (B) DEBE SEGUIR EXISTIENDO intacta en el diagrama, sin relaciones hacia A o AB.
   - ELIMINACIÓN TOTAL: Si el usuario pide eliminar todas las tablas o limpiar el diagrama (ej: "elimina todas las tablas", "borra todo el diagrama", "limpia el lienzo", "vacía el diagrama"), devuelve "nodes": [] y "connections": []. ÚNICAMENTE en este caso debes vaciar el diagrama.
   - ELIMINACIÓN DE ATRIBUTOS:
     * Si el usuario pide eliminar todos los atributos de una tabla (ej: "elimina los atributos de la tabla Cliente", "elimina todos los atributos de la tabla <<X>>", "borra los atributos de Usuario"):
       DEBES MANTENER la tabla en "nodes" con su lista de atributos vacía: "attributes": [].
       NUNCA elimines la tabla ni vacíes el diagrama en este caso.
       PRESERVA todas las demás tablas y relaciones del diagrama intactas.
     * Si el usuario pide quitar un atributo específico de una tabla (ej: "elimina el atributo email de Usuario"):
       DEBES MANTENER la tabla en "nodes" con todos sus demás atributos excepto el eliminado.
       PRESERVA todas las demás tablas y relaciones del diagrama.
   - ELIMINACIÓN DE MÉTODOS:
     * Si el usuario pide eliminar métodos o todos los métodos de una tabla, mantén la tabla con sus métodos actualizados o "methods": [].
   - MODIFICACIÓN DE ATRIBUTOS: Si pide renombrar un atributo o cambiar su tipo (ej: de Double a BigDecimal), actualízalo en la clase correspondiente manteniendo la clase.
   - GENERACIÓN INTEGRAL DE ESQUEMAS: Si el usuario envía un esquema completo con tablas y relaciones, genéralo íntegro con todas sus clases y multiplicidades.

3. REGLA ESTRICTA DE MÉTODOS Y GETTERS/SETTERS (IMPORTANTE):
   - NO GENERES getters, setters ni métodos inventados (como getId, setNombre, etc.) a menos que el usuario los solicite explícitamente en su mensaje.
   - Si el usuario solo pide clases y atributos, "methods" DEBE SER OBLIGATORIAMENTE UN ARRAY VACÍO: "methods": [].
   - Solo genera métodos si el usuario pide funciones o métodos específicos (ej: "agrega método login(pass: String): Boolean").

4. TOLERANCIA Y MATCHING FLEXIBLE DE NOMBRES:
   - Interpreta variaciones en lenguaje natural: "Detalles de compra" / "Detalle de compras" / "DetalleCompra" / "detalle_compra" refieren a la misma entidad.
   - Adapta tipos comunes: "int" -> "Integer", "DateTime" -> "LocalDateTime", "text" -> "Text", "bool" -> "Boolean".

5. REGLA ESTRICTA DE RELACIONES MUCHOS A MUCHOS (M:N) Y TABLAS INTERMEDIAS:
   - TODA relación de muchos a muchos (* a *, 0..* a 0..*, 1..* a *, etc.) entre dos clases (ej: A y B) DEBE RESOLVERSE OBLIGATORIAMENTE MEDIANTE UNA TABLA INTERMEDIA (Clase de Asociación):
     * NUNCA dejes una relación directa muchos a muchos sin su tabla asociativa intermedia.
     * Siempre que exista o se cree una relación muchos a muchos, debes generar la estructura completa de 4 partes:
       a) Conexión principal entre A y B: "type": "association", "sourceMultiplicity": "*", "targetMultiplicity": "*", "name": "A_B", y "assocAnchorNodeId": "anchor_A_B".
       b) Nodo ancla virtual: "id": "anchor_A_B", "name": "", "isAnchor": true, "position": punto medio entre A y B, "width": 0, "height": 0, "attributes": [], "methods": [].
       c) Tabla intermedia (ej: "A_B"): "assocMainConnId": ID de la conexión principal. DEBE CONTENER ÚNICAMENTE los 2 atributos de clave foránea que referencian a las tablas relacionadas (ej: "aId": "UUID", "bId": "UUID" según las entidades). NUNCA generes un atributo "id" artificial, NUNCA inventes "fechaRegistro", ni agregues atributos adicionales como "quantity" o "cantidad" a menos que estén explícitamente en el diagrama o los pida el usuario. Posicionada debajo del nodo ancla (y = ancla.y + 120, x = ancla.x - 110).
       d) Conexión de enlace («link»): "type": "association_class", "name": "«link»", "lineStyle": "straight", "sourceNodeId": "anchor_A_B", "targetNodeId": ID de la tabla intermedia.

6. PROHIBICIÓN ESTRICTA DE INVENTAR ENTIDADES O RELACIONES NO SOLICITADAS:
   - NUNCA inventes tablas adicionales que el usuario no haya pedido explícitamente.
   - Si el usuario pide crear una tabla concreta, TU DEBER ES CREAR ÚNICAMENTE ESA TABLA.
   - PRESERVA todas las demás tablas y relaciones existentes del diagrama exactamente como están.
   - Solo genera relaciones y tablas intermedias cuando el usuario pida explícitamente relacionar o conectar entidades.

TIPOS DE DATOS VÁLIDOS (Backend & SQL):
- Atributos: UUID, String, Integer, Long, Boolean, Double, Float, BigDecimal, LocalDate, LocalDateTime, Date, Text, byte[]
- Métodos (Retorno): void, UUID, String, Integer, Long, Boolean, Double, BigDecimal, LocalDate, LocalDateTime, List<Object>, Object

TIPOS DE RELACIONES UML:
- association, generalization, realization, composition, aggregation, dependency, association_class

FORMATO DE SALIDA ESTRICTO (JSON):
Debes responder ÚNICAMENTE con un bloque JSON sin texto markdown adicional:
{
  "isClarificationRequired": false,
  "action": "diagram_mutated",
  "message": "Descripción concisa de las operaciones realizadas",
  "changesSummary": "Resumen de las mutaciones aplicadas",
  "nodes": [
    {
      "id": "node_1",
      "name": "NombreClase",
      "position": { "x": 100, "y": 80 },
      "width": 220,
      "attributes": [{ "name": "id", "type": "UUID" }],
      "methods": []
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "sourceNodeId": "node_1",
      "targetNodeId": "node_2",
      "sourceId": "node_1_right",
      "targetId": "node_2_left",
      "type": "association",
      "lineStyle": "segment",
      "name": "relacion",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "0..*"
    }
  ]
}
`;

export interface AiModelOption {
  id: string;
  name: string;
  provider: 'ollama' | 'vertex';
  isLocal: boolean;
  parameterSize?: string;
  sizeMb?: number;
  description?: string;
}

export interface AvailableAiModelsResponse {
  defaultModel: string;
  defaultProvider: 'ollama' | 'vertex';
  isOllamaAvailable: boolean;
  models: AiModelOption[];
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly vertexAiService: VertexAiService,
    private readonly ollamaAiService: OllamaAiService,
    private readonly collaborationGateway: CollaborationGateway,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Obtiene la lista de modelos de IA disponibles (Ollama local y Vertex AI en la nube).
   */
  async getAvailableModels(): Promise<AvailableAiModelsResponse> {
    const isOllamaAvail = await this.ollamaAiService.isAvailable();
    const configuredProvider = (this.configService.get<string>('AI_PROVIDER') || 'vertex').toLowerCase() as 'ollama' | 'vertex';
    const configuredGeminiModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
    const configuredOllamaModel = this.ollamaAiService.getModelName();

    const models: AiModelOption[] = [];

    // Siempre disponible como opción recomendada y por defecto: Google Cloud Gemini (Vision, Cámara, Pizarra, Texto)
    models.push({
      id: configuredGeminiModel,
      name: `Google Gemini (${configuredGeminiModel})`,
      provider: 'vertex',
      isLocal: false,
      parameterSize: 'Cloud Multimodal',
      description: 'Google AI Cloud Oficial (Ultra rápido, soporte completo Visión, Cámara, Pizarra y Texto)',
    });

    if (isOllamaAvail) {
      const ollamaModels = await this.ollamaAiService.listDetailedModels();
      for (const m of ollamaModels) {
        const paramSize = m.details?.parameter_size || '';
        const sizeMb = m.size ? Math.round(m.size / (1024 * 1024)) : undefined;
        let displayName = m.name;
        if (m.name.includes('qwen2.5-coder')) {
          displayName = `Qwen 2.5 Coder (${paramSize || '7B'})`;
        } else if (m.name.includes('qwen2.5')) {
          displayName = `Qwen 2.5 (${paramSize || '3B'})`;
        } else if (m.name.includes('gemma')) {
          displayName = `Gemma 2 (${paramSize || '2B'})`;
        } else if (m.name.includes('deepseek')) {
          displayName = `DeepSeek (${paramSize || '7B'})`;
        } else if (m.name.includes('llama')) {
          displayName = `Llama (${paramSize || '8B'})`;
        } else if (m.name.includes('mistral')) {
          displayName = `Mistral (${paramSize || '7B'})`;
        } else if (m.name.includes('phi')) {
          displayName = `Phi (${paramSize || '3.8B'})`;
        }

        models.push({
          id: m.name,
          name: displayName,
          provider: 'ollama',
          isLocal: true,
          parameterSize: paramSize || 'Local',
          sizeMb,
          description: `Modelo local en Ollama (${m.details?.quantization_level || 'GGUF'})`,
        });
      }
    }

    let defaultModel = configuredGeminiModel;
    let defaultProvider: 'ollama' | 'vertex' = 'vertex';

    if (configuredProvider === 'ollama' && isOllamaAvail && models.some((m) => m.provider === 'ollama')) {
      const matchConfigured = models.find((m) => m.id === configuredOllamaModel);
      defaultModel = matchConfigured ? matchConfigured.id : models.find((m) => m.provider === 'ollama')!.id;
      defaultProvider = 'ollama';
    }

    return {
      defaultModel,
      defaultProvider,
      isOllamaAvailable: isOllamaAvail,
      models,
    };
  }

  /**
   * Ejecuta el prompt con el proveedor configurado (Ollama local o Google Vertex AI).
   * Si Ollama está seleccionado pero no responde, realiza fallback automático a Vertex AI.
   */
  private async generateWithPreferredProvider(options: {
    systemInstruction: string;
    contents: string;
    responseMimeType?: string;
    formatJson?: boolean;
    provider?: 'ollama' | 'vertex';
    model?: string;
  }): Promise<{ responseText: string; providerUsed: 'ollama' | 'vertex'; modelUsed: string }> {
    const defaultProvider = (this.configService.get<string>('AI_PROVIDER') || 'vertex').toLowerCase() as 'ollama' | 'vertex';
    const requestedProvider = options.provider || defaultProvider;

    if (requestedProvider === 'ollama') {
      try {
        const isAvail = await this.ollamaAiService.isAvailable();
        if (isAvail) {
          const targetModel = options.model || this.ollamaAiService.getModelName();
          this.logger.log(`[AiAssistant] Ejecutando prompt con IA Local Ollama (${targetModel})`);
          const text = await this.ollamaAiService.generateContent({
            model: targetModel,
            systemInstruction: options.systemInstruction,
            contents: options.contents,
            responseMimeType: options.responseMimeType,
            formatJson: options.formatJson ?? true,
          });
          return {
            responseText: text,
            providerUsed: 'ollama',
            modelUsed: targetModel,
          };
        }
        this.logger.warn(
          `[AiAssistant] Ollama no está disponible en ${this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434'}. Fallback a Google Vertex AI...`,
        );
      } catch (err: any) {
        this.logger.warn(`[AiAssistant] Error en inferencia local Ollama (${err.message || err}). Fallback a Google Vertex AI...`);
      }
    }

    this.logger.log('[AiAssistant] Ejecutando prompt con Google Cloud Vertex AI (Gemini)');
    const text = await this.vertexAiService.generateContent({
      systemInstruction: options.systemInstruction,
      contents: options.contents,
      responseMimeType: options.responseMimeType,
    });
    return {
      responseText: text,
      providerUsed: 'vertex',
      modelUsed: this.configService.get<string>('GEMINI_MODEL') || 'gemini-3-flash-preview',
    };
  }

  // Normalizador de texto palabra por palabra para matching difuso
  normalizeForFuzzy(text: string): string {
    if (!text) return '';

    // Separar CamelCase (ej: "DetalleCompra" -> "Detalle Compra")
    const spacedCamel = text.replace(/([a-z])([A-Z])/g, '$1 $2');

    const stopwords = new Set([
      'de', 'la', 'el', 'los', 'las', 'del', 'un', 'una', 'unos', 'unas',
      'tabla', 'tablas', 'clase', 'clases', 'entidad', 'entidades', 'nodo', 'nodos'
    ]);

    const words = spacedCamel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/);

    const stemmedWords = words
      .filter(w => w.length > 0 && !stopwords.has(w))
      .map(w => {
        if (/[aeiou]s$/i.test(w) && w.length > 3) return w.slice(0, -1);
        if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
        return w;
      });

    return stemmedWords.join('');
  }

  // Buscar un nodo por nombre exacto o aproximado
  findNodeFuzzy(nodes: UmlClassNode[], query: string): UmlClassNode | undefined {
    if (!query) return undefined;
    const cleanQuery = this.normalizeForFuzzy(query);
    if (!cleanQuery) return undefined;

    // 1. Coincidencia por ID
    const byId = nodes.find(n => n.id.toLowerCase() === query.toLowerCase().trim());
    if (byId) return byId;

    // 2. Coincidencia exacta normalizada
    const byNormalized = nodes.find(n => this.normalizeForFuzzy(n.name) === cleanQuery);
    if (byNormalized) return byNormalized;

    // 3. Coincidencia por prefijo/raíz SOLO si la diferencia de longitud es mínima (<= 2 caracteres, ej: género o inflexión)
    // NUNCA coincidir si es una tabla compuesta o intermedia (ej: "Usuario_Products" NO es "Usuario")
    return nodes.find(n => {
      const nodeNorm = this.normalizeForFuzzy(n.name);
      if (nodeNorm.length < 3 || cleanQuery.length < 3) return false;
      const lenDiff = Math.abs(nodeNorm.length - cleanQuery.length);
      return lenDiff <= 2 && (nodeNorm.startsWith(cleanQuery) || cleanQuery.startsWith(nodeNorm));
    });
  }

  async processTextPrompt(dto: AiPromptDto): Promise<AiResponseDto> {
    const currentNodes: UmlClassNode[] = dto.currentNodes || [];
    const currentConnections: UmlConnection[] = dto.currentConnections || [];
    const prompt = dto.prompt.trim();

    // 0. DETECCIÓN DE LIMPIEZA TOTAL / ELIMINAR TODAS LAS TABLAS
    const isAttributeOrMethodOperation = /(?:atributos?|m[eé]todos?|campos?|propiedad(?:es)?)\b/i.test(prompt);
    const isDeleteAllPrompt = !isAttributeOrMethodOperation && (
      /(?:elimina(?:r)?|borra(?:r)?)\s+(?:todas?\s+las?\s+(?:tablas|clases|entidades|nodos)|todo\s+el\s+diagrama|todo\s*$)/i.test(prompt) ||
      /(?:limpia(?:r)?|vac[ií]a(?:r)?)\s+(?:el\s+diagrama|el\s+lienzo|todo\s*$)/i.test(prompt) ||
      /^(?:delete\s+all(?:\s+tables)?|clear\s+diagram)$/i.test(prompt.trim())
    );

    if (isDeleteAllPrompt) {
      this.broadcastAiMutation(
        dto.diagramId,
        dto.roomCode,
        [],
        [],
        'Todas las tablas y relaciones han sido eliminadas del diagrama',
      );

      return {
        success: true,
        action: 'diagram_mutated',
        message: 'Todas las tablas y relaciones han sido eliminadas del diagrama.',
        nodes: [],
        connections: [],
        changesSummary: 'Limpieza total del diagrama.',
      };
    }

    // 1. Identificar nodos objetivo existentes para adquirir bloqueo de exclusión mutua
    const targetNodesToLock: UmlClassNode[] = [];
    for (const node of currentNodes) {
      if (node && node.name) {
        const normName = this.normalizeForFuzzy(node.name);
        const normPrompt = this.normalizeForFuzzy(prompt);
        if (normName.length >= 3 && (normPrompt.includes(normName) || this.findNodeFuzzy([node], prompt))) {
          targetNodesToLock.push(node);
        }
      }
    }

    // 2. Adquirir exclusión mutua en tiempo real para colaboradores
    for (const node of targetNodesToLock) {
      this.collaborationGateway.lockNodeForAi(dto.diagramId, dto.roomCode, node.id);
    }

    // PROCESAMIENTO UNIFICADO MEDIANTE VERTEX AI GEMINI 2.5 FLASH
    const historyBlock = dto.sessionHistory && dto.sessionHistory.length > 0
      ? `\nHISTORIAL DE ACTIVIDAD RECIENTE EN ESTA SESIÓN:\n${JSON.stringify(dto.sessionHistory.slice(-12).map((h: any) => `[${h.timestamp || 'reciente'}] ${h.actor || 'Usuario'}: ${h.title} - ${h.description}`), null, 2)}\n`
      : '';

    const userContent = `
ESTADO ACTUAL DEL DIAGRAMA:
NODOS ACTUALES (${currentNodes.length}):
${JSON.stringify(currentNodes.map(n => ({ id: n.id, name: n.name, attributes: n.attributes, methods: n.methods })), null, 2)}

CONEXIONES ACTUALES (${currentConnections.length}):
${JSON.stringify(currentConnections.map(c => ({ id: c.id, sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId, type: c.type, sourceMultiplicity: c.sourceMultiplicity, targetMultiplicity: c.targetMultiplicity })), null, 2)}
${historyBlock}
INSTRUCCIÓN DEL USUARIO:
"${prompt}"

REGLAS OBLIGATORIAS AL GENERAR LA RESPUESTA:
1. Si el usuario pide crear una tabla nueva, agrégala a las existentes.
2. Si el usuario pide modificar una tabla o sus atributos/métodos, actualiza solo lo indicado manteniendo la tabla en el diagrama.
3. Si el usuario pide eliminar atributos de una tabla (ej: "elimina los atributos de la tabla X", "elimina todos los atributos de la tabla <<X>>", "borra el atributo email de Usuario"):
   - DEBES MANTENER la tabla X en "nodes" con "attributes": [] (o con los atributos restantes si era uno específico).
   - NUNCA elimines la tabla X ni vacíes el diagrama completo.
   - PRESERVA todas las demás tablas y relaciones del diagrama.
4. Si el usuario pide eliminar una tabla completa (ej: "elimina la tabla X"), EXCLÚYELA de la lista de "nodes" y remueve todas sus conexiones en "connections". Si dicha tabla participaba en una relación muchos a muchos con tabla intermedia (ej: A - AB - B y se elimina A), EXCLUYE también la tabla intermedia AB y sus conexiones, preservando la otra tabla (B). PRESERVA todas las demás tablas que no se pidió eliminar.
5. ÚNICAMENTE devuelve "nodes": [] y "connections": [] si el usuario pide explícitamente limpiar o vaciar TODO el diagrama (ej: "elimina todo el diagrama", "elimina todas las tablas", "limpia el lienzo").
6. RELACIONES MUCHOS A MUCHOS (M:N): Toda relación muchos a muchos (* a *, 0..* a 0..*, 1..* a *) directa DEBE resolverse generando su tabla asociativa intermedia (ej: A_B). La tabla intermedia DEBE CONTENER ÚNICAMENTE los 2 atributos de clave foránea (ej: aId: UUID, bId: UUID) que actúan como su clave primaria compuesta. NUNCA generes un atributo "id" artificial ni inventes atributos adicionales (como fechaRegistro, quantity o cantidad). Incluye su nodo ancla virtual ("isAnchor": true, "width": 0, "height": 0) y su conector «link» tipo association_class.
7. PROHIBICIÓN ESTRICTA DE INVENTAR ENTIDADES O RELACIONES: Si el usuario pide agregar o modificar una tabla concreta (ej: "agrega una tabla factura") SIN pedir relaciones, CREA ÚNICAMENTE esa tabla solicitada. NO agregues conexiones hacia tablas existentes ni inventes tablas intermedias no solicitadas. PRESERVA todas las tablas existentes en el diagrama.
8. Devuelve SIEMPRE el diagrama COMPLETO resultante (todos los nodos y conexiones que deben quedar en el diagrama).`;

    try {
      const { responseText, providerUsed, modelUsed } = await this.generateWithPreferredProvider({
        systemInstruction: UML_SYSTEM_INSTRUCTION,
        contents: userContent,
        responseMimeType: 'application/json',
        formatJson: true,
        provider: dto.provider,
        model: dto.model,
      });

      const parsed = this.cleanAndParseJson(responseText);

      // Solo omitir aclaración si el usuario dio especificaciones técnicas concretas (atributos tipados, etc.)
      const hasStructuralSpecs =
        /(?:uuid|string|integer|long|double|float|boolean|bigdecimal|localdate|localdatetime|date|text|byte\[\]|\:|\-\>)/i.test(prompt) ||
        /(?:con\s+(?:atributos?|campos?|columnas?|id|nombre|name|email))/i.test(prompt);

      if (parsed.isClarificationRequired && !hasStructuralSpecs) {
        const clarificationMsg =
          parsed.message ||
          parsed.reason ||
          parsed.explanation ||
          parsed.details ||
          'Por favor especifica el nombre de la tabla o los atributos que deseas agregar (ej: "Agrega tabla Factura con id, total y fecha").';

        return {
          success: false,
          action: 'clarification_required',
          message: clarificationMsg,
          nodes: currentNodes,
          connections: currentConnections,
          changesSummary: 'Aclaración requerida.',
          providerUsed,
          modelUsed,
        };
      }

      // Fusión inteligente: Vertex AI devuelve el estado completo del diagrama
      const merged = this.mergeNodesAndConnections(
        currentNodes,
        currentConnections,
        parsed.nodes || [],
        parsed.connections || [],
        prompt,
      );

      // Resolución automática de relaciones muchos a muchos hacia tablas intermedias
      const resolved = this.resolveManyToManyRelationships(merged.nodes, merged.connections);

      const finalNodes = this.sanitizeNodes(resolved.nodes);
      const finalConnections = this.sanitizeConnections(resolved.connections, finalNodes);

      this.broadcastAiMutation(
        dto.diagramId,
        dto.roomCode,
        finalNodes,
        finalConnections,
        parsed.changesSummary || 'Mutación estructural aplicada al diagrama',
      );

      return {
        success: true,
        action: 'diagram_mutated',
        message: parsed.message || parsed.changesSummary || 'Diagrama actualizado por Copilot IA.',
        nodes: finalNodes,
        connections: finalConnections,
        changesSummary: parsed.changesSummary || 'Mutación aplicada al diagrama UML.',
        providerUsed,
        modelUsed,
      };
    } catch (err: any) {
      this.logger.error(`Error procesando prompt de texto IA: ${err.message || err}`);
      return this.handleFallbackPrompt(dto, currentNodes, currentConnections);
    } finally {
      // 3. Liberar exclusión mutua garantizada para todos los nodos bloqueados
      for (const node of targetNodesToLock) {
        this.collaborationGateway.unlockNodeForAi(dto.diagramId, dto.roomCode, node.id);
      }
    }
  }

  async processVisionDiagram(dto: AiVisionPromptDto): Promise<AiResponseDto> {
    const currentNodes: UmlClassNode[] = dto.currentNodes || [];
    const currentConnections: UmlConnection[] = dto.currentConnections || [];

    // Limpiar Base64 y extraer el mimeType si venía como data URI
    let mimeType = dto.mimeType || 'image/png';
    const mimeMatch = (dto.imageBase64 || '').match(/^data:([^;]+);base64,/);
    if (mimeMatch && mimeMatch[1]) {
      mimeType = mimeMatch[1];
    }

    const cleanBase64 = (dto.imageBase64 || '')
      .replace(/^data:[^;]+;base64,/, '')
      .trim()
      .replace(/\s+/g, '');

    const visionSystemInstruction = `
${UML_SYSTEM_INSTRUCTION}

INSTRUCCIÓN ADICIONAL PARA VISIÓN COMPUTACIONAL (IMÁGENES):
Analiza minuciosamente la imagen adjunta del diagrama de clases UML (puede ser un dibujo en pizarra, captura de pantalla o boceto).

REGLA DE EXHAUSTIVIDAD TOTAL Y COMPLETITUD DEL DIAGRAMA:
1. DEBES EXTRAER EL 100% DE TODAS LAS TABLAS/CLASES PRESENTES EN LA IMAGEN SIN EXCEPCIÓN (recorre minuciosamente toda la imagen: izquierda, centro, derecha, arriba y abajo).
2. Si la imagen contiene múltiples tablas (ej: Customer, Order, Delivery, Products, Categories), TODAS ellas deben figurar obligatoriamente en "nodes", junto con todas sus conexiones y multiplicidades originales (ej: Customer a Order, Delivery a Order, Categories a Products).
3. NUNCA filtres, recortes ni omitas tablas o relaciones visibles en la imagen, aunque el usuario pregunte o pida enfocarse en una relación específica (como M:N o tabla asociativa).
4. RESOLUCIÓN DE RELACIONES MUCHOS A MUCHOS (M:N): Si detectas una relación muchos a muchos (* a *, 0..* a 0..*, etc.) directa entre dos clases de la imagen (ej: Order y Products), genera la tabla asociativa intermedia (ej: OrderProduct) con su nodo ancla virtual ("isAnchor": true, "width": 0, "height": 0) y conector «link» tipo association_class.
REGLA ESTRICTA DE ATRIBUTOS PARA LA TABLA ASOCIATIVA INTERMEDIA:
- La tabla asociativa intermedia DEBE CONTENER ÚNICAMENTE los 2 atributos de ID foráneos que actúan como su clave primaria compuesta (ej: orderId: UUID, productId: UUID).
- NUNCA generes un atributo "id" artificial.
- NUNCA inventes atributos adicionales que no existan en la imagen (como quantity, cantidad, fechaRegistro, etc.).
- MANTÉN INTACTAS TODAS LAS DEMÁS TABLAS Y RELACIONES DEL DIAGRAMA.
5. Asigna posiciones (x, y) ordenadas y separadas en una cuadrícula clara.
`;

    try {
      const userPromptInstruction = dto.prompt
        ? `Instrucción o requerimiento específico del usuario a aplicar sobre el diagrama: "${dto.prompt}". Aplica esta indicación preservando la totalidad de las clases y conexiones del diagrama visual.`
        : 'Extrae todo el esquema con fidelidad visual completa.';

      const promptText = `TAREA PRINCIPAL: Digitalización visual COMPLETA y EXHAUSTIVA del diagrama UML de la imagen adjunta.
1. DEBES digitalizar y extraer absolutamente el 100% de las clases/tablas visibles en la imagen sin omitir ninguna entidad (revisa metódicamente de izquierda a derecha y de arriba a abajo toda la imagen).
2. ${userPromptInstruction}`;

      const contents = [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ];

      let responseText = '';
      try {
        responseText = await this.vertexAiService.generateContent({
          systemInstruction: visionSystemInstruction,
          contents,
          responseMimeType: 'application/json',
        });
      } catch (vertexErr: any) {
        this.logger.error(`[Vision] Error en digitalización con Gemini: ${vertexErr?.message || vertexErr}`);
        throw new Error(`No se pudo digitalizar la imagen con Gemini: ${vertexErr?.message || vertexErr}. Por favor intenta nuevamente.`);
      }

      const parsed = this.cleanAndParseJson(responseText);

      // Resolución automática de relaciones muchos a muchos hacia tablas intermedias
      const resolved = this.resolveManyToManyRelationships(parsed.nodes || [], parsed.connections || []);

      let finalNodes = resolved.nodes;
      let finalConnections = resolved.connections;

      const isAdditive = /(?:agrega|anade|añade|suma|complementa|integra|fusiona|combina)\b/i.test(dto.prompt || '');
      if (currentNodes.length > 0 && isAdditive) {
        const merged = this.mergeNodesAndConnections(
          currentNodes,
          currentConnections,
          finalNodes,
          finalConnections,
          dto.prompt || '',
        );
        finalNodes = merged.nodes;
        finalConnections = merged.connections;
      }

      const updatedNodes = this.sanitizeNodes(finalNodes);
      const updatedConnections = this.sanitizeConnections(finalConnections, updatedNodes);

      this.broadcastAiMutation(
        dto.diagramId,
        dto.roomCode,
        updatedNodes,
        updatedConnections,
        `Digitalización visual de diagrama completada (${updatedNodes.length} clases detectadas)`,
      );

      return {
        success: true,
        action: 'vision_extract',
        message: parsed.message || `Se digitalizaron ${updatedNodes.length} clases y ${updatedConnections.length} relaciones desde la imagen.`,
        nodes: updatedNodes,
        connections: updatedConnections,
        changesSummary: `Digitalización visual completada: ${updatedNodes.length} clases y ${updatedConnections.length} relaciones extraídas.`,
        providerUsed: 'vertex',
        modelUsed: this.configService.get<string>('GEMINI_MODEL') || 'gemini-3-flash-preview',
      };
    } catch (err: any) {
      this.logger.error(`Error procesando visión de diagrama IA: ${err.message || err}`);
      return {
        success: false,
        action: 'error',
        message: `No se pudo digitalizar la imagen con Vertex AI Vision: ${err.message || 'Error de procesamiento'}. Por favor intenta con una imagen más nítida o en formato PNG/JPEG.`,
        nodes: currentNodes,
        connections: currentConnections,
        changesSummary: 'Fallo al procesar imagen con Gemini Vision.',
        providerUsed: 'vertex',
        modelUsed: this.configService.get<string>('GEMINI_MODEL') || 'gemini-3-flash-preview',
      };
    }
  }

  private mergeNodesAndConnections(
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
    aiNodes: UmlClassNode[],
    aiConnections: UmlConnection[],
    prompt: string,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    const isFullGeneration = prompt.includes('1. Tablas y Atributos') && currentNodes.length === 0;
    const isAttributeOrMethodPrompt = /(?:atributos?|m[eé]todos?|campos?|propiedad(?:es)?)\b/i.test(prompt);
    const isDeletePrompt = !isAttributeOrMethodPrompt && /(?:elimina|eliminar|borra|borrar|quita|quitar|delete|remove|destruye|destruir|suprime|suprimir)\b/i.test(prompt);

    const asksForRelations = /(?:relaci[oó]n|conecta|asocia|cardinalidad|multiplicidad|muchos|uno\s+a|pertenece|tiene|vincula|\*|\-\-)/i.test(prompt);

    // Detectar si el usuario solicitó específicamente agregar una tabla concreta sin relaciones
    const singleTableAddMatch = prompt.match(
      /(?:crea(?:r)?|agrega(?:r)?|a[ñn]ade(?:r)?|inserta(?:r)?)\s+(?:una\s+|la\s+)?(?:nueva\s+)?(?:tabla|clase|entidad)\s*(?:(?:llamada|denominada|de|para)\s+)?([a-zA-Z0-9_]+)/i,
    );
    const requestedTableName = singleTableAddMatch ? this.normalizeForFuzzy(singleTableAddMatch[1]) : null;

    const mergedNodesMap = new Map<string, UmlClassNode>();

    if (isFullGeneration && aiNodes.length > 0) {
      // Reemplazo completo de esquema inicial
      for (const node of aiNodes) {
        const id = node.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        mergedNodesMap.set(id, { ...node, id });
      }
    } else if (isDeletePrompt && aiNodes.length === 0) {
      // Si fue eliminación y el resultado quedó vacío
      return { nodes: [], connections: [] };
    } else if (isDeletePrompt && aiNodes.length > 0) {
      // Si el prompt fue de eliminación de tablas y Vertex AI devolvió las tablas restantes:
      // Conservamos las posiciones y datos de las tablas existentes que Vertex AI mantuvo
      for (const aiNode of aiNodes) {
        if (!aiNode || !aiNode.name) continue;
        const existingNode = this.findNodeFuzzy(currentNodes, aiNode.name);

        if (existingNode) {
          mergedNodesMap.set(existingNode.id, {
            ...existingNode,
            name: aiNode.name || existingNode.name,
            attributes: Array.isArray(aiNode.attributes) ? aiNode.attributes : existingNode.attributes,
            methods: Array.isArray(aiNode.methods) ? aiNode.methods : existingNode.methods,
          });
        } else {
          const newId = aiNode.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          mergedNodesMap.set(newId, {
            ...aiNode,
            id: newId,
            position: aiNode.position || { x: 120, y: 80 },
            width: aiNode.width || 220,
            attributes: aiNode.attributes || [],
            methods: aiNode.methods || [],
          });
        }
      }
    } else {
      // Fusión normal (adición / modificación / eliminación de atributos): preservar todos los nodos actuales
      for (const node of currentNodes) {
        mergedNodesMap.set(node.id, { ...node });
      }

      let maxPosX = currentNodes.reduce((max, n) => Math.max(max, n.position.x + (n.width || 220)), 50);
      let maxPosY = 80;

      for (const aiNode of aiNodes) {
        if (!aiNode || !aiNode.name) continue;
        const existingNode = this.findNodeFuzzy(Array.from(mergedNodesMap.values()), aiNode.name);

        if (existingNode) {
          mergedNodesMap.set(existingNode.id, {
            ...existingNode,
            name: aiNode.name || existingNode.name,
            attributes: Array.isArray(aiNode.attributes) ? aiNode.attributes : existingNode.attributes,
            methods: Array.isArray(aiNode.methods) ? aiNode.methods : existingNode.methods,
          });
        } else {
          // Si el usuario solo pidió agregar UNA tabla específica y NO pidió relaciones:
          if (requestedTableName && !asksForRelations) {
            // Contar cuántos nodos nuevos ha generado el LLM en total que no existían
            const newAiNodes = aiNodes.filter(
              (n) => !currentNodes.some((cn) => cn.id === n.id || this.normalizeForFuzzy(cn.name) === this.normalizeForFuzzy(n.name)),
            );
            // Si el LLM generó una sola tabla nueva, ¡es la tabla solicitada por el usuario!
            // Solo filtramos si generó múltiples tablas para evitar stubs/tablas intermedias alucinadas (ej: Usuario_Products)
            if (newAiNodes.length > 1) {
              const aiNodeNorm = this.normalizeForFuzzy(aiNode.name);
              const requestedNorm = requestedTableName;
              const isExactMatch = aiNodeNorm === requestedNorm;
              const isCompound = aiNode.name.includes('_') || (aiNodeNorm.length >= (requestedNorm?.length || 0) + 4);
              const matchesRequested = isExactMatch || (!isCompound && !!this.findNodeFuzzy([aiNode], singleTableAddMatch![1]));
              if (!matchesRequested) {
                this.logger.warn(`[AiAssistant] Descartando tabla no solicitada / alucinada por LLM: ${aiNode.name}`);
                continue;
              }
            }
          }

          const newId = aiNode.id && !aiNode.id.startsWith('node_xxx') ? aiNode.id : `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          let posX = aiNode.position?.x;
          let posY = aiNode.position?.y;

          if (posX === undefined || posX < 50) {
            posX = maxPosX + 60;
            posY = maxPosY;
            maxPosX = posX + 240;
          }

          const newNode: UmlClassNode = {
            id: newId,
            name: aiNode.name,
            position: { x: posX, y: posY },
            width: aiNode.width || 220,
            attributes: aiNode.attributes || [],
            methods: aiNode.methods || [],
          };

          mergedNodesMap.set(newId, newNode);
        }
      }
    }

    // Salvaguarda determinista: Si el usuario solicitó explícitamente eliminar todos los atributos de una tabla específica
    const deleteAllAttrsMatch = prompt.match(
      /(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos\s+los\s+|los\s+)?atributos\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?([A-Za-z0-9_<>«»]+)/i,
    );
    if (deleteAllAttrsMatch && deleteAllAttrsMatch[1]) {
      const rawTarget = deleteAllAttrsMatch[1].replace(/[<>«»]/g, '').trim();
      const targetNode = this.findNodeFuzzy(Array.from(mergedNodesMap.values()), rawTarget);
      if (targetNode) {
        const existing = mergedNodesMap.get(targetNode.id);
        if (existing) {
          mergedNodesMap.set(targetNode.id, {
            ...existing,
            attributes: [],
          });
        }
      }
    }

    // Salvaguarda determinista: Si el usuario solicitó explícitamente eliminar todos los métodos de una tabla específica
    const deleteAllMethodsMatch = prompt.match(
      /(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos\s+los\s+|los\s+)?m[eé]todos\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?([A-Za-z0-9_<>«»]+)/i,
    );
    if (deleteAllMethodsMatch && deleteAllMethodsMatch[1]) {
      const rawTarget = deleteAllMethodsMatch[1].replace(/[<>«»]/g, '').trim();
      const targetNode = this.findNodeFuzzy(Array.from(mergedNodesMap.values()), rawTarget);
      if (targetNode) {
        const existing = mergedNodesMap.get(targetNode.id);
        if (existing) {
          mergedNodesMap.set(targetNode.id, {
            ...existing,
            methods: [],
          });
        }
      }
    }

    // Limpieza en cascada para clases de asociación / tablas intermedias:
    // Si una tabla participante en una relación muchos a muchos fue eliminada de mergedNodesMap,
    // se debe eliminar en cascada la tabla asociativa intermedia (AB), su nodo ancla y sus conexiones.
    const remainingNodeIds = new Set(mergedNodesMap.keys());
    const nodesToRemoveInCascade = new Set<string>();

    for (const conn of currentConnections) {
      const sId = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
      const tId = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');

      const sourceMissing = !remainingNodeIds.has(sId);
      const targetMissing = !remainingNodeIds.has(tId);

      if (sourceMissing || targetMissing) {
        if (conn.assocAnchorNodeId) {
          nodesToRemoveInCascade.add(conn.assocAnchorNodeId);
        }
        for (const [nodeId, node] of mergedNodesMap.entries()) {
          if (node.assocMainConnId === conn.id) {
            nodesToRemoveInCascade.add(nodeId);
          }
        }
      }
    }

    // Limpiar nodos ancla huérfanos
    for (const [nodeId, node] of mergedNodesMap.entries()) {
      if (node.isAnchor) {
        const hasActiveConn = currentConnections.some((c) => {
          const sId = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
          const tId = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
          return (c.assocAnchorNodeId === nodeId || sId === nodeId || tId === nodeId) &&
                 remainingNodeIds.has(sId) && remainingNodeIds.has(tId);
        });
        if (!hasActiveConn) {
          nodesToRemoveInCascade.add(nodeId);
        }
      }
    }

    for (const idToRemove of nodesToRemoveInCascade) {
      mergedNodesMap.delete(idToRemove);
    }

    const mergedNodes = Array.from(mergedNodesMap.values());

    // Fusión de conexiones
    const mergedConnsMap = new Map<string, UmlConnection>();
    const mergedNodeIds = new Set(mergedNodes.map(n => n.id));

    if (!isFullGeneration) {
      for (const conn of currentConnections) {
        const sId = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const tId = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');
        if (mergedNodeIds.has(sId) && mergedNodeIds.has(tId)) {
          mergedConnsMap.set(conn.id, { ...conn, sourceNodeId: sId, targetNodeId: tId });
        }
      }
    }

    const resolveNode = (idOrName?: string): UmlClassNode | undefined => {
      if (!idOrName) return undefined;
      const clean = idOrName.replace(/_(top|bottom|left|right)$/, '').trim();
      return mergedNodes.find(n => n.id === clean) || this.findNodeFuzzy(mergedNodes, clean);
    };

    for (const aiConn of aiConnections) {
      const sourceNode = resolveNode(aiConn.sourceNodeId || aiConn.sourceId);
      const targetNode = resolveNode(aiConn.targetNodeId || aiConn.targetId);

      if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
        // Salvaguarda: Si el usuario NO solicitó relaciones y solo pidió agregar una tabla,
        // no aceptar conexiones nuevas que vinculen tablas recién agregadas con las existentes
        if (requestedTableName && !asksForRelations) {
          const isSourceExisting = currentNodes.some((n) => n.id === sourceNode.id);
          const isTargetExisting = currentNodes.some((n) => n.id === targetNode.id);
          if (!isSourceExisting || !isTargetExisting) {
            this.logger.warn(
              `[AiAssistant] Descartando conexión no solicitada / alucinada entre ${sourceNode.name} y ${targetNode.name}`,
            );
            continue;
          }
        }

        const connId = aiConn.id && !aiConn.id.startsWith('conn_xxx') ? aiConn.id : `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        
        mergedConnsMap.set(connId, {
          id: connId,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceId: `${sourceNode.id}_right`,
          targetId: `${targetNode.id}_left`,
          type: aiConn.type || 'association',
          lineStyle: aiConn.lineStyle || 'segment',
          name: aiConn.name,
          sourceMultiplicity: aiConn.sourceMultiplicity || '',
          targetMultiplicity: aiConn.targetMultiplicity || '',
        });
      }
    }

    return {
      nodes: mergedNodes,
      connections: Array.from(mergedConnsMap.values()),
    };
  }

  private broadcastAiMutation(
    diagramId: string,
    roomCode: string | undefined,
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    summary: string,
  ): void {
    try {
      if (!this.collaborationGateway?.server) return;

      const payload = {
        nodes,
        connections,
        userId: 'ai_copilot_vertex',
        userName: '✨ Copilot IA (Vertex AI)',
        action: 'ai_mutation',
      };

      const chatPayload = {
        userId: 'ai_copilot_vertex',
        userName: '✨ Copilot IA (Vertex AI)',
        message: `🤖 ${summary}`,
        timestamp: new Date().toISOString(),
      };

      // Emitir solo a una sala para no duplicar eventos
      if (diagramId) {
        this.collaborationGateway.server.to(`diagram_${diagramId}`).emit('diagram_synced', payload);
        this.collaborationGateway.server.to(`diagram_${diagramId}`).emit('chat_message_received', chatPayload);
      } else if (roomCode) {
        this.collaborationGateway.server.to(roomCode).emit('diagram_synced', payload);
        this.collaborationGateway.server.to(roomCode).emit('chat_message_received', chatPayload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir broadcast WebSocket de IA: ${e}`);
    }
  }

  // Genera o vincula automáticamente la tabla asociativa intermedia para cualquier relación M:N
  public resolveManyToManyRelationships(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
  ): { nodes: UmlClassNode[]; connections: UmlConnection[]; resolvedCount: number } {
    const nodeMap = new Map<string, UmlClassNode>(nodes.map((n) => [n.id, { ...n }]));
    const connMap = new Map<string, UmlConnection>(connections.map((c) => [c.id, { ...c }]));
    let resolvedCount = 0;

    const isMany = (mult?: string): boolean => {
      if (!mult) return false;
      const clean = mult.trim().toLowerCase();
      return clean.includes('*') || clean.includes('n') || clean.includes('m') || clean === 'many';
    };

    const cleanStr = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const getStems = (name: string): string[] => {
      const c = cleanStr(name);
      if (!c) return [];
      const stems = new Set<string>([c]);
      if (c.endsWith('es') && c.length > 3) stems.add(c.slice(0, -2));
      if (c.endsWith('s') && c.length > 2) stems.add(c.slice(0, -1));
      return Array.from(stems);
    };

    const matchesStem = (targetText: string, stem: string): boolean => {
      if (!stem || !targetText) return false;
      if (stem.length >= 3) return targetText.includes(stem);
      const tokens = targetText.split(/[^a-z0-9]+/);
      return tokens.includes(stem) || targetText.startsWith(stem) || targetText.endsWith(stem);
    };

    for (const conn of Array.from(connMap.values())) {
      const sId = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const tId = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');

      if (!sId || !tId || sId === tId) continue;
      if (conn.type === 'association_class') continue;

      const sourceNode = nodeMap.get(sId);
      const targetNode = nodeMap.get(tId);

      if (!sourceNode || !targetNode) continue;
      if (sourceNode.isAnchor || targetNode.isAnchor) continue;

      const isMn = isMany(conn.sourceMultiplicity) && isMany(conn.targetMultiplicity);
      if (!isMn) continue;

      const sStems = getStems(sourceNode.name);
      const tStems = getStems(targetNode.name);

      // Buscar posibles tablas intermedias existentes para esta relación
      const candidates: { node: UmlClassNode; score: number }[] = [];

      for (const n of nodeMap.values()) {
        if (n.id === sourceNode.id || n.id === targetNode.id || n.isAnchor) continue;

        let score = 0;

        // 1. Vinculación directa mediante assocMainConnId
        if (n.assocMainConnId === conn.id) {
          score += 100;
        }

        // 2. Conectado al ancla de la conexión vía association_class
        if (conn.assocAnchorNodeId) {
          const isLinkedToAnchor = Array.from(connMap.values()).some(
            (c) =>
              c.type === 'association_class' &&
              ((c.sourceNodeId === conn.assocAnchorNodeId && (c.targetNodeId === n.id || c.targetId?.startsWith(n.id))) ||
                (c.targetNodeId === conn.assocAnchorNodeId && (c.sourceNodeId === n.id || c.sourceId?.startsWith(n.id)))),
          );
          if (isLinkedToAnchor) score += 90;
        }

        // 3. Conexión tipo association_class que apunta a este nodo
        const hasAssocClassLink = Array.from(connMap.values()).some(
          (c) =>
            c.type === 'association_class' &&
            ((c.targetNodeId === n.id || c.targetId?.startsWith(n.id)) ||
              (c.sourceNodeId === n.id || c.sourceId?.startsWith(n.id))),
        );
        if (hasAssocClassLink) score += 30;

        // 4. Nombre compuesto que incluye raíces de source y target
        const nClean = cleanStr(n.name);
        const hasSourceStem = sStems.some((s) => matchesStem(nClean, s));
        const hasTargetStem = tStems.some((t) => matchesStem(nClean, t));
        if (hasSourceStem && hasTargetStem) {
          score += 70;
        }

        // 5. Nombre del nodo coincide con conn.name
        if (conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')) {
          const connNameClean = cleanStr(conn.name);
          if (nClean === connNameClean && nClean.length >= 3) {
            score += 40;
          }
        }

        // 6. Conectado a ambas entidades fuente y destino
        const connectedToSource = Array.from(connMap.values()).some(
          (c) =>
            c.type !== 'association_class' &&
            ((c.sourceNodeId === sourceNode.id && c.targetNodeId === n.id) ||
              (c.targetNodeId === sourceNode.id && c.sourceNodeId === n.id)),
        );
        const connectedToTarget = Array.from(connMap.values()).some(
          (c) =>
            c.type !== 'association_class' &&
            ((c.sourceNodeId === targetNode.id && c.targetNodeId === n.id) ||
              (c.targetNodeId === targetNode.id && c.sourceNodeId === n.id)),
        );
        if (connectedToSource && connectedToTarget) {
          score += 50;
        }

        // 7. Atributos referencian llaves foráneas de ambas tablas
        if (n.attributes && n.attributes.length > 0) {
          const attrNames = n.attributes.map((a) => cleanStr(a.name));
          const hasSourceAttr = attrNames.some((a) => sStems.some((s) => matchesStem(a, s)));
          const hasTargetAttr = attrNames.some((a) => tStems.some((t) => matchesStem(a, t)));
          if (hasSourceAttr && hasTargetAttr) {
            score += 45;
          }
        }

        // Un nodo solo es candidato legítimo a tabla asociativa si está explícitamente vinculado
        // o si su nombre/estructura combina inequívocamente ambas entidades (source y target)
        const isLegitCandidate =
          n.assocMainConnId === conn.id ||
          (hasSourceStem && hasTargetStem) ||
          score >= 90;

        if (isLegitCandidate && score >= 40) {
          candidates.push({ node: n, score });
        }
      }

      // Ordenar: mayor score primero, luego mayor cantidad de atributos (favorecer entidad de dominio sobre stub generado)
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.node.attributes?.length || 0) - (a.node.attributes?.length || 0);
      });

      let assocNode: UmlClassNode;

      if (candidates.length > 0) {
        // Seleccionar el mejor candidato como tabla asociativa
        assocNode = candidates[0].node;
        const alreadyWired =
          assocNode.assocMainConnId === conn.id &&
          conn.assocAnchorNodeId &&
          nodeMap.has(conn.assocAnchorNodeId);

        if (!alreadyWired) {
          resolvedCount++;
        }

        assocNode.assocMainConnId = conn.id;
        nodeMap.set(assocNode.id, assocNode);

        // Si existen candidatos duplicados/redundantes (ej. un stub autogenerado además de la tabla real), podarlos
        if (candidates.length > 1) {
          for (let i = 1; i < candidates.length; i++) {
            const redundant = candidates[i].node;
            // NUNCA podar tablas o entidades de dominio normales: solo podar stubs o duplicados autogenerados de esta misma relación
            const isRedundantStubOfThisRelation =
              redundant.assocMainConnId === conn.id ||
              redundant.id.includes('_assoc') ||
              redundant.id.includes('_stub');

            if (!isRedundantStubOfThisRelation) {
              continue;
            }

            const isConnectedToThirdParty = Array.from(connMap.values()).some(
              (c) =>
                (c.sourceNodeId === redundant.id || c.targetNodeId === redundant.id) &&
                c.sourceNodeId !== sourceNode.id &&
                c.targetNodeId !== sourceNode.id &&
                c.sourceNodeId !== targetNode.id &&
                c.targetNodeId !== targetNode.id &&
                c.sourceNodeId !== conn.assocAnchorNodeId &&
                c.targetNodeId !== conn.assocAnchorNodeId,
            );

            if (!isConnectedToThirdParty) {
              nodeMap.delete(redundant.id);
              for (const c of Array.from(connMap.values())) {
                if (
                  c.sourceNodeId === redundant.id ||
                  c.targetNodeId === redundant.id ||
                  c.sourceId?.startsWith(redundant.id) ||
                  c.targetId?.startsWith(redundant.id)
                ) {
                  connMap.delete(c.id);
                }
              }
            }
          }
        }
      } else {
        // No existe tabla intermedia previa: sintetizarla
        resolvedCount++;
        const timestamp = Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
        const assocNodeId = `node_${timestamp}_assoc`;
        const assocName =
          conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')
            ? conn.name
            : `${sourceNode.name}_${targetNode.name}`;

        const anchorPosX = Math.round((sourceNode.position.x + targetNode.position.x) / 2);
        const anchorPosY = Math.round((sourceNode.position.y + targetNode.position.y) / 2);

        let assocPosX = Math.max(50, anchorPosX - 110);
        let assocPosY = Math.max(50, anchorPosY + 120);

        const isOccupied = Array.from(nodeMap.values()).some(
          (n) =>
            n.id !== assocNodeId &&
            !n.isAnchor &&
            Math.abs(n.position.x - assocPosX) < 180 &&
            Math.abs(n.position.y - assocPosY) < 120,
        );
        if (isOccupied) {
          assocPosY += 140;
        }

        assocNode = {
          id: assocNodeId,
          name: assocName,
          position: { x: assocPosX, y: assocPosY },
          width: 220,
          attributes: [],
          methods: [],
          assocMainConnId: conn.id,
        };
        nodeMap.set(assocNodeId, assocNode);
      }

      // Sanitizar atributos de la tabla asociativa intermedia:
      // Debe contener ÚNICAMENTE los 2 IDs foráneos correspondientes a sourceNode y targetNode que actúan como clave primaria compuesta.
      // NO debe tener atributo 'id' artificial, ni atributos inventados como 'quantity', 'cantidad', 'fechaRegistro', etc.
      const getEntityFk = (
        node: UmlClassNode,
        existingAttrs: { name: string; type: string }[] = [],
      ): { name: string; type: string } => {
        const nodeStems = getStems(node.name);

        const existingFk = existingAttrs.find((a) => {
          const aClean = cleanStr(a.name);
          if (aClean === 'id') return false;
          return nodeStems.some((stem) => matchesStem(aClean, stem));
        });

        if (existingFk) {
          return { name: existingFk.name, type: existingFk.type || 'UUID' };
        }

        const pkAttr = (node.attributes || []).find((a) =>
          /^(id|.*_id|.*id)$/i.test(a.name.trim()),
        ) || (node.attributes || [])[0];

        const pkType = pkAttr?.type || 'UUID';

        let base = node.name.trim();
        if (base.toLowerCase().endsWith('es') && base.length > 3) {
          base = base.slice(0, -2);
        } else if (base.toLowerCase().endsWith('s') && base.length > 2 && !base.toLowerCase().endsWith('ss')) {
          base = base.slice(0, -1);
        }
        const camelBase = base.charAt(0).toLowerCase() + base.slice(1);
        return { name: `${camelBase}Id`, type: pkType };
      };

      const sourceFk = getEntityFk(sourceNode, assocNode.attributes);
      const targetFk = getEntityFk(targetNode, assocNode.attributes);

      if (sourceFk.name.toLowerCase() === targetFk.name.toLowerCase()) {
        sourceFk.name = `${cleanStr(sourceNode.name)}Id`;
        targetFk.name = `${cleanStr(targetNode.name)}Id`;
      }

      assocNode.attributes = [sourceFk, targetFk];
      assocNode.methods = [];
      nodeMap.set(assocNode.id, assocNode);

      // Asegurar nodo ancla virtual
      let anchorNode: UmlClassNode | undefined;
      if (conn.assocAnchorNodeId && nodeMap.has(conn.assocAnchorNodeId)) {
        anchorNode = nodeMap.get(conn.assocAnchorNodeId);
      }

      if (!anchorNode) {
        // Buscar si hay un ancla ya conectada con assocNode mediante association_class
        for (const c of connMap.values()) {
          if (c.type === 'association_class') {
            const maybeAnchorId =
              c.sourceNodeId === assocNode.id || c.sourceId?.startsWith(assocNode.id)
                ? c.targetNodeId
                : c.sourceNodeId;
            if (maybeAnchorId && nodeMap.has(maybeAnchorId) && nodeMap.get(maybeAnchorId)?.isAnchor) {
              anchorNode = nodeMap.get(maybeAnchorId);
              break;
            }
          }
        }
      }

      if (!anchorNode) {
        const timestamp = Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
        const anchorId = `anchor_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
        const anchorPosX = Math.round((sourceNode.position.x + targetNode.position.x) / 2);
        const anchorPosY = Math.round((sourceNode.position.y + targetNode.position.y) / 2);

        anchorNode = {
          id: anchorId,
          name: '',
          position: { x: anchorPosX, y: anchorPosY },
          width: 0,
          height: 0,
          isAnchor: true,
          attributes: [],
          methods: [],
        };
        nodeMap.set(anchorId, anchorNode);
      }

      // Actualizar la conexión principal con el ancla y multiplicidades
      const updatedMainConn: UmlConnection = {
        ...conn,
        sourceNodeId: sId,
        targetNodeId: tId,
        assocAnchorNodeId: anchorNode.id,
        name: conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_') ? conn.name : assocNode.name,
        sourceMultiplicity: '*',
        targetMultiplicity: '*',
      };
      connMap.set(conn.id, updatedMainConn);

      // Asegurar conexión discontinua («link») entre el ancla y la tabla asociativa
      let linkConn = Array.from(connMap.values()).find(
        (c) =>
          c.type === 'association_class' &&
          ((c.sourceNodeId === anchorNode!.id && (c.targetNodeId === assocNode.id || c.targetId?.startsWith(assocNode.id))) ||
            (c.targetNodeId === anchorNode!.id && (c.sourceNodeId === assocNode.id || c.sourceId?.startsWith(assocNode.id)))),
      );

      if (linkConn) {
        linkConn.sourceNodeId = anchorNode.id;
        linkConn.targetNodeId = assocNode.id;
        linkConn.sourceId = anchorNode.id;
        linkConn.targetId = `${assocNode.id}_top`;
        linkConn.type = 'association_class';
        linkConn.lineStyle = 'straight';
        linkConn.name = '«link»';
        connMap.set(linkConn.id, linkConn);
      } else {
        const timestamp = Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
        const dashedConnId = `conn_${timestamp}_assoc_dashed`;
        linkConn = {
          id: dashedConnId,
          sourceNodeId: anchorNode.id,
          targetNodeId: assocNode.id,
          sourceId: anchorNode.id,
          targetId: `${assocNode.id}_top`,
          type: 'association_class',
          lineStyle: 'straight',
          name: '«link»',
        };
        connMap.set(dashedConnId, linkConn);
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      connections: Array.from(connMap.values()),
      resolvedCount,
    };
  }

  private cleanAndParseJson(text: string): any {
    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    return JSON.parse(clean);
  }

  private sanitizeNodes(nodes: any[]): UmlClassNode[] {
    const validTypes = [
      'UUID', 'String', 'Integer', 'Long', 'Boolean', 'Double', 'Float',
      'BigDecimal', 'LocalDate', 'LocalDateTime', 'Date', 'Text', 'byte[]',
    ];

    const normalizeType = (raw: string): string => {
      if (!raw) return 'String';
      const clean = raw.trim().toLowerCase();
      if (clean === 'int') return 'Integer';
      if (clean === 'datetime') return 'LocalDateTime';
      if (clean === 'bool') return 'Boolean';
      if (clean === 'number') return 'Double';
      return validTypes.find(t => t.toLowerCase() === clean) || 'String';
    };

    return nodes.map((node, index) => {
      // Deduplicar atributos por nombre
      const seenAttrs = new Set<string>();
      const dedupedAttributes: { name: string; type: string }[] = [];
      for (const attr of node.attributes || []) {
        const name = (attr.name || 'attr').trim();
        const lower = name.toLowerCase();
        if (!seenAttrs.has(lower)) {
          seenAttrs.add(lower);
          dedupedAttributes.push({
            name,
            type: normalizeType(attr.type),
          });
        }
      }

      // Deduplicar métodos por nombre + parámetros
      const seenMethods = new Set<string>();
      const dedupedMethods: { name: string; parameters: string; returnType: string }[] = [];
      for (const m of node.methods || []) {
        const key = `${(m.name || 'operation').trim()}(${(m.parameters || '').trim()})`.toLowerCase();
        if (!seenMethods.has(key)) {
          seenMethods.add(key);
          dedupedMethods.push({
            name: m.name || 'operation',
            parameters: m.parameters || '',
            returnType: m.returnType || 'void',
          });
        }
      }

      const safeId = (node.id && typeof node.id === 'string' && node.id.trim() !== '')
        ? node.id.trim()
        : `node_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;

      const posX = typeof node.position?.x === 'number' ? node.position.x : 120 + (index * 260) % 780;
      const posY = typeof node.position?.y === 'number' ? node.position.y : 80 + Math.floor((index * 260) / 780) * 220;

      return {
        id: safeId,
        name: node.isAnchor ? (node.name || '') : (node.name || `Class${index + 1}`),
        position: { x: posX, y: posY },
        width: node.isAnchor ? 0 : (node.width || node.position?.width || 220),
        height: node.height || undefined,
        isAnchor: node.isAnchor || false,
        assocAnchorNodeId: node.assocAnchorNodeId || undefined,
        assocMainConnId: node.assocMainConnId || undefined,
        attributes: dedupedAttributes,
        methods: dedupedMethods,
      };
    });
  }

  private sanitizeConnections(connections: any[], nodes: UmlClassNode[]): UmlConnection[] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return connections
      .map((conn, index) => {
        const sourceId = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
        const targetId = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');

        return {
          id: conn.id || `conn_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceId: conn.sourceId || `${sourceId}_right`,
          targetId: conn.targetId || `${targetId}_left`,
          type: conn.type || 'association',
          lineStyle: conn.lineStyle || 'segment',
          name: conn.name || conn.label || undefined,
          sourceMultiplicity: conn.sourceMultiplicity || conn.sourceCardinality || '',
          targetMultiplicity: conn.targetMultiplicity || conn.targetCardinality || '',
          assocAnchorNodeId: conn.assocAnchorNodeId || undefined,
        };
      })
      .filter(conn => nodeMap.has(conn.sourceNodeId || '') && nodeMap.has(conn.targetNodeId || ''));
  }

  private handleFallbackPrompt(
    dto: AiPromptDto,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): AiResponseDto {
    return {
      success: false,
      action: 'clarification_required',
      message: 'No fue posible procesar la mutación del diagrama con el motor de IA. Por favor verifica los datos ingresados.',
      nodes: currentNodes,
      connections: currentConnections,
      changesSummary: 'Operación no aplicada.',
    };
  }
}
