import { Injectable, Logger, Inject, Optional, forwardRef, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAiService } from './vertex-ai.service';
import { OllamaAiService, OllamaConnectionTestResult, OllamaRuntimeConfig } from './ollama-ai.service';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';
import { YjsSyncService } from '../../projects/services/yjs-sync.service';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { AiPromptDto, AiPromptMode } from '../dtos/ai-prompt.dto';
import { AiVisionPromptDto } from '../dtos/ai-vision-prompt.dto';
import {
  AiResponseDto,
  AiResolvedIntentMode,
  AiSuggestionItem,
  DisciplineAlertItem,
} from '../dtos/ai-response.dto';
import { TestOllamaConnectionDto, UpdateOllamaConfigDto } from '../dtos/ollama-config.dto';
import { isValidUuid } from '../../../common/utils/mongoose-entity.util';

export interface UmlAttributeNode {
  name: string;
  type: string;
  visibility?: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

export interface UmlMethodNode {
  name: string;
  parameters: string;
  returnType: string;
  visibility?: string;
}

export interface UmlClassNode {
  id: string;
  name: string;
  elementType?: string;
  stereotype?: string | null;
  noteContent?: string | null;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  isAnchor?: boolean;
  assocAnchorNodeId?: string;
  assocMainConnId?: string;
  createdByName?: string | null;
  lastModifiedByName?: string | null;
  attributes: UmlAttributeNode[];
  methods: UmlMethodNode[];
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

const COLLAB_PARTNER_SYSTEM_INSTRUCTION = `
Eres Copilot IA, UN DESARROLLADOR MÁS Y ARQUITECTO SENIOR integrado en una sala colaborativa UML/OMT donde varios desarrolladores trabajan juntos sobre el mismo diagrama de clases y chat grupal.

REGLAS DE ORO COMO COMPAÑERO DE EQUIPO:
1. NO MODIFIQUES EL DIAGRAMA POR TU CUENTA EN ESTE MODO: Tu rol ahora es asesorar, opinar, revisar, explicar teoría UML/OMT, resumir avances o auditar disciplina de diseño para que TODO el equipo vea y decida.
2. CONSCIENCIA DE EQUIPO Y CONVERSACIÓN COMPARTIDA:
   - Dirígete al equipo y reconoce quién preguntó y quién diseñó o modificó cada clase cuando conste en el contexto.
   - Tus mensajes los leen todos en la sala al mismo tiempo ("todos escuchan, todos ven").
3. IDEAS VISIBLES EN LA PIZARRA ("suggestions"):
   - Siempre que detectes una mejora concreta, riesgo OMT/UML o faltante de atributo/relación/clave primaria, exprésalo como sugerencia estructurada en "suggestions" (máximo 3 por respuesta).
   - Incluye en "suggestedPrompt" una instrucción imperativa clara y corta para que cualquier desarrollador pueda aplicarla con 1 clic en la pizarra (ej: "Agrega atributo estado String a Pedido"). Si solo es una nota informativa/teórica, deja "suggestedPrompt" en null.
4. CRITERIO RIGUROSO OMT / UML / SPRING BOOT:
   - Verifica claves primarias, tipos válidos (UUID, String, Integer, Long, BigDecimal, LocalDateTime, Boolean, etc.), relaciones M:N resueltas con tabla asociativa, cardinalidades coherentes, cohesión y nombres en PascalCase.

FORMATO DE SALIDA ESTRICTO (JSON sin markdown):
{
  "message": "Tu intervención natural, clara y técnica para el chat grupal del equipo (en español, 2 a 6 líneas).",
  "summary": "Resumen en una frase para el registro de actividad.",
  "suggestions": [
    {
      "severity": "idea | warning | discipline",
      "targetClassName": "NombreDeClaseExacto o null si aplica a todo el diagrama",
      "title": "Título breve para pin en pizarra (máx 48 caracteres)",
      "message": "Explicación concreta de la recomendación o regla detectada",
      "suggestedPrompt": "Instrucción imperativa opcional para aplicar este cambio o null"
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
  ollamaBaseUrl?: string;
  ollamaVisionModel?: string;
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
    @Optional()
    @Inject(forwardRef(() => DiagramService))
    private readonly diagramService?: DiagramService,
    @Optional()
    private readonly yjsSyncService?: YjsSyncService,
  ) { }

  getOllamaRuntimeConfig(): OllamaRuntimeConfig {
    return this.ollamaAiService.getRuntimeConfig();
  }

  updateOllamaRuntimeConfig(dto: UpdateOllamaConfigDto): OllamaRuntimeConfig {
    return this.ollamaAiService.setRuntimeConfig({
      baseUrl: dto.baseUrl,
      model: dto.model,
      visionModel: dto.visionModel,
      resetToEnv: dto.resetToEnv,
    });
  }

  async testOllamaConnection(dto: TestOllamaConnectionDto): Promise<OllamaConnectionTestResult> {
    return this.ollamaAiService.testConnection(dto.baseUrl);
  }

  /**
   * Obtiene la lista de modelos de IA disponibles (Ollama local/Colab y Vertex AI en la nube).
   */
  async getAvailableModels(): Promise<AvailableAiModelsResponse> {
    const isOllamaAvail = await this.ollamaAiService.isAvailable();
    const configuredProvider = (this.configService.get<string>('AI_PROVIDER') || 'vertex').toLowerCase() as 'ollama' | 'vertex';
    const configuredGeminiModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    const configuredOllamaModel = this.ollamaAiService.getModelName();

    const models: AiModelOption[] = [];

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
        if (m.name.includes('qwen2.5vl') || m.name.includes('qwen3-vl')) {
          displayName = `Qwen Vision (${paramSize || '7B'})`;
        } else if (m.name.includes('qwen2.5-coder')) {
          displayName = `Qwen 2.5 Coder (${paramSize || '7B'})`;
        } else if (m.name.includes('qwen2.5')) {
          displayName = `Qwen 2.5 (${paramSize || '3B'})`;
        } else if (m.name.includes('gemma')) {
          displayName = `Gemma (${paramSize || '2B'})`;
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
          parameterSize: paramSize || 'Local / Colab',
          sizeMb,
          description: `Modelo en Ollama (${m.details?.quantization_level || 'GGUF'})`,
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
      ollamaBaseUrl: this.ollamaAiService.getBaseUrl(),
      ollamaVisionModel: this.ollamaAiService.getVisionModelName(),
      models,
    };
  }

  /**
   * Clasifica la intención de la intervención humana.
   * Principio rector: la IA NO muta el diagrama mientras un colaborador no le pida explícitamente editarlo.
   */
  public classifyIntent(prompt: string, explicitMode?: AiPromptMode): AiResolvedIntentMode {
    if (explicitMode && explicitMode !== 'auto') {
      const mapping: Record<Exclude<AiPromptMode, 'auto'>, AiResolvedIntentMode> = {
        mutate: 'MUTATE',
        advise: 'ADVISE',
        review: 'REVIEW',
        discipline: 'DISCIPLINE',
        recap: 'RECAP',
      };
      return mapping[explicitMode];
    }

    const p = (prompt || '').trim();
    if (!p) return 'ADVISE';

    if (/1\.\s*tablas\s+y\s+atributos/i.test(p)) {
      return 'MUTATE';
    }

    const isRecap =
      /\b(?:resumen|res[uú]meme|recap|retomar|ponme\s+al\s+d[ií]a|qu[eé]\s+(?:avanzamos|hicimos|cambi[oó]|se\s+hizo)|avance\s+de\s+ayer|desde\s+mi\s+[uú]ltima\s+visita|estado\s+actual\s+del\s+proyecto)\b/i.test(
        p,
      );

    const isDiscipline =
      /\b(?:omt|reglas?\s+uml|disciplina|normalizaci[oó]n|audita(?:r)?|auditor[ií]a|validaci[oó]n\s+uml|buenas\s+pr[aá]cticas|errores?\s+de\s+dise[nñ]o)\b/i.test(
        p,
      );

    const isReview =
      /\b(?:revis(?:a(?:r)?|e)|eval[uú](?:a(?:r)?|e)|analiz(?:a(?:r)?|e)|critic(?:a(?:r)?|e)|diagnostic(?:a(?:r)?|e)|inspeccion(?:a(?:r)?|e)|qu[eé]\s+(?:le\s+)?falta|detecta(?:r)?\s+errores?|encuentras?\s+(?:alg[uú]n\s+)?error)\b/i.test(
        p,
      );

    const startsLikeConsultativeQuestion =
      /^(?:[¿?]\s*)?(?:qu[eé]\s+(?:opinas|piensas|te\s+parece|recomiendas|sugieres|mejorar|atributo|relaci[oó]n|multiplicidad|tipo|falta|hizo|cambi[oó])|crees\s+que|conviene|deber[ií]a(?:mos)?|podr[ií]amos\s+(?:evaluar|pensar|revisar|debatir)|ser[ií]a\s+mejor|c[oó]mo\s+(?:puedo|podemos|mejorar|modelar|dise[nñ]ar|funciona|se\s+usa)|para\s+qu[eé]\s+sirve|por\s+qu[eé]|cu[aá]l\s+es\s+la\s+diferencia|explica(?:me|nos)?|sugiere(?:me|nos)?|recomienda(?:me|nos)?|dime\s+(?:c[oó]mo|qu[eé])|opina|ayuda(?:me|nos)?\s+a\s+(?:pensar|decidir|dise[nñ]ar|mejorar)|no\s+recuerdo)\b/i.test(
        p,
      );

    const isPoliteImperativeCommand =
      /^(?:[¿?]\s*)?(?:puedes|podr[ií]as|me\s+puedes|por\s+favor|te\s+pedimos|haz(?:me|nos)?\s+el\s+favor\s+de)\s+(?:crea(?:r)?|agrega(?:r)?|a[ñn]ad(?:e|ir)|inserta(?:r)?|elimina(?:r)?|borra(?:r)?|quita(?:r)?|modifica(?:r)?|actualiza(?:r)?|cambia(?:r)?|renombra(?:r)?|conecta(?:r)?|relaciona(?:r)?|genera(?:r)?|resuelve|vac[ií]a(?:r)?|limpia(?:r)?)\b/i.test(
        p,
      );

    const containsConsultativePhrase =
      /\b(?:qu[eé]\s+(?:opinas|piensas|recomiendas|sugieres|te\s+parece)|conviene|deber[ií]a(?:mos)?|ser[ií]a\s+(?:bueno|mejor)|diferencia\s+entre|para\s+qu[eé]\s+sirve|no\s+recuerdo|me\s+recomiendas|nos\s+recomiendas|sugiere(?:me|s|nos)?|opina(?:r|s)?)\b/i.test(
        p,
      );

    const hasImperativeMutation =
      /(?:^|[\s,;:«])(?:crea(?:r)?|agrega(?:r)?|a[ñn]ad(?:e|ir)|inserta(?:r)?|elimina(?:r)?|borra(?:r)?|quita(?:r)?|remueve|suprime|destruye|modifica(?:r)?|actualiza(?:r)?|cambia(?:r)?|renombra(?:r)?|conecta(?:r)?|relaciona(?:r)?|vincula(?:r)?|genera(?:r)?|resuelve|vac[ií]a(?:r)?|limpia(?:r)?|convierte|create|add|delete|remove|update|rename)\b/i.test(
        p,
      );

    const hasStandaloneRelationCommand =
      /^(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|herencia|generalizaci[oó]n|realizaci[oó]n|dependencia|relaci[oó]n)\b.*\bentre\s+[A-Za-z_][A-Za-z0-9_]*\s+y\s+[A-Za-z_]/i.test(
        p,
      );

    const endsWithQuestionMark = p.endsWith('?') || p.startsWith('¿');

    if (isRecap && !hasImperativeMutation) {
      return 'RECAP';
    }

    if (containsConsultativePhrase || startsLikeConsultativeQuestion) {
      if (isDiscipline) return 'DISCIPLINE';
      if (isReview) return 'REVIEW';
      return 'ADVISE';
    }

    if (endsWithQuestionMark && !isPoliteImperativeCommand) {
      if (isDiscipline) return 'DISCIPLINE';
      if (isReview) return 'REVIEW';
      return 'ADVISE';
    }

    if (isDiscipline && !hasImperativeMutation) {
      return 'DISCIPLINE';
    }

    if (isReview && !hasImperativeMutation) {
      return 'REVIEW';
    }

    if (isPoliteImperativeCommand || hasImperativeMutation || hasStandaloneRelationCommand) {
      return 'MUTATE';
    }

    return 'ADVISE';
  }

  /**
   * Analizador determinista de disciplina OMT / UML 2.5 y preparación para Spring Boot.
   */
  public analyzeOmtDiscipline(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
  ): DisciplineAlertItem[] {
    const alerts: DisciplineAlertItem[] = [];
    const realNodes = (nodes || []).filter(
      (n) => n && !n.isAnchor && (n.elementType || 'CLASS').toUpperCase() !== 'NOTE',
    );
    const nodeById = new Map(realNodes.map((n) => [n.id, n]));

    if (realNodes.length === 0) {
      return [];
    }

    const connectedNodeIds = new Set<string>();
    const isManyMult = (mult?: string) => {
      const c = (mult || '').trim().toLowerCase();
      return c.includes('*') || c === 'n' || c === 'm' || c === 'many';
    };

    for (const conn of connections || []) {
      const sId = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const tId = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');
      if (sId) connectedNodeIds.add(sId);
      if (tId) connectedNodeIds.add(tId);

      if (
        conn.type !== 'association_class' &&
        isManyMult(conn.sourceMultiplicity) &&
        isManyMult(conn.targetMultiplicity) &&
        !conn.assocAnchorNodeId
      ) {
        const sName = nodeById.get(sId || '')?.name || 'Origen';
        const tName = nodeById.get(tId || '')?.name || 'Destino';
        alerts.push({
          code: 'OMT_UNRESOLVED_MN',
          severity: 'discipline',
          targetNodeId: sId,
          className: `${sName} <-> ${tName}`,
          message: `La relación muchos a muchos (*..*) entre ${sName} y ${tName} debe materializarse con una clase asociativa intermedia según OMT/UML.`,
          suggestedPrompt: 'Genera la tabla asociativa intermedia para las relaciones muchos a muchos',
        });
      }
    }

    for (const node of realNodes) {
      const elType = (node.elementType || 'CLASS').toUpperCase();
      const attrs = node.attributes || [];

      if (/\s/.test(node.name) || (/^[a-z]/.test(node.name) && elType === 'CLASS')) {
        const suggestedPascal = node.name
          .trim()
          .split(/[\s_]+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
        alerts.push({
          code: 'OMT_NAMING',
          severity: 'discipline',
          targetNodeId: node.id,
          className: node.name,
          message: `El nombre "${node.name}" incumple la convención PascalCase sin espacios requerida para clases UML y entidades Spring Boot.`,
          suggestedPrompt: `Renombra la clase "${node.name}" a "${suggestedPascal}"`,
        });
      }

      if (elType === 'CLASS') {
        if (attrs.length === 0) {
          alerts.push({
            code: 'OMT_EMPTY_CLASS',
            severity: 'warning',
            targetNodeId: node.id,
            className: node.name,
            message: `La clase "${node.name}" no tiene atributos definidos todavía.`,
            suggestedPrompt: `Agrega atributo id UUID y campos básicos a la tabla ${node.name}`,
          });
        } else {
          const hasPk = attrs.some(
            (a) =>
              a.isPrimaryKey ||
              /^(id|.*_id|codigo|uuid)$/i.test((a.name || '').trim()),
          );
          if (!hasPk) {
            alerts.push({
              code: 'OMT_MISSING_PK',
              severity: 'discipline',
              targetNodeId: node.id,
              className: node.name,
              message: `La clase "${node.name}" carece de identificador/clave primaria explícita (ej: id: UUID).`,
              suggestedPrompt: `Agrega el atributo id de tipo UUID a la tabla ${node.name}`,
            });
          }

          const attrNameCounts = new Map<string, number>();
          for (const a of attrs) {
            const k = (a.name || '').trim().toLowerCase();
            if (k) attrNameCounts.set(k, (attrNameCounts.get(k) || 0) + 1);
          }
          const duplicates = Array.from(attrNameCounts.entries())
            .filter(([, count]) => count > 1)
            .map(([name]) => name);
          if (duplicates.length > 0) {
            alerts.push({
              code: 'OMT_DUPLICATE_ATTR',
              severity: 'discipline',
              targetNodeId: node.id,
              className: node.name,
              message: `La clase "${node.name}" tiene atributos repetidos (${duplicates.join(', ')}).`,
            });
          }

          if (attrs.length > 12) {
            alerts.push({
              code: 'OMT_LARGE_CLASS',
              severity: 'warning',
              targetNodeId: node.id,
              className: node.name,
              message: `La clase "${node.name}" acumula ${attrs.length} atributos; considera dividirla por cohesión OMT/3FN.`,
            });
          }
        }

        if (realNodes.length >= 3 && !connectedNodeIds.has(node.id) && !node.assocMainConnId) {
          alerts.push({
            code: 'OMT_ISOLATED_CLASS',
            severity: 'warning',
            targetNodeId: node.id,
            className: node.name,
            message: `La clase "${node.name}" permanece aislada sin relaciones hacia el resto del modelo.`,
          });
        }
      }
    }

    return alerts.slice(0, 12);
  }

  /**
   * Ejecuta el prompt con el proveedor configurado (Ollama local/Colab o Google Vertex AI).
   * Si Ollama está seleccionado pero no responde, realiza fallback automático a Vertex AI.
   */
  private async generateWithPreferredProvider(options: {
    systemInstruction: string;
    contents: string;
    responseMimeType?: string;
    formatJson?: boolean;
    provider?: 'ollama' | 'vertex';
    model?: string;
    temperature?: number;
  }): Promise<{ responseText: string; providerUsed: 'ollama' | 'vertex'; modelUsed: string }> {
    const defaultProvider = (this.configService.get<string>('AI_PROVIDER') || 'vertex').toLowerCase() as 'ollama' | 'vertex';
    const requestedProvider = options.provider || defaultProvider;

    if (requestedProvider === 'ollama') {
      try {
        const isAvail = await this.ollamaAiService.isAvailable();
        if (isAvail) {
          const targetModel = options.model || this.ollamaAiService.getModelName();
          this.logger.log(`[AiAssistant] Ejecutando prompt con Ollama (${targetModel})`);
          const text = await this.ollamaAiService.generateContent({
            model: targetModel,
            systemInstruction: options.systemInstruction,
            contents: options.contents,
            responseMimeType: options.responseMimeType,
            formatJson: options.formatJson ?? true,
            temperature: options.temperature,
            numCtx: 6144,
          });
          return {
            responseText: text,
            providerUsed: 'ollama',
            modelUsed: targetModel,
          };
        }
        this.logger.warn(
          `[AiAssistant] Ollama no está disponible en ${this.ollamaAiService.getBaseUrl()}. Fallback a Google Gemini/Vertex AI...`,
        );
      } catch (err: any) {
        this.logger.warn(`[AiAssistant] Error en inferencia Ollama (${err.message || err}). Fallback a Google Gemini/Vertex AI...`);
      }
    }

    this.logger.log('[AiAssistant] Ejecutando prompt con Google Gemini / Vertex AI');
    const text = await this.vertexAiService.generateContent({
      systemInstruction: options.systemInstruction,
      contents: options.contents,
      responseMimeType: options.responseMimeType,
    });
    return {
      responseText: text,
      providerUsed: 'vertex',
      modelUsed: this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash',
    };
  }

  // Normalizador de texto palabra por palabra para matching difuso
  normalizeForFuzzy(text: string): string {
    if (!text) return '';

    const spacedCamel = text.replace(/([a-z])([A-Z])/g, '$1 $2');

    const stopwords = new Set([
      'de', 'la', 'el', 'los', 'las', 'del', 'un', 'una', 'unos', 'unas',
      'tabla', 'tablas', 'clase', 'clases', 'entidad', 'entidades', 'nodo', 'nodos',
    ]);

    const words = spacedCamel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/);

    const stemmedWords = words
      .filter((w) => w.length > 0 && !stopwords.has(w))
      .map((w) => {
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

    const byId = nodes.find((n) => n.id.toLowerCase() === query.toLowerCase().trim());
    if (byId) return byId;

    const byNormalized = nodes.find((n) => this.normalizeForFuzzy(n.name) === cleanQuery);
    if (byNormalized) return byNormalized;

    return nodes.find((n) => {
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

    const intentMode = this.classifyIntent(prompt, dto.mode);

    // Rutas consultivas / colaborativas (NO mutan el diagrama!)
    if (intentMode !== 'MUTATE') {
      return this.handleConsultativeIntent(dto, intentMode, currentNodes, currentConnections);
    }

    // 0. DETECCIÓN DE LIMPIEZA TOTAL / ELIMINAR TODAS LAS TABLAS
    const isAttributeOrMethodOperation = /(?:atributos?|m[eé]todos?|campos?|propiedad(?:es)?)\b/i.test(prompt);
    const isDeleteAllPrompt = !isAttributeOrMethodOperation && (
      /(?:elimina(?:r)?|borra(?:r)?)\s+(?:todas?\s+las?\s+(?:tablas|clases|entidades|nodos)|todo\s+el\s+diagrama|todo\s*$)/i.test(prompt) ||
      /(?:limpia(?:r)?|vac[ií]a(?:r)?)\s+(?:el\s+diagrama|el\s+lienzo|todo\s*$)/i.test(prompt) ||
      /^(?:delete\s+all(?:\s+tables)?|clear\s+diagram)$/i.test(prompt.trim())
    );

    if (isDeleteAllPrompt) {
      await this.broadcastAiMutation(
        dto,
        [],
        [],
        'Todas las tablas y relaciones han sido eliminadas del diagrama',
        [],
      );

      return {
        success: true,
        action: 'diagram_mutated',
        intentMode: 'MUTATE',
        mutatedDiagram: true,
        message: 'Todas las tablas y relaciones han sido eliminadas del diagrama.',
        nodes: [],
        connections: [],
        changesSummary: 'Limpieza total del diagrama.',
        disciplineAlerts: [],
        broadcastedToRoom: dto.broadcastToRoom !== false,
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

    const historyBlock = dto.sessionHistory && dto.sessionHistory.length > 0
      ? `\nHISTORIAL DE ACTIVIDAD RECIENTE EN ESTA SESIÓN:\n${JSON.stringify(dto.sessionHistory.slice(-12).map((h: any) => `[${h.timestamp || 'reciente'}] ${h.actor || h.userName || 'Usuario'}: ${h.title || h.action} - ${h.description || h.detail || ''}`), null, 2)}\n`
      : '';

    const userContent = `
ESTADO ACTUAL DEL DIAGRAMA:
SOLICITADO POR: ${dto.authorUserName || 'Colaborador'}
NODOS ACTUALES (${currentNodes.length}):
${JSON.stringify(currentNodes.map((n) => ({ id: n.id, name: n.name, ...(n.createdByName ? { createdBy: n.createdByName } : {}), ...(n.elementType && n.elementType !== 'CLASS' ? { elementType: n.elementType } : {}), ...(n.stereotype ? { stereotype: n.stereotype } : {}), ...(n.noteContent ? { noteContent: n.noteContent } : {}), attributes: n.attributes, methods: n.methods })), null, 2)}

CONEXIONES ACTUALES (${currentConnections.length}):
${JSON.stringify(currentConnections.map((c) => ({ id: c.id, sourceNodeId: c.sourceNodeId, targetNodeId: c.targetNodeId, type: c.type, sourceMultiplicity: c.sourceMultiplicity, targetMultiplicity: c.targetMultiplicity })), null, 2)}
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
        temperature: 0.1,
      });

      const parsed = this.cleanAndParseJson(responseText);

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
          intentMode: 'MUTATE',
          mutatedDiagram: false,
          message: clarificationMsg,
          nodes: currentNodes,
          connections: currentConnections,
          changesSummary: 'Aclaración requerida.',
          providerUsed,
          modelUsed,
        };
      }

      const merged = this.mergeNodesAndConnections(
        currentNodes,
        currentConnections,
        parsed.nodes || [],
        parsed.connections || [],
        prompt,
      );

      const resolved = this.resolveManyToManyRelationships(merged.nodes, merged.connections);

      const finalNodes = this.sanitizeNodes(resolved.nodes);
      const finalConnections = this.sanitizeConnections(resolved.connections, finalNodes);
      const affectedClasses = finalNodes
        .filter((n) => !n.isAnchor && (n.elementType || 'CLASS') !== 'NOTE')
        .map((n) => n.name)
        .slice(0, 8);
      const disciplineAlerts = this.analyzeOmtDiscipline(finalNodes, finalConnections);

      await this.broadcastAiMutation(
        dto,
        finalNodes,
        finalConnections,
        parsed.message || parsed.changesSummary || 'Mutación estructural aplicada al diagrama',
        affectedClasses,
        providerUsed,
        modelUsed,
      );

      return {
        success: true,
        action: 'diagram_mutated',
        intentMode: 'MUTATE',
        mutatedDiagram: true,
        message: parsed.message || parsed.changesSummary || 'Diagrama actualizado por Copilot IA.',
        nodes: finalNodes,
        connections: finalConnections,
        changesSummary: parsed.changesSummary || 'Mutación aplicada al diagrama UML.',
        providerUsed,
        modelUsed,
        disciplineAlerts,
        broadcastedToRoom: dto.broadcastToRoom !== false,
      };
    } catch (err: any) {
      this.logger.warn(
        `Motor IA no disponible para texto (${err?.message || err}); evaluando motor determinista local...`,
      );
      const deterministicResult = await this.tryDeterministicMutateFallback(
        dto,
        currentNodes,
        currentConnections,
      );
      if (deterministicResult) {
        return deterministicResult;
      }
      return this.handleFallbackPrompt(dto, currentNodes, currentConnections);
    } finally {
      for (const node of targetNodesToLock) {
        this.collaborationGateway.unlockNodeForAi(dto.diagramId, dto.roomCode, node.id);
      }
    }
  }

  /**
   * Maneja intervenciones colaborativas donde la IA opina, revisa, valida disciplina OMT/UML
   * o resume sesiones multi-día sin mutar el diagrama.
   */
  private async handleConsultativeIntent(
    dto: AiPromptDto,
    intentMode: Exclude<AiResolvedIntentMode, 'MUTATE'>,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): Promise<AiResponseDto> {
    const prompt = dto.prompt.trim();
    const disciplineAlerts = this.analyzeOmtDiscipline(currentNodes, currentConnections);
    const requesterName = dto.authorUserName || 'Colaborador';

    let roomMessages: any[] = [];
    let recentEvents: any[] = [];
    let existingDiagram: any = null;
    let resumeBundle: any = null;

    if (isValidUuid(dto.diagramId)) {
      if (this.yjsSyncService) {
        try {
          if (intentMode === 'RECAP' && dto.authorUserId && isValidUuid(dto.authorUserId)) {
            resumeBundle = await this.yjsSyncService.getResumeBundle(dto.diagramId, dto.authorUserId);
            roomMessages = resumeBundle.recentMessages || [];
            recentEvents = resumeBundle.recentEvents || [];
          } else {
            const hist = await this.yjsSyncService.getRoomHistory(dto.diagramId, 25);
            roomMessages = hist.recentChatMessages || [];
            recentEvents = hist.recentActivityLogs || [];
          }
        } catch (err: any) {
          this.logger.warn(`[AiAssistant] No se pudo cargar historial colaborativo: ${err?.message || err}`);
        }
      }

      if (this.diagramService && dto.authorUserId && isValidUuid(dto.authorUserId)) {
        try {
          existingDiagram = await this.diagramService.findOne(dto.diagramId, dto.authorUserId);
        } catch {
          // Opcional: si no tiene usuario o acceso read, continuamos con los nodos recibidos en dto
        }
      }
    }

    const selectedNodesInfo = (dto.selectedNodeIds || [])
      .map((id) => currentNodes.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => n!.name);

    const teamChatContext = roomMessages.slice(-10).map((m: any) =>
      `[${m.senderType === 'ai' ? 'Copilot IA' : m.userName || 'Dev'}]: ${m.message}`,
    );

    const eventsContext = recentEvents.slice(-12).map((e: any) =>
      `[Sesión #${e.sessionNumber || 1}] ${e.userName || 'Dev'}: ${e.action}${e.detail ? ` (${e.detail})` : ''}`,
    );

    const resumeContextBlock = resumeBundle
      ? `\nDATOS DE SESIÓN Y CONTRIBUCIONES:\n${JSON.stringify({
        diagramName: resumeBundle.diagram?.name,
        sessionNumber: resumeBundle.session?.sessionNumber,
        activeDateKeys: resumeBundle.session?.activeDateKeys,
        sinceLastVisit: resumeBundle.sinceLastVisit,
        contributorStats: resumeBundle.contributorStats,
      }, null, 2)}\n`
      : '';

    const userContent = `
MODO DE INTERVENCIÓN: ${intentMode}
(${intentMode === 'ADVISE' ? 'Asesoría grupal y opinión arquitectónica sin mutar el diagrama' : intentMode === 'REVIEW' ? 'Revisión técnica constructiva del diagrama actual' : intentMode === 'DISCIPLINE' ? 'Auditoría de disciplina OMT, UML 2.5 y preparación Spring Boot' : 'Resumen ejecutivo multi-sesión para retomar el trabajo en equipo'})

COLABORADOR QUE CONSULTA: ${requesterName}
NODOS SELECCIONADOS COMO FOCO: ${selectedNodesInfo.length > 0 ? selectedNodesInfo.join(', ') : 'Todo el diagrama'}

ESTADO ACTUAL DEL DIAGRAMA (${currentNodes.filter((n) => !n.isAnchor).length} elementos visibles, ${currentConnections.length} conexiones):
${JSON.stringify(currentNodes.filter((n) => !n.isAnchor).map((n) => ({
      id: n.id,
      name: n.name,
      elementType: n.elementType || 'CLASS',
      createdBy: n.createdByName || null,
      lastModifiedBy: n.lastModifiedByName || null,
      attributes: n.attributes,
      methods: n.methods,
    })), null, 2)}

CONEXIONES:
${JSON.stringify(currentConnections.map((c) => ({
      sourceNodeId: c.sourceNodeId,
      targetNodeId: c.targetNodeId,
      type: c.type,
      name: c.name,
      sourceMultiplicity: c.sourceMultiplicity,
      targetMultiplicity: c.targetMultiplicity,
    })), null, 2)}

ALERTAS DETERMINISTAS OMT/UML DETECTADAS:
${JSON.stringify(disciplineAlerts, null, 2)}
${resumeContextBlock}
CHAT GRUPAL RECIENTE EN SALA:
${teamChatContext.length > 0 ? teamChatContext.join('\n') : '(Sin mensajes previos)'}

ACTIVIDAD RECIENTE DEL EQUIPO:
${eventsContext.length > 0 ? eventsContext.join('\n') : '(Sin eventos registrados aún)'}

CONSULTA DE ${requesterName.toUpperCase()}:
"${prompt}"
`;

    let providerUsed: string | undefined;
    let modelUsed: string | undefined;
    let responseMessage = '';
    let responseSummary = '';
    let parsedSuggestions: any[] = [];

    try {
      const generated = await this.generateWithPreferredProvider({
        systemInstruction: COLLAB_PARTNER_SYSTEM_INSTRUCTION,
        contents: userContent,
        responseMimeType: 'application/json',
        formatJson: true,
        provider: dto.provider,
        model: dto.model,
        temperature: 0.25,
      });

      providerUsed = generated.providerUsed;
      modelUsed = generated.modelUsed;

      try {
        const parsed = this.cleanAndParseJson(generated.responseText);
        responseMessage = (parsed.message || '').trim();
        responseSummary = (parsed.summary || '').trim();
        if (Array.isArray(parsed.suggestions)) {
          parsedSuggestions = parsed.suggestions;
        }
      } catch {
        // Si un modelo local devolvió texto libre útil en lugar de JSON, lo aprovechamos directamente
        responseMessage = (generated.responseText || '').trim();
      }
    } catch (err: any) {
      this.logger.warn(`[AiAssistant] Fallback determinista en modo ${intentMode}: ${err?.message || err}`);
    }

    if (!responseMessage) {
      const consultative = this.buildDeterministicConsultativeMessage(
        intentMode,
        requesterName,
        currentNodes,
        currentConnections,
        disciplineAlerts,
        resumeBundle,
        prompt,
        dto.selectedNodeIds,
      );
      responseMessage = consultative.message;
      if (parsedSuggestions.length === 0 && consultative.suggestions.length > 0) {
        parsedSuggestions = consultative.suggestions;
      }
      providerUsed = providerUsed || 'omt-analyzer';
      modelUsed = modelUsed || 'deterministic-advisor';
    }

    // Normalizar sugerencias combinando LLM + alertas OMT deterministas cuando aplique
    const normalizedSuggestions: AiSuggestionItem[] = [];
    const seenSuggestionTitles = new Set<string>();

    for (const s of parsedSuggestions.slice(0, 4)) {
      const title = (s?.title || '').trim();
      const message = (s?.message || '').trim();
      if (!title || !message) continue;
      const targetNode = s.targetClassName ? this.findNodeFuzzy(currentNodes, s.targetClassName) : undefined;
      const severity: 'idea' | 'warning' | 'discipline' =
        s.severity === 'discipline' || s.severity === 'warning' ? s.severity : 'idea';
      seenSuggestionTitles.add(title.toLowerCase());
      normalizedSuggestions.push({
        id: `sug_${Date.now()}_${normalizedSuggestions.length}`,
        severity,
        targetNodeId: targetNode?.id,
        targetClassName: targetNode?.name || s.targetClassName || undefined,
        title: title.slice(0, 80),
        message,
        suggestedPrompt: typeof s.suggestedPrompt === 'string' && s.suggestedPrompt.trim() ? s.suggestedPrompt.trim() : undefined,
      });
    }

    if (intentMode === 'DISCIPLINE' || intentMode === 'REVIEW' || normalizedSuggestions.length === 0) {
      for (const alert of disciplineAlerts) {
        if (normalizedSuggestions.length >= 4) break;
        const title = alert.className ? `${alert.code}: ${alert.className}` : alert.code;
        if (seenSuggestionTitles.has(title.toLowerCase())) continue;
        seenSuggestionTitles.add(title.toLowerCase());
        normalizedSuggestions.push({
          id: `sug_omt_${Date.now()}_${normalizedSuggestions.length}`,
          severity: alert.severity,
          targetNodeId: alert.targetNodeId,
          targetClassName: alert.className,
          title,
          message: alert.message,
          suggestedPrompt: alert.suggestedPrompt,
        });
      }
    }

    // Fijar ideas/hallazgos en la pizarra persistida para que todo el equipo los vea ("aparezcan en la pizarra")
    const annotationsAdded: any[] = [];
    if (
      isValidUuid(dto.diagramId) &&
      this.diagramService &&
      dto.createWhiteboardNotes !== false &&
      intentMode !== 'RECAP' &&
      normalizedSuggestions.length > 0
    ) {
      const existingOpenTitles = new Set(
        ((existingDiagram?.aiAnnotations || []) as any[])
          .filter((a) => a.status === 'open')
          .map((a) => `${(a.title || '').toLowerCase()}::${(a.targetNodeId || '').toLowerCase()}`),
      );

      let latestDiagramAfterNotes: any = null;
      for (const sug of normalizedSuggestions.slice(0, 3)) {
        const dedupKey = `${sug.title.toLowerCase()}::${(sug.targetNodeId || '').toLowerCase()}`;
        if (existingOpenTitles.has(dedupKey)) continue;
        try {
          latestDiagramAfterNotes = await this.diagramService.addAiAnnotation(dto.diagramId, {
            targetNodeId: sug.targetNodeId ?? null,
            targetClassName: sug.targetClassName ?? null,
            severity: sug.severity,
            title: sug.title,
            message: sug.message,
            authorName: 'Copilot IA',
            requestedByUserName: requesterName,
            suggestedAction: sug.suggestedPrompt
              ? { suggestedPrompt: sug.suggestedPrompt, mode: intentMode }
              : null,
          });
          const addedList = latestDiagramAfterNotes?.aiAnnotations || [];
          if (addedList.length > 0) {
            annotationsAdded.push(addedList[addedList.length - 1]);
          }
        } catch (err: any) {
          this.logger.warn(`[AiAssistant] No se pudo guardar anotación en pizarra: ${err?.message || err}`);
        }
      }

      if (
        latestDiagramAfterNotes &&
        typeof this.collaborationGateway?.broadcastAiAnnotationsUpdated === 'function'
      ) {
        this.collaborationGateway.broadcastAiAnnotationsUpdated(
          dto.diagramId,
          dto.roomCode,
          latestDiagramAfterNotes.aiAnnotations || [],
        );
      }
    }

    // Difundir respuesta al chat grupal de la sala para que todo el equipo vea y escuche
    let broadcastedToRoom = false;
    if (dto.broadcastToRoom !== false) {
      broadcastedToRoom = await this.publishAiGroupChatMessage(dto, {
        message: responseMessage,
        aiMode: intentMode,
        mutatedDiagram: false,
        targetNodes: normalizedSuggestions
          .map((s) => s.targetClassName)
          .filter((v): v is string => Boolean(v)),
        providerUsed,
        modelUsed,
      });
    }

    if (isValidUuid(dto.diagramId) && this.yjsSyncService && annotationsAdded.length > 0) {
      try {
        await this.yjsSyncService.recordAuthorEvent({
          diagramId: dto.diagramId,
          roomCode: dto.roomCode,
          actorType: 'ai',
          userId: 'ai_copilot_partner',
          userName: '✨ Copilot IA',
          category: 'ai',
          action:
            intentMode === 'DISCIPLINE'
              ? `Auditó disciplina OMT/UML (${annotationsAdded.length} notas)`
              : intentMode === 'REVIEW'
                ? `Revisó el diseño (${annotationsAdded.length} recomendaciones)`
                : `Aportó ${annotationsAdded.length} idea(s) en la pizarra`,
          detail: responseSummary || responseMessage.slice(0, 140),
          affectedClasses: normalizedSuggestions
            .map((s) => s.targetClassName)
            .filter((v): v is string => Boolean(v)),
          color: '#8B5CF6',
        });
      } catch (err: any) {
        this.logger.warn(`[AiAssistant] No se pudo registrar AuthorEvent consultivo: ${err?.message || err}`);
      }
    }

    const actionByMode: Record<Exclude<AiResolvedIntentMode, 'MUTATE'>, string> = {
      ADVISE: 'advise',
      REVIEW: 'review',
      DISCIPLINE: 'discipline',
      RECAP: 'recap',
    };

    return {
      success: true,
      action: actionByMode[intentMode],
      intentMode,
      mutatedDiagram: false,
      message: responseMessage,
      nodes: currentNodes,
      connections: currentConnections,
      changesSummary:
        responseSummary ||
        `Intervención grupal (${intentMode}) sin modificar el lienzo.`,
      providerUsed,
      modelUsed,
      suggestions: normalizedSuggestions,
      annotationsAdded,
      disciplineAlerts,
      broadcastedToRoom,
    };
  }

  private buildDeterministicConsultativeMessage(
    intentMode: Exclude<AiResolvedIntentMode, 'MUTATE'>,
    requesterName: string,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
    alerts: DisciplineAlertItem[],
    resumeBundle: any,
    prompt = '',
    selectedNodeIds: string[] = [],
  ): {
    message: string;
    suggestions: Array<{
      severity: 'idea' | 'warning' | 'discipline';
      targetClassName?: string;
      title: string;
      message: string;
      suggestedPrompt?: string;
    }>;
  } {
    const realNodes = currentNodes.filter(
      (n) => !n.isAnchor && (n.elementType || 'CLASS') !== 'NOTE',
    );
    const classNames = realNodes.map((n) => n.name);

    if (intentMode === 'RECAP') {
      if (resumeBundle) {
        const statsText = (resumeBundle.contributorStats || [])
          .slice(0, 4)
          .map((c: any) => `${c.userName} (${c.totalEvents} acciones)`)
          .join(', ');
        const recent = (resumeBundle.sinceLastVisit?.highlights || []).slice(0, 3).join(' | ');
        return {
          message: `Hola ${requesterName} y equipo: el diagrama "${resumeBundle.diagram?.name || 'actual'}" está en la sesión #${resumeBundle.session?.sessionNumber || 1} con ${classNames.length} clases y ${currentConnections.length} relaciones. ${statsText ? `Aportes acumulados: ${statsText}.` : ''} ${recent ? `Últimos hitos: ${recent}.` : 'El lienzo no se ha modificado.'}`,
          suggestions: [],
        };
      }
      return {
        message: `Resumen rápido para el equipo: actualmente tenemos ${classNames.length} clase(s) (${classNames.join(', ') || 'lienzo vacío'}) y ${currentConnections.length} relación(es).`,
        suggestions: [],
      };
    }

    const focusNode = this.findFocusNodeForAdvice(realNodes, prompt, selectedNodeIds);

    if (focusNode) {
      return this.buildClassSpecificAdvice(
        intentMode,
        requesterName,
        focusNode,
        realNodes,
        currentConnections,
        alerts,
      );
    }

    if (intentMode === 'DISCIPLINE' || intentMode === 'REVIEW') {
      if (alerts.length === 0) {
        const methodMissingCount = realNodes.filter(
          (n) => (n.elementType || 'CLASS') === 'CLASS' && (n.methods || []).length === 0,
        ).length;
        const extraTip =
          methodMissingCount > 0 && realNodes.length > 0
            ? ` Sugerencia arquitectónica: ${methodMissingCount} clase(s) aún no tienen métodos de comportamiento de dominio definidos.`
            : '';
        return {
          message: `Revisé las ${classNames.length} clase(s) y ${currentConnections.length} relación(es) del diagrama y cumplen correctamente con las reglas OMT/UML básicas (sin atributos duplicados, M:N pendientes ni clases sin identificador).${extraTip}`,
          suggestions: [],
        };
      }
      const bullets = alerts.slice(0, 3).map((a) => `• ${a.message}`).join(' ');
      return {
        message: `${requesterName}, revisé el diagrama bajo reglas OMT/UML y encontré ${alerts.length} punto(s) para revisar en equipo (sin alterar el lienzo): ${bullets}`,
        suggestions: [],
      };
    }

    if (realNodes.length === 0) {
      return {
        message: `${requesterName}, el lienzo está vacío aún. Puedes pedirme crear tus primeras entidades directamente (ej: "Crea una tabla Producto con atributos id UUID, nombre String, precio Double") o dibujar una clase desde el Toolbox.`,
        suggestions: [
          {
            severity: 'idea',
            title: 'Crear entidad inicial Producto',
            message: 'Agrega una entidad base con PK, nombre y precio para comenzar a modelar.',
            suggestedPrompt:
              'Crea una tabla Producto con atributos id UUID, nombre String, precio Double',
          },
        ],
      };
    }

    const classAlerts = alerts.slice(0, 2);
    const generalTips: string[] = [];
    if (classAlerts.length > 0) {
      generalTips.push(...classAlerts.map((a) => `• ${a.message}`));
    }
    const withoutMethods = realNodes.filter((n) => (n.methods || []).length === 0);
    if (withoutMethods.length > 0) {
      generalTips.push(
        `• Algunas clases (${withoutMethods.slice(0, 3).map((n) => n.name).join(', ')}) no tienen operaciones/métodos de negocio todavía; agrega solo lógica de dominio relevante (evita getters/setters triviales).`,
      );
    }

    return {
      message: `${requesterName}, analicé las ${classNames.length} clase(s) del diagrama (${classNames.slice(0, 5).join(', ')})${generalTips.length > 0 ? `: ${generalTips.join(' ')}` : '. El diseño luce consistente; indícame sobre qué clase quieres profundizar o qué cambio deseas aplicar.'}`,
      suggestions: classAlerts.map((a) => ({
        severity: a.severity,
        targetClassName: a.className,
        title: `${a.code}: ${a.className || 'Diagrama'}`,
        message: a.message,
        suggestedPrompt: a.suggestedPrompt,
      })),
    };
  }

  private findFocusNodeForAdvice(
    nodes: UmlClassNode[],
    prompt: string,
    selectedNodeIds: string[] = [],
  ): UmlClassNode | undefined {
    const cleanPrompt = this.normalizeForFuzzy(prompt);
    if (cleanPrompt) {
      // Buscar coincidencia explícita del nombre de la clase en el prompt (priorizando nombres más largos)
      const sortedByLen = [...nodes].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
      for (const node of sortedByLen) {
        const nodeNorm = this.normalizeForFuzzy(node.name);
        if (nodeNorm.length >= 3 && cleanPrompt.includes(nodeNorm)) {
          return node;
        }
      }
      // También revisar palabras sueltas del prompt con findNodeFuzzy
      const tokens = prompt
        .replace(/[^\p{L}0-9_\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      for (const token of tokens) {
        if (/^(?:clase|tabla|entidad|como|cómo|mejorar|revisar|atributos|metodos|métodos|dime|para|sobre|esta|este)$/i.test(token)) {
          continue;
        }
        const match = this.findNodeFuzzy(nodes, token);
        if (match) return match;
      }
    }
    if (selectedNodeIds.length === 1) {
      return nodes.find((n) => n.id === selectedNodeIds[0]);
    }
    return undefined;
  }

  private buildClassSpecificAdvice(
    intentMode: Exclude<AiResolvedIntentMode, 'MUTATE'>,
    requesterName: string,
    target: UmlClassNode,
    allNodes: UmlClassNode[],
    allConnections: UmlConnection[],
    alerts: DisciplineAlertItem[],
  ) {
    const attrs = target.attributes || [];
    const methods = target.methods || [];
    const attrNamesLower = new Set(attrs.map((a) => (a.name || '').trim().toLowerCase()));
    const hasPk = attrs.some(
      (a) => a.isPrimaryKey || /^(id|.*_id|codigo|uuid)$/i.test((a.name || '').trim()),
    );
    const hasConn = allConnections.some((c) => {
      const sId = c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const tId = c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, '');
      return sId === target.id || tId === target.id;
    });

    const improvements: string[] = [];
    const suggestions: Array<{
      severity: 'idea' | 'warning' | 'discipline';
      targetClassName?: string;
      title: string;
      message: string;
      suggestedPrompt?: string;
    }> = [];

    if (!hasPk) {
      improvements.push(`• Falta clave primaria explícita (id: UUID).`);
      suggestions.push({
        severity: 'discipline',
        targetClassName: target.name,
        title: `Agregar PK a ${target.name}`,
        message: `Toda entidad UML/Spring Boot necesita identificador único (id: UUID).`,
        suggestedPrompt: `Agrega atributo id UUID a la tabla ${target.name}`,
      });
    }

    const normName = this.normalizeForFuzzy(target.name);
    const suggestedAttrs: Array<{ name: string; type: string }> = [];
    let suggestedMethod = 'validarEstado(): Boolean';

    if (/product|articul|item/i.test(normName) && !/detalle/i.test(normName)) {
      if (!attrNamesLower.has('precio') && !attrNamesLower.has('price')) {
        suggestedAttrs.push({ name: 'precio', type: 'Double' });
      }
      if (!attrNamesLower.has('stock') && !attrNamesLower.has('cantidad')) {
        suggestedAttrs.push({ name: 'stock', type: 'Integer' });
      }
      if (!attrNamesLower.has('activo')) {
        suggestedAttrs.push({ name: 'activo', type: 'Boolean' });
      }
      suggestedMethod = 'descontarStock(cantidad: Integer): Boolean';
    } else if (/detalle/i.test(normName)) {
      if (!attrNamesLower.has('cantidad')) suggestedAttrs.push({ name: 'cantidad', type: 'Integer' });
      if (!attrNamesLower.has('precio_unitario') && !attrNamesLower.has('preciounitario')) {
        suggestedAttrs.push({ name: 'precio_unitario', type: 'Double' });
      }
      if (!attrNamesLower.has('subtotal')) suggestedAttrs.push({ name: 'subtotal', type: 'Double' });
      suggestedMethod = 'calcularSubtotal(): Double';
    } else if (/pedido|orden|compra|factura|venta/i.test(normName)) {
      if (!attrNamesLower.has('fecha')) suggestedAttrs.push({ name: 'fecha', type: 'LocalDateTime' });
      if (!attrNamesLower.has('total')) suggestedAttrs.push({ name: 'total', type: 'Double' });
      if (!attrNamesLower.has('estado')) suggestedAttrs.push({ name: 'estado', type: 'String' });
      suggestedMethod = 'calcularTotal(): Double';
    } else if (/usuario|cliente|persona|user/i.test(normName)) {
      if (!attrNamesLower.has('email') && !attrNamesLower.has('correo')) {
        suggestedAttrs.push({ name: 'email', type: 'String' });
      }
      if (!attrNamesLower.has('activo')) suggestedAttrs.push({ name: 'activo', type: 'Boolean' });
      suggestedMethod = 'estaActivo(): Boolean';
    } else {
      if (!attrNamesLower.has('estado')) suggestedAttrs.push({ name: 'estado', type: 'String' });
      if (!attrNamesLower.has('createdat') && !attrNamesLower.has('created_at')) {
        suggestedAttrs.push({ name: 'createdAt', type: 'LocalDateTime' });
      }
    }

    if (suggestedAttrs.length > 0) {
      const attrListStr = suggestedAttrs.map((a) => `${a.name} ${a.type}`).join(', ');
      improvements.push(`• Atributos de dominio recomendados: ${attrListStr}.`);
      suggestions.push({
        severity: 'idea',
        targetClassName: target.name,
        title: `Completar atributos de ${target.name}`,
        message: `Agrega ${attrListStr} para enriquecer la entidad.`,
        suggestedPrompt: `Agrega los atributos ${attrListStr} a ${target.name}`,
      });
    }

    if (methods.length === 0) {
      improvements.push(
        `• Métodos: actualmente no define operaciones; en lugar de getters/setters triviales, conviene agregar lógica de negocio como +${suggestedMethod}.`,
      );
      suggestions.push({
        severity: 'idea',
        targetClassName: target.name,
        title: `Agregar método de negocio`,
        message: `Incorpora comportamiento propio del dominio (${suggestedMethod}).`,
        suggestedPrompt: `Agrega el método ${suggestedMethod} a ${target.name}`,
      });
    }

    if (!hasConn && allNodes.length >= 2) {
      const otherClass = allNodes.find((n) => n.id !== target.id);
      improvements.push(
        `• Relación: ${target.name} aún está aislada; evalúa conectarla con ${otherClass?.name || 'otra entidad'} según su cardinalidad.`,
      );
    }

    const nodeAlerts = alerts.filter((a) => a.targetNodeId === target.id);
    for (const a of nodeAlerts) {
      if (a.code !== 'OMT_MISSING_PK' && improvements.length < 5) {
        improvements.push(`• ${a.message}`);
      }
    }

    const currentAttrsText =
      attrs.length > 0
        ? attrs.map((a) => `${a.name}:${a.type}`).join(', ')
        : 'ninguno todavía';

    const prefix = intentMode === 'REVIEW' ? 'Revisé' : 'Analicé';
    const message = `${requesterName}, ${prefix.toLowerCase()} la clase ${target.name} (atributos actuales: ${currentAttrsText}; métodos: ${methods.length}):\n${improvements.join('\n')}\nNo modifiqué el lienzo; puedes aplicarme cualquiera de estos cambios con un comando directo.`;

    return { message, suggestions: suggestions.slice(0, 3) };
  }

  private async publishAiGroupChatMessage(
    dto: {
      diagramId: string;
      roomCode?: string;
      authorUserId?: string;
      authorUserName?: string;
    },
    params: {
      message: string;
      aiMode: AiResolvedIntentMode;
      mutatedDiagram: boolean;
      targetNodes?: string[];
      providerUsed?: string;
      modelUsed?: string;
    },
  ): Promise<boolean> {
    try {
      if (
        isValidUuid(dto.diagramId) &&
        typeof this.collaborationGateway?.broadcastAiGroupMessage === 'function'
      ) {
        await this.collaborationGateway.broadcastAiGroupMessage(dto.diagramId, dto.roomCode, {
          message: params.message,
          aiMode: params.aiMode,
          requestedByUserId: dto.authorUserId,
          requestedByUserName: dto.authorUserName,
          targetNodes: params.targetNodes || [],
          mutatedDiagram: params.mutatedDiagram,
          providerUsed: params.providerUsed,
          modelUsed: params.modelUsed,
        });
        return true;
      }

      if (this.collaborationGateway?.server) {
        const target = dto.diagramId ? `diagram_${dto.diagramId}` : dto.roomCode;
        if (target) {
          this.collaborationGateway.server.to(target).emit('chat_message_received', {
            userId: 'ai_copilot_partner',
            userName: '✨ Copilot IA',
            senderType: 'ai',
            aiMode: params.aiMode,
            requestedByUserName: dto.authorUserName || null,
            targetNodes: params.targetNodes || [],
            mutatedDiagram: params.mutatedDiagram,
            providerUsed: params.providerUsed || null,
            modelUsed: params.modelUsed || null,
            message: params.message,
            timestamp: new Date().toISOString(),
          });
          return true;
        }
      }
    } catch (e) {
      this.logger.warn(`No se pudo publicar mensaje grupal de IA: ${e}`);
    }
    return false;
  }

  async processVisionDiagram(dto: AiVisionPromptDto): Promise<AiResponseDto> {
    const currentNodes: UmlClassNode[] = dto.currentNodes || [];
    const currentConnections: UmlConnection[] = dto.currentConnections || [];

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

    const configuredProvider = (this.configService.get<string>('AI_PROVIDER') || 'vertex').toLowerCase() as 'ollama' | 'vertex';
    const requestedProvider = dto.provider || configuredProvider;
    let providerUsed: 'ollama' | 'vertex' = 'vertex';
    let modelUsed = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';

    try {
      const userPromptInstruction = dto.prompt
        ? `Instrucción o requerimiento específico del usuario a aplicar sobre el diagrama: "${dto.prompt}". Aplica esta indicación preservando la totalidad de las clases y conexiones del diagrama visual.`
        : 'Extrae todo el esquema con fidelidad visual completa.';

      const promptText = `TAREA PRINCIPAL: Digitalización visual COMPLETA y EXHAUSTIVA del diagrama UML de la imagen adjunta.
1. DEBES digitalizar y extraer absolutamente el 100% de las clases/tablas visibles en la imagen sin omitir ninguna entidad (revisa metódicamente de izquierda a derecha y de arriba a abajo toda la imagen).
2. ${userPromptInstruction}`;

      let responseText = '';

      // Intento Local-First con Ollama Vision (ej. qwen2.5vl:7b en Colab/Local) si se solicitó Ollama
      if (requestedProvider === 'ollama') {
        try {
          const isAvail = await this.ollamaAiService.isAvailable();
          if (isAvail) {
            const installedModels = await this.ollamaAiService.listModels();
            const isExplicitVisionModel =
              dto.model && /(?:vl|vision|llava|minicpm|moondream)/i.test(dto.model);
            const preferredVision = this.ollamaAiService.getVisionModelName();
            const matchedInstalledVision = installedModels.find((m) => m === preferredVision)
              || installedModels.find((m) => /(?:vl|vision|llava|minicpm|moondream)/i.test(m));
            const visionModel = isExplicitVisionModel
              ? dto.model!
              : matchedInstalledVision || preferredVision;

            this.logger.log(`[Vision] Intentando digitalización local/Colab con Ollama (${visionModel})...`);
            responseText = await this.ollamaAiService.generateContent({
              model: visionModel,
              systemInstruction: visionSystemInstruction,
              contents: promptText,
              images: [cleanBase64],
              formatJson: true,
              temperature: 0.1,
              numCtx: 6144,
            });
            providerUsed = 'ollama';
            modelUsed = visionModel;
          }
        } catch (ollamaVisionErr: any) {
          this.logger.warn(
            `[Vision] Ollama visión no pudo procesar la imagen (${ollamaVisionErr?.message || ollamaVisionErr}). Fallback a Gemini Vision...`,
          );
          responseText = '';
        }
      }

      if (!responseText) {
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

        try {
          responseText = await this.vertexAiService.generateContent({
            systemInstruction: visionSystemInstruction,
            contents,
            responseMimeType: 'application/json',
          });
          providerUsed = 'vertex';
          modelUsed = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
        } catch (vertexErr: any) {
          this.logger.error(`[Vision] Error en digitalización con Gemini: ${vertexErr?.message || vertexErr}`);
          throw new Error(`No se pudo digitalizar la imagen con Gemini: ${vertexErr?.message || vertexErr}. Por favor intenta nuevamente.`);
        }
      }

      const parsed = this.cleanAndParseJson(responseText);

      // Si el usuario pidió explícitamente solo analizar la imagen sin alterar el lienzo (mode === 'advise')
      if (dto.mode === 'advise') {
        const detectedNames = (parsed.nodes || []).filter((n: any) => !n.isAnchor).map((n: any) => n.name);
        const adviceMsg =
          parsed.message ||
          `Analicé la imagen adjunta y detecté ${detectedNames.length} entidad(es): ${detectedNames.join(', ')}. No modifiqué el lienzo actual.`;
        await this.publishAiGroupChatMessage(dto, {
          message: adviceMsg,
          aiMode: 'ADVISE',
          mutatedDiagram: false,
          targetNodes: detectedNames,
          providerUsed,
          modelUsed,
        });
        return {
          success: true,
          action: 'advise',
          intentMode: 'ADVISE',
          mutatedDiagram: false,
          message: adviceMsg,
          nodes: currentNodes,
          connections: currentConnections,
          changesSummary: `Análisis visual de imagen sin mutar lienzo (${detectedNames.length} entidades detectadas).`,
          providerUsed,
          modelUsed,
          broadcastedToRoom: dto.broadcastToRoom !== false,
        };
      }

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
      const extractedNames = updatedNodes
        .filter((n) => !n.isAnchor && (n.elementType || 'CLASS') !== 'NOTE')
        .map((n) => n.name)
        .slice(0, 8);
      const disciplineAlerts = this.analyzeOmtDiscipline(updatedNodes, updatedConnections);

      await this.broadcastAiMutation(
        dto,
        updatedNodes,
        updatedConnections,
        parsed.message || `Digitalización visual de diagrama completada (${updatedNodes.length} clases detectadas)`,
        extractedNames,
        providerUsed,
        modelUsed,
      );

      return {
        success: true,
        action: 'vision_extract',
        intentMode: 'MUTATE',
        mutatedDiagram: true,
        message: parsed.message || `Se digitalizaron ${updatedNodes.length} clases y ${updatedConnections.length} relaciones desde la imagen.`,
        nodes: updatedNodes,
        connections: updatedConnections,
        changesSummary: `Digitalización visual completada: ${updatedNodes.length} clases y ${updatedConnections.length} relaciones extraídas.`,
        providerUsed,
        modelUsed,
        disciplineAlerts,
        broadcastedToRoom: dto.broadcastToRoom !== false,
      };
    } catch (err: any) {
      this.logger.error(`Error procesando visión de diagrama IA: ${err.message || err}`);
      return {
        success: false,
        action: 'error',
        intentMode: 'MUTATE',
        mutatedDiagram: false,
        message: `No se pudo digitalizar la imagen: ${err.message || 'Error de procesamiento'}. Por favor intenta con una imagen más nítida o en formato PNG/JPEG.`,
        nodes: currentNodes,
        connections: currentConnections,
        changesSummary: 'Fallo al procesar imagen con Visión IA.',
        providerUsed,
        modelUsed,
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

    const singleTableAddMatch = prompt.match(
      /(?:crea(?:r)?|agrega(?:r)?|a[ñn]ade(?:r)?|inserta(?:r)?)\s+(?:una\s+|la\s+)?(?:nueva\s+)?(?:tabla|clase|entidad)\s*(?:(?:llamada|denominada|de|para)\s+)?([a-zA-Z0-9_]+)/i,
    );
    const requestedTableName = singleTableAddMatch ? this.normalizeForFuzzy(singleTableAddMatch[1]) : null;

    const mergedNodesMap = new Map<string, UmlClassNode>();

    if (isFullGeneration && aiNodes.length > 0) {
      for (const node of aiNodes) {
        const id = node.id || `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        mergedNodesMap.set(id, { ...node, id });
      }
    } else if (isDeletePrompt && aiNodes.length === 0) {
      return { nodes: [], connections: [] };
    } else if (isDeletePrompt && aiNodes.length > 0) {
      for (const aiNode of aiNodes) {
        if (!aiNode || !aiNode.name) continue;
        const existingNode = this.findNodeFuzzy(currentNodes, aiNode.name);

        if (existingNode) {
          mergedNodesMap.set(existingNode.id, {
            ...existingNode,
            name: aiNode.name || existingNode.name,
            ...(aiNode.elementType || existingNode.elementType
              ? { elementType: aiNode.elementType || existingNode.elementType }
              : {}),
            ...(aiNode.stereotype !== undefined || existingNode.stereotype !== undefined
              ? { stereotype: aiNode.stereotype ?? existingNode.stereotype }
              : {}),
            ...(aiNode.noteContent !== undefined || existingNode.noteContent !== undefined
              ? { noteContent: aiNode.noteContent ?? existingNode.noteContent }
              : {}),
            attributes: Array.isArray(aiNode.attributes)
              ? this.mergePreservedAttributes(existingNode.attributes || [], aiNode.attributes)
              : existingNode.attributes,
            methods: Array.isArray(aiNode.methods)
              ? this.mergePreservedMethods(existingNode.methods || [], aiNode.methods)
              : existingNode.methods,
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
      for (const node of currentNodes) {
        mergedNodesMap.set(node.id, { ...node });
      }

      let maxPosX = currentNodes.reduce((max, n) => Math.max(max, n.position.x + (n.width || 220)), 50);
      const maxPosY = 80;

      for (const aiNode of aiNodes) {
        if (!aiNode || !aiNode.name) continue;
        const existingNode = this.findNodeFuzzy(Array.from(mergedNodesMap.values()), aiNode.name);

        if (existingNode) {
          mergedNodesMap.set(existingNode.id, {
            ...existingNode,
            name: aiNode.name || existingNode.name,
            ...(aiNode.elementType || existingNode.elementType
              ? { elementType: aiNode.elementType || existingNode.elementType }
              : {}),
            ...(aiNode.stereotype !== undefined || existingNode.stereotype !== undefined
              ? { stereotype: aiNode.stereotype ?? existingNode.stereotype }
              : {}),
            ...(aiNode.noteContent !== undefined || existingNode.noteContent !== undefined
              ? { noteContent: aiNode.noteContent ?? existingNode.noteContent }
              : {}),
            attributes: Array.isArray(aiNode.attributes)
              ? this.mergePreservedAttributes(existingNode.attributes || [], aiNode.attributes)
              : existingNode.attributes,
            methods: Array.isArray(aiNode.methods)
              ? this.mergePreservedMethods(existingNode.methods || [], aiNode.methods)
              : existingNode.methods,
          });
        } else {
          if (requestedTableName && !asksForRelations) {
            const newAiNodes = aiNodes.filter(
              (n) => !currentNodes.some((cn) => cn.id === n.id || this.normalizeForFuzzy(cn.name) === this.normalizeForFuzzy(n.name)),
            );
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
            ...(aiNode.elementType ? { elementType: aiNode.elementType } : {}),
            ...(aiNode.stereotype ? { stereotype: aiNode.stereotype } : {}),
            ...(aiNode.noteContent !== undefined ? { noteContent: aiNode.noteContent } : {}),
            position: { x: posX, y: posY },
            width: aiNode.width || 220,
            attributes: aiNode.attributes || [],
            methods: aiNode.methods || [],
          };

          mergedNodesMap.set(newId, newNode);
        }
      }
    }

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

    for (const [nodeId, node] of mergedNodesMap.entries()) {
      if (node.isAnchor) {
        const hasActiveConn = currentConnections.some((c) => {
          const sId = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
          const tId = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
          return (
            (c.assocAnchorNodeId === nodeId || sId === nodeId || tId === nodeId) &&
            remainingNodeIds.has(sId) &&
            remainingNodeIds.has(tId)
          );
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

    const mergedConnsMap = new Map<string, UmlConnection>();
    const mergedNodeIds = new Set(mergedNodes.map((n) => n.id));

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
      return mergedNodes.find((n) => n.id === clean) || this.findNodeFuzzy(mergedNodes, clean);
    };

    for (const aiConn of aiConnections) {
      const sourceNode = resolveNode(aiConn.sourceNodeId || aiConn.sourceId);
      const targetNode = resolveNode(aiConn.targetNodeId || aiConn.targetId);

      if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
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

  private async broadcastAiMutation(
    dto: {
      diagramId: string;
      roomCode?: string;
      authorUserId?: string;
      authorUserName?: string;
      broadcastToRoom?: boolean;
      persistChanges?: boolean;
    },
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    summary: string,
    affectedClasses: string[] = [],
    providerUsed?: string,
    modelUsed?: string,
  ): Promise<void> {
    try {
      const { diagramId, roomCode } = dto;
      if (
        dto.persistChanges === true &&
        isValidUuid(diagramId) &&
        this.diagramService &&
        typeof this.diagramService.saveAst === 'function'
      ) {
        await this.diagramService.saveAst(
          diagramId,
          {
            nodes: nodes.map((n, nIdx) => ({
              id: n.id,
              name: n.name,
              elementType: (n.elementType as any) || (n.assocMainConnId ? 'ASSOCIATION_CLASS' : 'CLASS'),
              stereotype: n.stereotype ?? null,
              noteContent: n.noteContent ?? null,
              positionX: n.position?.x ?? 100 + (nIdx % 3) * 240,
              positionY: n.position?.y ?? 80 + Math.floor(nIdx / 3) * 200,
              width: n.isAnchor ? 0 : (n.width ?? 220),
              height: n.height ?? null,
              isAnchor: Boolean(n.isAnchor),
              assocMainConnId: n.assocMainConnId ?? null,
              attributes: (n.attributes || []).map((a, idx) => ({
                name: a.name,
                type: a.type,
                visibility: (a.visibility as any) || '-',
                isPrimaryKey: Boolean(a.isPrimaryKey),
                isNullable: a.isNullable ?? !a.isPrimaryKey,
                orderIndex: idx,
              })),
              methods: (n.methods || []).map((m, idx) => ({
                name: m.name,
                parameters: m.parameters || '',
                returnType: m.returnType || 'void',
                visibility: (m.visibility as any) || '+',
                orderIndex: idx,
              })),
            })),
            connections: connections.map((c) => ({
              id: c.id,
              sourceNodeId: c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, ''),
              targetNodeId: c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, ''),
              sourceId: c.sourceId,
              targetId: c.targetId,
              type: c.type,
              lineStyle: c.lineStyle || 'segment',
              name: c.name ?? null,
              sourceMultiplicity: c.sourceMultiplicity || '',
              targetMultiplicity: c.targetMultiplicity || '',
              assocAnchorNodeId: c.assocAnchorNodeId ?? null,
            })),
          },
          isValidUuid(dto.authorUserId || '') ? dto.authorUserId : undefined,
          {
            actorType: 'ai',
            actorName: dto.authorUserName ? `✨ Copilot IA (vía ${dto.authorUserName})` : '✨ Copilot IA',
            recordEvent: false,
          },
        );
      }

      const syncPayload = {
        nodes,
        connections,
        userId: 'ai_copilot_vertex',
        userName: '✨ Copilot IA',
        action: 'ai_mutation',
      };

      if (this.collaborationGateway?.server) {
        if (diagramId) {
          this.collaborationGateway.server.to(`diagram_${diagramId}`).emit('diagram_synced', syncPayload);
        } else if (roomCode) {
          this.collaborationGateway.server.to(roomCode).emit('diagram_synced', syncPayload);
        }
      }

      if (dto.broadcastToRoom !== false) {
        if (
          isValidUuid(diagramId) &&
          typeof this.collaborationGateway?.broadcastAiGroupMessage === 'function'
        ) {
          await this.collaborationGateway.broadcastAiGroupMessage(diagramId, roomCode, {
            message: summary,
            aiMode: 'MUTATE',
            requestedByUserId: dto.authorUserId,
            requestedByUserName: dto.authorUserName,
            targetNodes: affectedClasses,
            mutatedDiagram: true,
            providerUsed,
            modelUsed,
          });
        } else if (this.collaborationGateway?.server) {
          const chatPayload = {
            userId: 'ai_copilot_vertex',
            userName: '✨ Copilot IA (Vertex AI)',
            senderType: 'ai',
            aiMode: 'MUTATE',
            mutatedDiagram: true,
            requestedByUserName: dto.authorUserName || null,
            message: `🤖 ${summary}`,
            timestamp: new Date().toISOString(),
          };
          if (diagramId) {
            this.collaborationGateway.server.to(`diagram_${diagramId}`).emit('chat_message_received', chatPayload);
          } else if (roomCode) {
            this.collaborationGateway.server.to(roomCode).emit('chat_message_received', chatPayload);
          }
        }
      }

      if (isValidUuid(diagramId) && this.yjsSyncService) {
        await this.yjsSyncService.recordAuthorEvent({
          diagramId,
          roomCode,
          actorType: 'ai',
          userId: 'ai_copilot_partner',
          userName: '✨ Copilot IA',
          category: 'ai',
          action: dto.authorUserName
            ? `Editó el diagrama por solicitud de ${dto.authorUserName}`
            : 'Editó el diagrama UML con Copilot IA',
          detail: summary.slice(0, 180),
          affectedClasses,
          color: '#8B5CF6',
        });
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
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
      const sElType = (sourceNode.elementType || 'CLASS').toUpperCase();
      const tElType = (targetNode.elementType || 'CLASS').toUpperCase();
      if (['NOTE', 'INTERFACE', 'ENUM'].includes(sElType) || ['NOTE', 'INTERFACE', 'ENUM'].includes(tElType)) {
        continue;
      }

      const isMn = isMany(conn.sourceMultiplicity) && isMany(conn.targetMultiplicity);
      if (!isMn) continue;

      const sStems = getStems(sourceNode.name);
      const tStems = getStems(targetNode.name);

      const candidates: { node: UmlClassNode; score: number }[] = [];

      for (const n of nodeMap.values()) {
        if (n.id === sourceNode.id || n.id === targetNode.id || n.isAnchor) continue;
        const nElType = (n.elementType || 'CLASS').toUpperCase();
        if (['NOTE', 'INTERFACE', 'ENUM'].includes(nElType)) continue;

        let score = 0;

        if (n.assocMainConnId === conn.id) {
          score += 100;
        }

        if (conn.assocAnchorNodeId) {
          const isLinkedToAnchor = Array.from(connMap.values()).some(
            (c) =>
              c.type === 'association_class' &&
              ((c.sourceNodeId === conn.assocAnchorNodeId && (c.targetNodeId === n.id || c.targetId?.startsWith(n.id))) ||
                (c.targetNodeId === conn.assocAnchorNodeId && (c.sourceNodeId === n.id || c.sourceId?.startsWith(n.id)))),
          );
          if (isLinkedToAnchor) score += 90;
        }

        const hasAssocClassLink = Array.from(connMap.values()).some(
          (c) =>
            c.type === 'association_class' &&
            ((c.targetNodeId === n.id || c.targetId?.startsWith(n.id)) ||
              (c.sourceNodeId === n.id || c.sourceId?.startsWith(n.id))),
        );
        if (hasAssocClassLink) score += 30;

        const nClean = cleanStr(n.name);
        const hasSourceStem = sStems.some((s) => matchesStem(nClean, s));
        const hasTargetStem = tStems.some((t) => matchesStem(nClean, t));
        if (hasSourceStem && hasTargetStem) {
          score += 70;
        }

        if (conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')) {
          const connNameClean = cleanStr(conn.name);
          if (nClean === connNameClean && nClean.length >= 3) {
            score += 40;
          }
        }

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

        if (n.attributes && n.attributes.length > 0) {
          const attrNames = n.attributes.map((a) => cleanStr(a.name));
          const hasSourceAttr = attrNames.some((a) => sStems.some((s) => matchesStem(a, s)));
          const hasTargetAttr = attrNames.some((a) => tStems.some((t) => matchesStem(a, t)));
          if (hasSourceAttr && hasTargetAttr) {
            score += 45;
          }
        }

        const isLegitCandidate =
          n.assocMainConnId === conn.id ||
          (hasSourceStem && hasTargetStem) ||
          score >= 90;

        if (isLegitCandidate && score >= 40) {
          candidates.push({ node: n, score });
        }
      }

      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.node.attributes?.length || 0) - (a.node.attributes?.length || 0);
      });

      let assocNode: UmlClassNode;

      if (candidates.length > 0) {
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

        if (candidates.length > 1) {
          for (let i = 1; i < candidates.length; i++) {
            const redundant = candidates[i].node;
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
        resolvedCount++;
        const timestamp = Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
        const assocNodeId = `node_${timestamp}_assoc`;
        const assocName =
          conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')
            ? conn.name
            : `${sourceNode.name}_${targetNode.name}`;

        const anchorPosX = Math.round((sourceNode.position.x + targetNode.position.x) / 2);
        const anchorPosY = Math.round((sourceNode.position.y + targetNode.position.y) / 2);

        const assocPosX = Math.max(50, anchorPosX - 110);
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

        const pkAttr =
          (node.attributes || []).find((a) => /^(id|.*_id|.*id)$/i.test(a.name.trim())) ||
          (node.attributes || [])[0];

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

      let anchorNode: UmlClassNode | undefined;
      if (conn.assocAnchorNodeId && nodeMap.has(conn.assocAnchorNodeId)) {
        anchorNode = nodeMap.get(conn.assocAnchorNodeId);
      }

      if (!anchorNode) {
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
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
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
      const trimmed = raw.trim();
      const clean = trimmed.toLowerCase();
      if (clean === 'int') return 'Integer';
      if (clean === 'datetime') return 'LocalDateTime';
      if (clean === 'bool') return 'Boolean';
      if (clean === 'number') return 'Double';
      const standard = validTypes.find((t) => t.toLowerCase() === clean);
      if (standard) return standard;
      return /^[A-Za-z_][A-Za-z0-9_<>\[\]]*$/.test(trimmed) ? trimmed : 'String';
    };

    return nodes.map((node, index) => {
      const seenAttrs = new Set<string>();
      const dedupedAttributes: UmlAttributeNode[] = [];
      for (const attr of node.attributes || []) {
        const name = (attr.name || 'attr').trim();
        const lower = name.toLowerCase();
        if (!seenAttrs.has(lower)) {
          seenAttrs.add(lower);
          const cleanAttr: UmlAttributeNode = {
            name,
            type: normalizeType(attr.type),
          };
          if (attr.visibility !== undefined) cleanAttr.visibility = attr.visibility;
          if (attr.isPrimaryKey !== undefined) cleanAttr.isPrimaryKey = Boolean(attr.isPrimaryKey);
          if (attr.isNullable !== undefined) cleanAttr.isNullable = Boolean(attr.isNullable);
          dedupedAttributes.push(cleanAttr);
        }
      }

      const seenMethods = new Set<string>();
      const dedupedMethods: UmlMethodNode[] = [];
      for (const m of node.methods || []) {
        const key = `${(m.name || 'operation').trim()}(${(m.parameters || '').trim()})`.toLowerCase();
        if (!seenMethods.has(key)) {
          seenMethods.add(key);
          const cleanMethod: UmlMethodNode = {
            name: m.name || 'operation',
            parameters: m.parameters || '',
            returnType: m.returnType || 'void',
          };
          if (m.visibility !== undefined) cleanMethod.visibility = m.visibility;
          dedupedMethods.push(cleanMethod);
        }
      }

      const safeId =
        node.id && typeof node.id === 'string' && node.id.trim() !== ''
          ? node.id.trim()
          : `node_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;

      const posX = typeof node.position?.x === 'number' ? node.position.x : 120 + ((index * 260) % 780);
      const posY = typeof node.position?.y === 'number' ? node.position.y : 80 + Math.floor((index * 260) / 780) * 220;

      const sanitized: UmlClassNode = {
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
      if (node.elementType !== undefined) sanitized.elementType = node.elementType;
      if (node.stereotype !== undefined) sanitized.stereotype = node.stereotype;
      if (node.noteContent !== undefined) sanitized.noteContent = node.noteContent;
      return sanitized;
    });
  }

  private mergePreservedAttributes(
    existingAttrs: UmlAttributeNode[],
    incomingAttrs: UmlAttributeNode[],
  ): UmlAttributeNode[] {
    const existingByName = new Map(existingAttrs.map((a) => [a.name.trim().toLowerCase(), a]));
    return incomingAttrs.map((attr) => {
      const prev = existingByName.get((attr.name || '').trim().toLowerCase());
      if (!prev) return attr;
      const merged: UmlAttributeNode = { ...attr };
      if (merged.visibility === undefined && prev.visibility !== undefined) merged.visibility = prev.visibility;
      if (merged.isPrimaryKey === undefined && prev.isPrimaryKey !== undefined) merged.isPrimaryKey = prev.isPrimaryKey;
      if (merged.isNullable === undefined && prev.isNullable !== undefined) merged.isNullable = prev.isNullable;
      return merged;
    });
  }

  private mergePreservedMethods(
    existingMethods: UmlMethodNode[],
    incomingMethods: UmlMethodNode[],
  ): UmlMethodNode[] {
    const existingByName = new Map(
      existingMethods.map((m) => [`${(m.name || '').trim()}(${(m.parameters || '').trim()})`.toLowerCase(), m]),
    );
    return incomingMethods.map((m) => {
      const key = `${(m.name || '').trim()}(${(m.parameters || '').trim()})`.toLowerCase();
      const prev = existingByName.get(key);
      if (!prev) return m;
      const merged: UmlMethodNode = { ...m };
      if (merged.visibility === undefined && prev.visibility !== undefined) merged.visibility = prev.visibility;
      return merged;
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
      .filter((conn) => nodeMap.has(conn.sourceNodeId || '') && nodeMap.has(conn.targetNodeId || ''));
  }

  private async tryDeterministicMutateFallback(
    dto: AiPromptDto,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): Promise<AiResponseDto | null> {
    const rawPrompt = (dto.prompt || '').trim();
    if (!rawPrompt) return null;

    // Quitar menciones @IA y cortesías iniciales manteniendo nombres/tipos exactos
    const cleanPrompt = rawPrompt
      .replace(/^@(?:ia|ai|copilot)\b[:,\s-]*/i, '')
      .replace(/^[¿?\s]*(?:por\s+favor[,\s]+|(?:me\s+)?(?:puedes|podr[ií]as|hazme\s+el\s+favor\s+de)\s+)/i, '')
      .replace(/[?!.]+$/g, '')
      .trim();

    if (!cleanPrompt) return null;

    let workingNodes: UmlClassNode[] = currentNodes.map((n) => ({
      ...n,
      position: { x: n.position?.x ?? 100, y: n.position?.y ?? 80 },
      attributes: (n.attributes || []).map((a) => ({ ...a })),
      methods: (n.methods || []).map((m) => ({ ...m })),
    }));
    let workingConnections: UmlConnection[] = currentConnections.map((c) => ({ ...c }));
    let summary = '';

    // 1. Resolver tablas intermedias M:N existentes cuando no se pide crear otra clase específica
    if (
      /(?:genera(?:r)?|resuelve|materializa(?:r)?)\s+(?:la\s+|las\s+)?tablas?\s+(?:intermedias?|asociativas?)/i.test(cleanPrompt) &&
      !/(?:crea(?:r)?|agrega(?:r)?)\s+(?:una\s+|la\s+)?(?:tabla|clase)\s+[A-Za-z_]/i.test(cleanPrompt)
    ) {
      const resolved = this.resolveManyToManyRelationships(workingNodes, workingConnections);
      if (resolved.resolvedCount > 0) {
        workingNodes = resolved.nodes;
        workingConnections = resolved.connections;
        summary = `Se materializó la tabla asociativa intermedia para ${resolved.resolvedCount} relación(es) muchos a muchos.`;
      }
    }

    // 2. Renombrar clase / tabla
    if (!summary) {
      const renameMatch = cleanPrompt.match(
        /^(?:renombra(?:r)?|cambia(?:r)?\s+(?:el\s+)?nombre\s+(?:de\s+)?(?:la\s+)?(?:tabla|clase|entidad)?)\s+(?:la\s+|el\s+)?(?:tabla|clase|entidad)?\s*["'«<]?([A-Za-z0-9_\s]+?)["'»>]?\s+(?:a|por|hacia)\s+["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?$/i,
      );
      if (renameMatch) {
        const target = this.findNodeFuzzy(workingNodes, renameMatch[1].trim());
        const newName = renameMatch[2].trim();
        if (target && newName) {
          const oldName = target.name;
          target.name = newName;
          summary = `Clase "${oldName}" renombrada a "${newName}".`;
        }
      }
    }

    // 3. Eliminar todos los atributos de una tabla (preservando la tabla)
    if (!summary) {
      const deleteAllAttrsMatch = cleanPrompt.match(
        /^(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos?\s+(?:los\s+)?|los\s+)?atributos?\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (deleteAllAttrsMatch) {
        const target = this.findNodeFuzzy(workingNodes, deleteAllAttrsMatch[1].trim());
        if (target) {
          target.attributes = [];
          summary = `Se eliminaron todos los atributos de la clase ${target.name} conservando la tabla.`;
        }
      }
    }

    // 4. Eliminar un atributo específico de una tabla
    if (!summary) {
      const deleteAttrMatch = cleanPrompt.match(
        /^(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|remueve)\s+(?:el\s+|la\s+)?(?:atributo|campo|columna)\s+([A-Za-z0-9_]+)\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (deleteAttrMatch) {
        const attrName = deleteAttrMatch[1].trim().toLowerCase();
        const target = this.findNodeFuzzy(workingNodes, deleteAttrMatch[2].trim());
        if (target) {
          const beforeLen = target.attributes.length;
          target.attributes = target.attributes.filter((a) => a.name.trim().toLowerCase() !== attrName);
          if (target.attributes.length !== beforeLen) {
            summary = `Atributo "${deleteAttrMatch[1].trim()}" eliminado de ${target.name}.`;
          }
        }
      }
    }

    // 5. Eliminar todos los métodos de una tabla
    if (!summary) {
      const deleteMethodsMatch = cleanPrompt.match(
        /^(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos?\s+(?:los\s+)?|los\s+)?m[eé]todos?\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (deleteMethodsMatch) {
        const target = this.findNodeFuzzy(workingNodes, deleteMethodsMatch[1].trim());
        if (target) {
          target.methods = [];
          summary = `Se eliminaron todos los métodos de la clase ${target.name}.`;
        }
      }
    }

    // 6. Eliminar tabla / clase específica (+ cascada M:N)
    if (!summary && !/(?:atributos?|campos?|m[eé]todos?|columnas?|todas?\s+las?\s+)/i.test(cleanPrompt)) {
      const deleteClassMatch = cleanPrompt.match(
        /^(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|suprime|remueve|delete|remove)\s+(?:la\s+|el\s+)?(?:tabla|clase|entidad)\s*(?:de\s+)?["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (deleteClassMatch) {
        const target = this.findNodeFuzzy(workingNodes, deleteClassMatch[1].trim());
        if (target) {
          const remaining = workingNodes.filter((n) => n.id !== target.id);
          const cascade = this.mergeNodesAndConnections(
            workingNodes,
            workingConnections,
            remaining,
            [],
            cleanPrompt,
          );
          workingNodes = cascade.nodes;
          workingConnections = cascade.connections;
          summary = `Clase "${target.name}" y sus conexiones asociadas eliminadas del diagrama.`;
        }
      }
    }

    // 7. Cambiar tipo de un atributo existente
    if (!summary) {
      const changeTypeMatch = cleanPrompt.match(
        /^(?:cambia(?:r)?|modifica(?:r)?|actualiza(?:r)?)\s+(?:el\s+tipo\s+(?:del?\s+)?)?(?:atributo|campo|columna)?\s*([A-Za-z_][A-Za-z0-9_]*)\s+a\s+([A-Za-z_][A-Za-z0-9_<>[\]]*)\s+(?:en|de)\s+(?:la\s+)?(?:tabla|clase|entidad)?\s*["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (changeTypeMatch) {
        const attrKey = changeTypeMatch[1].trim().toLowerCase();
        const newType = changeTypeMatch[2].trim();
        const target = this.findNodeFuzzy(workingNodes, changeTypeMatch[3].trim());
        if (target) {
          const attr = target.attributes.find((a) => a.name.trim().toLowerCase() === attrKey);
          if (attr) {
            attr.type = newType;
            summary = `Tipo del atributo "${attr.name}" actualizado a ${newType} en ${target.name}.`;
          }
        }
      }
    }

    // 8. Agregar método a una clase existente
    if (!summary) {
      const addMethodMatch = cleanPrompt.match(
        /^(?:agrega(?:r)?|a[ñn]ad(?:e|ir)|crea(?:r)?)\s+(?:el\s+|un\s+)?m[eé]todo\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?(?:\s*:\s*([A-Za-z0-9_<>[\]]+))?\s+(?:a|en)\s+(?:la\s+)?(?:tabla|clase|entidad)?\s*["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      if (addMethodMatch) {
        const methodName = addMethodMatch[1].trim();
        const params = (addMethodMatch[2] || '').trim();
        const returnType = (addMethodMatch[3] || 'void').trim();
        const target = this.findNodeFuzzy(workingNodes, addMethodMatch[4].trim());
        if (target) {
          const dup = target.methods.some(
            (m) => m.name.trim().toLowerCase() === methodName.toLowerCase() && (m.parameters || '').trim() === params,
          );
          if (!dup) {
            target.methods.push({ name: methodName, parameters: params, returnType, visibility: '+' });
          }
          summary = `Método "${methodName}(${params}): ${returnType}" agregado a ${target.name}.`;
        }
      }
    }

    // 9. Agregar atributo(s) a una clase existente ("Agrega atributo id UUID a Pedido" o "Agrega email String a Usuario")
    if (!summary) {
      let attrsSpec = '';
      let targetClassQuery = '';
      const addAttrsMatch1 = cleanPrompt.match(
        /^(?:agrega(?:r)?|a[ñn]ad(?:e|ir)|crea(?:r)?|inserta(?:r)?)\s+(?:(?:el|los|un|unos)\s+)?(?:atributos?|campos?|columnas?|propiedades?)\s+(.+?)\s+(?:a|en|para)\s+(?:la\s+)?(?:tabla|clase|entidad)?\s*["'«<]*([A-Za-z0-9_\s]+?)["'»>]*$/i,
      );
      const addAttrsMatch2 = cleanPrompt.match(
        /^(?:agrega(?:r)?|a[ñn]ad(?:e|ir))\s+(?:a|en)\s+(?:la\s+)?(?:tabla|clase|entidad)?\s*["'«<]*([A-Za-z0-9_\s]+?)["'»>]*\s+(?:los?\s+|el\s+)?(?:atributos?|campos?|columnas?)\s+(.+)$/i,
      );
      const addAttrsMatch3 = cleanPrompt.match(
        /^(?:agrega(?:r)?|a[ñn]ad(?:e|ir)|inserta(?:r)?)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+?)\s+(?:a|en)\s+(?:(?:la|el)\s+)?(?:(?:tabla|clase|entidad)\s+)?["'«<]*([A-Za-z_][A-Za-z0-9_\s]*?)["'»>]*$/i,
      );

      if (addAttrsMatch1) {
        attrsSpec = addAttrsMatch1[1].trim();
        targetClassQuery = addAttrsMatch1[2].trim();
      } else if (addAttrsMatch2) {
        targetClassQuery = addAttrsMatch2[1].trim();
        attrsSpec = addAttrsMatch2[2].trim();
      } else if (
        addAttrsMatch3 &&
        !/^(?:una?|la)\s+(?:tabla|clase|entidad|interfaz|enum|nota|relaci[oó]n)\b/i.test(addAttrsMatch3[1].trim()) &&
        !/^m[eé]todo\b/i.test(addAttrsMatch3[1].trim()) &&
        !/\b(?:con|relaci[oó]n|relacionala|conecta|vincula|asocia)\b/i.test(addAttrsMatch3[1].trim()) &&
        this.findNodeFuzzy(workingNodes, addAttrsMatch3[2].trim())
      ) {
        attrsSpec = addAttrsMatch3[1].trim();
        targetClassQuery = addAttrsMatch3[2].trim();
      }

      if (attrsSpec && targetClassQuery) {
        const target = this.findNodeFuzzy(workingNodes, targetClassQuery);
        if (target) {
          const parsedAttrs = this.parseAttributeListDeterministically(attrsSpec);
          if (parsedAttrs.length > 0) {
            for (const attr of parsedAttrs) {
              const existingIdx = target.attributes.findIndex(
                (a) => a.name.trim().toLowerCase() === attr.name.toLowerCase(),
              );
              if (existingIdx >= 0) {
                target.attributes[existingIdx] = { ...target.attributes[existingIdx], ...attr };
              } else {
                target.attributes.push(attr);
              }
            }
            summary = `Se agregaron ${parsedAttrs.length} atributo(s) (${parsedAttrs.map((a) => a.name).join(', ')}) a la clase ${target.name}.`;
          }
        }
      }
    }

    // 10. Relacionar dos clases ("Relaciona Pedido con Cliente..." o "Composición 1 a 1..* entre Factura y FacturaDetalle")
    if (!summary) {
      const connectOnlyMatch = cleanPrompt.match(
        /^(?:relaciona(?:r)?|conecta(?:r)?|vincula(?:r)?|asocia(?:r)?)\s+(?:la\s+(?:tabla|clase|entidad)\s+)?["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?\s+(?:con|a|y)\s+(.+)$/i,
      );
      if (connectOnlyMatch) {
        const source = this.findNodeFuzzy(workingNodes, connectOnlyMatch[1].trim());
        const relSpec = this.parseRelationClauseDeterministically(connectOnlyMatch[2].trim());
        if (source && relSpec) {
          let target = this.findNodeFuzzy(workingNodes, relSpec.targetName);
          if (!target) {
            const pos = this.findNextFreeCanvasPosition(workingNodes);
            target = {
              id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: relSpec.targetName,
              elementType: 'CLASS',
              position: pos,
              width: 220,
              attributes: [{ name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false }],
              methods: [],
            };
            workingNodes.push(target);
          }
          if (source.id !== target.id) {
            workingConnections.push({
              id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              sourceNodeId: source.id,
              targetNodeId: target.id,
              sourceId: `${source.id}_right`,
              targetId: `${target.id}_left`,
              type: relSpec.type,
              lineStyle: 'segment',
              sourceMultiplicity: relSpec.sourceMult,
              targetMultiplicity: relSpec.targetMult,
            });
            summary = `Relación ${relSpec.type} creada entre ${source.name} (${relSpec.sourceMult}) y ${target.name} (${relSpec.targetMult}).`;
          }
        }
      }
    }

    if (!summary) {
      const betweenRelMatch = cleanPrompt.match(
        /^(?:(?:crea(?:r)?|agrega(?:r)?|a[ñn]ad(?:e|ir)|genera(?:r)?)\s+(?:una?\s+)?)?(?:relaci[oó]n(?:\s+de)?\s+)?(.+?)\s+entre\s+(?:(?:la\s+)?(?:tabla|clase|entidad)\s+)?["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?\s+y\s+(?:(?:la\s+)?(?:tabla|clase|entidad)\s+)?["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?(?:\s+(.*))?$/i,
      );
      if (
        betweenRelMatch &&
        /(?:composici[oó]n|agregaci[oó]n|asociaci[oó]n|herencia|generalizaci[oó]n|realizaci[oó]n|dependencia|relaci[oó]n|multiplicidad|cardinalidad|muchos\s+a\s+muchos|[0-9.*]+\s*(?:a|->|:)\s*[0-9.*]+)/i.test(
          `${betweenRelMatch[1]} ${betweenRelMatch[4] || ''}`,
        )
      ) {
        const rawSourceName = betweenRelMatch[2].trim();
        const relSpec = this.parseRelationClauseDeterministically(
          `${betweenRelMatch[3].trim()} ${betweenRelMatch[1].trim()} ${(betweenRelMatch[4] || '').trim()}`.trim(),
        );
        if (rawSourceName && relSpec) {
          let source = this.findNodeFuzzy(workingNodes, rawSourceName);
          if (!source) {
            const formattedSource = rawSourceName.charAt(0).toUpperCase() + rawSourceName.slice(1);
            source = {
              id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: formattedSource,
              elementType: 'CLASS',
              position: this.findNextFreeCanvasPosition(workingNodes),
              width: 220,
              attributes: [{ name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false }],
              methods: [],
            };
            workingNodes.push(source);
          }

          let target = this.findNodeFuzzy(workingNodes, relSpec.targetName);
          if (!target) {
            target = {
              id: `node_${Date.now() + 1}_${Math.random().toString(36).substring(2, 6)}`,
              name: relSpec.targetName,
              elementType: 'CLASS',
              position: this.findNextFreeCanvasPosition(workingNodes),
              width: 220,
              attributes: [{ name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false }],
              methods: [],
            };
            workingNodes.push(target);
          }

          if (source.id !== target.id) {
            workingConnections.push({
              id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              sourceNodeId: source.id,
              targetNodeId: target.id,
              sourceId: `${source.id}_right`,
              targetId: `${target.id}_left`,
              type: relSpec.type,
              lineStyle: 'segment',
              sourceMultiplicity: relSpec.sourceMult,
              targetMultiplicity: relSpec.targetMult,
            });
            summary = `Relación ${relSpec.type} creada entre ${source.name} (${relSpec.sourceMult}) y ${target.name} (${relSpec.targetMult}).`;
          }
        }
      }
    }

    // 11. Crear / actualizar clase o tabla (opcionalmente con atributos y relación posterior)
    if (!summary) {
      const relSplitRegex =
        /\s+(?:y\s+|,\s*y\s+)?(?:relaci[oó]n(?:a(?:la|lo|r(?:la|lo)?)?)?|con[eé]cta(?:la|lo|r(?:la|lo)?)?|vincul[ae](?:la|lo|r(?:la|lo)?)?|asoci[ae](?:la|lo|r(?:la|lo)?)?)\s+(?:con|a|hacia)\s+/i;
      const splitParts = cleanPrompt.split(relSplitRegex);
      const mainPart = (splitParts[0] || '').trim();
      const relationPart = splitParts.length > 1 ? splitParts.slice(1).join(' ').trim() : '';

      const createMatch = mainPart.match(
        /^(?:crea(?:r)?|agrega(?:r)?|a[ñn]ad(?:e|ir)|inserta(?:r)?|genera(?:r)?|define|create|add)\s+(?:(?:una?|la|el)\s+)?(?:(?:nueva?)\s+)?(tabla|clase|entidad|interfaz|interface|enum(?:eraci[oó]n)?|nota)?\s*(?:(?:llamad[oa]|denominad[oa]|con\s+nombre)\s+)?["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?(?:\s+(?:con|with)(?:\s+(?:los\s+|sus\s+)?(?:atributos?|campos?|columnas?|propiedades?|literales?|values?))?\s+(.+)|\s*\(([^)]+)\))?$/i,
      );

      const reservedNonClassWords = new Set([
        'atributo', 'atributos', 'campo', 'campos', 'columna', 'columnas',
        'metodo', 'método', 'metodos', 'métodos', 'relacion', 'relación',
        'una', 'un', 'la', 'el', 'los', 'las', 'todo', 'todas', 'todos',
      ]);

      if (createMatch) {
        const elementKeyword = (createMatch[1] || 'clase').toLowerCase();
        const rawClassName = (createMatch[2] || '').trim();
        const attrRaw = (createMatch[3] || createMatch[4] || '').trim();

        if (rawClassName && (!reservedNonClassWords.has(rawClassName.toLowerCase()) || Boolean(createMatch[1]))) {
          let elementType = 'CLASS';
          if (elementKeyword.startsWith('interfa')) elementType = 'INTERFACE';
          else if (elementKeyword.startsWith('enum')) elementType = 'ENUM';
          else if (elementKeyword === 'nota') elementType = 'NOTE';

          const formattedName = rawClassName.charAt(0).toUpperCase() + rawClassName.slice(1);
          const parsedAttrs =
            elementType === 'ENUM'
              ? attrRaw
                .split(/[,;\n]|\s+y\s+/i)
                .map((v) => v.trim().toUpperCase())
                .filter(Boolean)
                .map((name) => ({ name, type: 'String', visibility: '+' }))
              : attrRaw
                ? this.parseAttributeListDeterministically(attrRaw)
                : [];

          let primaryNode = this.findNodeFuzzy(workingNodes, formattedName);
          if (primaryNode) {
            for (const attr of parsedAttrs) {
              const idx = primaryNode.attributes.findIndex(
                (a) => a.name.trim().toLowerCase() === attr.name.toLowerCase(),
              );
              if (idx >= 0) {
                primaryNode.attributes[idx] = { ...primaryNode.attributes[idx], ...attr };
              } else {
                primaryNode.attributes.push(attr);
              }
            }
          } else {
            const pos = this.findNextFreeCanvasPosition(workingNodes);
            const initialAttrs: UmlAttributeNode[] =
              elementType === 'NOTE'
                ? []
                : parsedAttrs.length > 0
                  ? parsedAttrs
                  : elementType === 'CLASS'
                    ? [{ name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false }]
                    : [];

            primaryNode = {
              id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: formattedName,
              elementType,
              ...(elementType === 'NOTE' && attrRaw ? { noteContent: attrRaw } : {}),
              position: pos,
              width: 220,
              attributes: initialAttrs,
              methods: [],
            };
            workingNodes.push(primaryNode);
          }

          let relMsg = '';
          if (relationPart) {
            const relSpec = this.parseRelationClauseDeterministically(relationPart);
            if (relSpec) {
              let targetNode = this.findNodeFuzzy(workingNodes, relSpec.targetName);
              if (!targetNode) {
                const targetPos = this.findNextFreeCanvasPosition(workingNodes);
                targetNode = {
                  id: `node_${Date.now() + 1}_${Math.random().toString(36).substring(2, 6)}`,
                  name: relSpec.targetName,
                  elementType: 'CLASS',
                  position: targetPos,
                  width: 220,
                  attributes: [
                    { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false },
                  ],
                  methods: [],
                };
                workingNodes.push(targetNode);
              }

              if (targetNode.id !== primaryNode.id) {
                workingConnections.push({
                  id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  sourceNodeId: primaryNode.id,
                  targetNodeId: targetNode.id,
                  sourceId: `${primaryNode.id}_right`,
                  targetId: `${targetNode.id}_left`,
                  type: relSpec.type,
                  lineStyle: 'segment',
                  sourceMultiplicity: relSpec.sourceMult,
                  targetMultiplicity: relSpec.targetMult,
                });
                relMsg = ` y relacionada con ${targetNode.name} (${relSpec.sourceMult} .. ${relSpec.targetMult})`;
              }
            }
          }

          summary = `Clase "${primaryNode.name}" procesada con ${primaryNode.attributes.length} atributo(s)${relMsg} (motor UML local).`;
        }
      }
    }

    if (!summary) {
      return null;
    }

    const resolved = this.resolveManyToManyRelationships(workingNodes, workingConnections);
    const finalNodes = this.sanitizeNodes(resolved.nodes);
    const finalConnections = this.sanitizeConnections(resolved.connections, finalNodes);
    const affectedClasses = finalNodes
      .filter((n) => !n.isAnchor && (n.elementType || 'CLASS') !== 'NOTE')
      .map((n) => n.name)
      .slice(0, 8);
    const disciplineAlerts = this.analyzeOmtDiscipline(finalNodes, finalConnections);

    await this.broadcastAiMutation(
      dto,
      finalNodes,
      finalConnections,
      summary,
      affectedClasses,
      'deterministic-engine',
      'deterministic-uml-engine',
    );

    return {
      success: true,
      action: 'diagram_mutated',
      intentMode: 'MUTATE',
      mutatedDiagram: true,
      message: summary,
      nodes: finalNodes,
      connections: finalConnections,
      changesSummary: summary,
      providerUsed: 'deterministic-engine',
      modelUsed: 'deterministic-uml-engine',
      disciplineAlerts,
      broadcastedToRoom: dto.broadcastToRoom !== false,
    };
  }

  private findNextFreeCanvasPosition(existingNodes: UmlClassNode[]): { x: number; y: number } {
    const visible = existingNodes.filter((n) => !n.isAnchor);
    for (let idx = 0; idx < 60; idx++) {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = 100 + col * 280;
      const y = 80 + row * 230;
      const collides = visible.some(
        (n) => Math.abs((n.position?.x ?? 0) - x) < 220 && Math.abs((n.position?.y ?? 0) - y) < 160,
      );
      if (!collides) {
        return { x, y };
      }
    }
    return { x: 100 + (visible.length % 3) * 280, y: 80 + Math.floor(visible.length / 3) * 230 };
  }

  private parseAttributeListDeterministically(rawText: string): UmlAttributeNode[] {
    if (!rawText) return [];
    const results: UmlAttributeNode[] = [];
    const seenNames = new Set<string>();

    let normalizedRaw = rawText.trim();
    const wantsBasicFields = /\bcampos?\s+b[aá]sicos\b/i.test(normalizedRaw);
    if (wantsBasicFields) {
      normalizedRaw = normalizedRaw
        .replace(/\b(?:y\s+|,\s*)?campos?\s+b[aá]sicos\b/gi, '')
        .trim();
    }

    const pushAttr = (attr: UmlAttributeNode) => {
      const key = attr.name.trim().toLowerCase();
      if (!key || seenNames.has(key)) return;
      seenNames.add(key);
      results.push(attr);
    };

    const parts = normalizedRaw
      .split(/[,;\n]+|\s+y\s+|\s+and\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      let token = part.replace(/^(?:atributos?|campos?|columnas?)\s+/i, '').trim();
      if (!token) continue;

      let visibility = '-';
      const visMatch = token.match(/^([+\-#~])\s*(.+)$/);
      if (visMatch) {
        visibility = visMatch[1];
        token = visMatch[2].trim();
      }

      const explicitPk = /\b(?:pk|primary\s+key|clave\s+primaria)\b/i.test(token);
      const explicitNotNull = /\b(?:nn|not\s+null)\b/i.test(token);
      token = token
        .replace(/\((?:pk|nn|not\s+null)\)/gi, '')
        .replace(/\b(?:pk|primary\s+key|not\s+null)\b/gi, '')
        .trim();

      let attrName = '';
      let attrType = '';

      if (token.includes(':')) {
        const [left, right] = token.split(':').map((s) => s.trim());
        attrName = left.replace(/[^A-Za-z0-9_]/g, '');
        attrType = right.split(/\s+/)[0] || '';
      } else {
        const wsParts = token.split(/\s+/).filter(Boolean);
        attrName = (wsParts[0] || '').replace(/[^A-Za-z0-9_]/g, '');
        if (wsParts.length >= 2) {
          const candidateType = wsParts[1];
          if (/^(?:de\s+tipo|tipo)$/i.test(candidateType) && wsParts[2]) {
            attrType = wsParts[2];
          } else {
            attrType = candidateType;
          }
        }
      }

      if (!attrName) continue;

      if (!attrType) {
        if (/^(?:id|.*_id|uuid)$/i.test(attrName)) attrType = 'UUID';
        else if (/^(?:fecha|date|created.*|updated.*|.*_at|.*At)$/i.test(attrName)) attrType = 'LocalDateTime';
        else if (/^(?:activo|enabled|visible|pagado|es_.*|is_.*)$/i.test(attrName)) attrType = 'Boolean';
        else if (/^(?:cantidad|stock|edad|numero|count|orden)$/i.test(attrName)) attrType = 'Integer';
        else if (/^(?:precio|total|subtotal|monto|descuento|saldo|importe|precio_.*)$/i.test(attrName)) attrType = 'Double';
        else attrType = 'String';
      }

      const isPrimaryKey = explicitPk || /^id$/i.test(attrName);
      pushAttr({
        name: attrName,
        type: attrType,
        visibility,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : explicitNotNull ? false : true,
      });
    }

    if (wantsBasicFields) {
      pushAttr({ name: 'nombre', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false });
      pushAttr({ name: 'descripcion', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: true });
      pushAttr({ name: 'createdAt', type: 'LocalDateTime', visibility: '-', isPrimaryKey: false, isNullable: false });
    }

    return results;
  }

  private parseRelationClauseDeterministically(rawClause: string): {
    targetName: string;
    type: string;
    sourceMult: string;
    targetMult: string;
  } | null {
    const cleaned = (rawClause || '').trim();
    if (!cleaned) return null;

    const targetMatch = cleaned.match(
      /^(?:la\s+)?(?:tabla|clase|entidad)?\s*["'«<]?([A-Za-z_][A-Za-z0-9_]*)["'»>]?/i,
    );
    if (!targetMatch || !targetMatch[1]) return null;

    const rawTarget = targetMatch[1].trim();
    const targetName = rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1);

    let type = 'association';
    if (/composici[oó]n/i.test(cleaned)) type = 'composition';
    else if (/agregaci[oó]n/i.test(cleaned)) type = 'aggregation';
    else if (/herencia|generalizaci[oó]n|extiende/i.test(cleaned)) type = 'generalization';
    else if (/realizaci[oó]n|implementa/i.test(cleaned)) type = 'realization';
    else if (/dependencia|depende/i.test(cleaned)) type = 'dependency';

    let sourceMult = '1';
    let targetMult = '*';

    if (/muchos\s+a\s+muchos|\bm\s*[:-]\s*n\b/i.test(cleaned)) {
      sourceMult = '*';
      targetMult = '*';
    } else {
      const multPairMatch = cleaned.match(
        /(?:(?:multiplicidad|cardinalidad)\s+(?:de\s+)?)?(?:^|\s)([0-9]+\.\.[0-9.*]+|[0-9]+|\*)\s*(?:a|->|:)\s*([0-9]+\.\.[0-9.*]+|[0-9]+|\*)(?=\s|$)/i,
      );
      if (multPairMatch) {
        sourceMult = multPairMatch[1];
        targetMult = multPairMatch[2];
      } else {
        const singleMultMatch = cleaned.match(
          /(?:multiplicidad|cardinalidad)\s+(?:de\s+)?(\*|0\.\.\*|1\.\.\*|0\.\.1|1|muchos|uno)/i,
        );
        if (singleMultMatch) {
          const m = singleMultMatch[1].toLowerCase() === 'muchos'
            ? '*'
            : singleMultMatch[1].toLowerCase() === 'uno'
              ? '1'
              : singleMultMatch[1];
          if (m === '*' || m === '0..*' || m === '1..*') {
            sourceMult = m;
            targetMult = '1';
          } else {
            sourceMult = m;
            targetMult = '*';
          }
        }
      }
    }

    return { targetName, type, sourceMult, targetMult };
  }

  private handleFallbackPrompt(
    _dto: AiPromptDto,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): AiResponseDto {
    return {
      success: false,
      action: 'clarification_required',
      intentMode: 'MUTATE',
      mutatedDiagram: false,
      message: 'No fue posible procesar la mutación del diagrama con el motor de IA. Por favor verifica los datos ingresados.',
      nodes: currentNodes,
      connections: currentConnections,
      changesSummary: 'Operación no aplicada.',
    };
  }
}
