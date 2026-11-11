import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { UmlRelationshipType, UmlVisibility } from '../models/diagram.model';
import { TranslationService } from '../i18n';

export type VoiceCommandType =
  | 'CREATE_CLASS'
  | 'CREATE_INTERFACE'
  | 'CREATE_ENUM'
  | 'CREATE_NOTE'
  | 'ADD_ATTRIBUTE'
  | 'ADD_METHOD'
  | 'DELETE_ATTRIBUTE'
  | 'DELETE_METHOD'
  | 'CONNECT_CLASSES'
  | 'RENAME_CLASS'
  | 'DELETE_CLASS'
  | 'UNDO'
  | 'REDO'
  | 'AUDIT_MODEL'
  | 'GENERATE_SQL'
  | 'VALIDATE_XMI'
  | 'ZOOM_IN'
  | 'ZOOM_OUT'
  | 'RESET_VIEW'
  | 'CLEAR_CANVAS'
  | 'UNKNOWN';

export interface VoiceInlineAttribute {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  visibility: UmlVisibility;
}

export interface VoiceCommandPayload {
  className?: string;
  newClassName?: string;
  attributeName?: string;
  attributeType?: string;
  methodName?: string;
  returnType?: string;
  visibility?: UmlVisibility;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  inlineAttributes?: VoiceInlineAttribute[];
  enumLiterals?: string[];
  noteTitle?: string;
  noteContent?: string;
  sourceClass?: string;
  targetClass?: string;
  relationType?: UmlRelationshipType;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  relationLabel?: string;
}

export interface ParsedVoiceCommand {
  type: VoiceCommandType;
  rawTranscript: string;
  confidence: number;
  payload: VoiceCommandPayload;
  description: string;
}

const STORAGE_TTS_MUTED_KEY = 'uml_voice_tts_muted';

@Injectable({
  providedIn: 'root',
})
export class VoiceCommandService {
  private readonly translationService = inject(TranslationService, { optional: true });

  readonly isSupported = signal<boolean>(this.checkSupport());
  readonly isListening = signal<boolean>(false);
  readonly isMuted = signal<boolean>(this.loadMutePreference());
  readonly interimTranscript = signal<string>('');
  readonly lastTranscript = signal<string>('');
  readonly lastFeedback = signal<string>('');
  readonly lastCommandType = signal<VoiceCommandType | null>(null);
  readonly commandHistory = signal<ParsedVoiceCommand[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly commandDetected$ = new Subject<ParsedVoiceCommand>();

  private recognition: any = null;
  private wantListening = false;
  private lastEmittedTranscript = '';
  private lastEmittedAt = 0;

  private checkSupport(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  private loadMutePreference(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_TTS_MUTED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_TTS_MUTED_KEY, String(next));
      }
    } catch {}
    if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  toggleListening(): void {
    if (this.isListening() || this.wantListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening(): void {
    if (!this.isSupported()) {
      this.errorMessage.set('El navegador actual no soporta Web Speech API. Usa el campo de texto alternativo.');
      return;
    }
    if (this.wantListening) return;

    this.wantListening = true;
    this.errorMessage.set(null);
    this.launchRecognition();
  }

  stopListening(): void {
    this.wantListening = false;
    this.isListening.set(false);
    this.interimTranscript.set('');
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
  }

  private getSpeechLang(): string {
    const lang = this.translationService?.currentLang?.() || 'es';
    return lang === 'en' ? 'en-US' : 'es-ES';
  }

  private launchRecognition(): void {
    if (!this.wantListening || typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.lang = this.getSpeechLang();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        this.isListening.set(true);
        this.errorMessage.set(null);
      };

      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript || '';
          const confidence = Number(result?.[0]?.confidence ?? 0.9);
          if (result.isFinal) {
            this.interimTranscript.set('');
            this.processTranscript(text, confidence);
          } else {
            interim += text + ' ';
          }
        }
        if (interim.trim()) {
          this.interimTranscript.set(interim.trim());
        }
      };

      rec.onerror = (event: any) => {
        const errCode = event?.error || 'unknown';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          this.errorMessage.set('Permiso de micrófono denegado. Habilítalo en el navegador o usa comandos escritos.');
          this.stopListening();
          return;
        }
        if (errCode === 'no-speech' || errCode === 'aborted') {
          return;
        }
        this.errorMessage.set(`Error de voz (${errCode})`);
      };

      rec.onend = () => {
        this.isListening.set(false);
        this.interimTranscript.set('');
        if (this.wantListening) {
          setTimeout(() => {
            if (this.wantListening) {
              this.launchRecognition();
            }
          }, 260);
        }
      };

      this.recognition = rec;
      rec.start();
    } catch {
      this.isListening.set(false);
    }
  }

  processTranscript(rawTranscript: string, confidence = 1): ParsedVoiceCommand | null {
    const clean = rawTranscript.trim();
    if (!clean) return null;

    const now = Date.now();
    if (clean.toLowerCase() === this.lastEmittedTranscript && now - this.lastEmittedAt < 650) {
      return null;
    }
    this.lastEmittedTranscript = clean.toLowerCase();
    this.lastEmittedAt = now;

    this.lastTranscript.set(clean);
    const parsed = this.parseTranscript(clean, confidence);
    this.lastCommandType.set(parsed.type);
    this.lastFeedback.set(parsed.description);

    this.commandHistory.update((hist) => [parsed, ...hist].slice(0, 15));
    this.commandDetected$.next(parsed);

    if (parsed.type === 'UNKNOWN') {
      this.speak('No entendí el comando. Intenta: crea clase Cliente.');
    }

    return parsed;
  }

  speak(text: string): void {
    if (!text || this.isMuted()) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const targetLang = this.getSpeechLang();
      utter.lang = targetLang;
      utter.rate = 1.05;
      utter.pitch = 1.0;

      const voices = synth.getVoices?.() || [];
      const matching = voices.find((v) =>
        v.lang.toLowerCase().startsWith(targetLang.slice(0, 2)),
      );
      if (matching) {
        utter.voice = matching;
      }
      synth.speak(utter);
    } catch {}
  }

  parseTranscript(rawTranscript: string, confidence = 1): ParsedVoiceCommand {
    const cleanRaw = rawTranscript.trim().replace(/[.;!?]+$/, '').trim();
    const norm = this.normalizeText(cleanRaw);

    // 1. Comandos globales / de navegación y acciones del editor
    if (/^(deshacer|deshaz|undo|ctrl\s*z)$/i.test(norm)) {
      return this.buildResult('UNDO', cleanRaw, confidence, {}, 'Deshacer última acción');
    }
    if (/^(rehacer|rehaz|redo|ctrl\s*y)$/i.test(norm)) {
      return this.buildResult('REDO', cleanRaw, confidence, {}, 'Rehacer acción');
    }
    if (/^(audita|auditar|normaliza|normalizar|abrir\s+auditoria|audit)(\s+.*)?$/i.test(norm)) {
      return this.buildResult('AUDIT_MODEL', cleanRaw, confidence, {}, 'Abrir auditoría 1FN/2FN/3FN');
    }
    if (/^(genera\s+sql|ver\s+sql|sql\s+ddl|mostrar\s+ddl|generate\s+sql)$/i.test(norm)) {
      return this.buildResult('GENERATE_SQL', cleanRaw, confidence, {}, 'Abrir visor SQL DDL');
    }
    if (/^(valida\s+xmi|ver\s+xmi|exporta\s+xmi|validador\s+xmi|validate\s+xmi)$/i.test(norm)) {
      return this.buildResult('VALIDATE_XMI', cleanRaw, confidence, {}, 'Abrir validador OMG XMI 2.1');
    }
    if (/^(acerca|acercar|zoom\s+in|mas\s+zoom|ampliar)$/i.test(norm)) {
      return this.buildResult('ZOOM_IN', cleanRaw, confidence, {}, 'Acercar lienzo');
    }
    if (/^(aleja|alejar|zoom\s+out|menos\s+zoom|reducir)$/i.test(norm)) {
      return this.buildResult('ZOOM_OUT', cleanRaw, confidence, {}, 'Alejar lienzo');
    }
    if (/^(centra|centrar|resetear\s+vista|restablecer\s+zoom|zoom\s+uno\s+a\s+uno|reset\s+view|fit\s+view)$/i.test(norm)) {
      return this.buildResult('RESET_VIEW', cleanRaw, confidence, {}, 'Restablecer vista del lienzo');
    }
    if (/^(limpia|limpiar|borra\s+todo|clear\s+canvas)(\s+(el\s+)?(lienzo|diagrama|pizarra))?$/i.test(norm)) {
      return this.buildResult('CLEAR_CANVAS', cleanRaw, confidence, {}, 'Limpiar lienzo');
    }

    // 2. Crear Nota / Comentario UML
    const noteMatch = cleanRaw.match(
      /^(?:crea|crear|agrega|agregar|añade|anade|nueva|new|add|create)\s+(?:una?\s+)?(?:nota|comentario|note)\s*(?:llamada\s+([a-zA-Z0-9_]+)\s+)?(?:que\s+diga\s+|con\s+(?:texto\s+)?|:)?\s*(.+)$/i,
    );
    if (noteMatch) {
      const noteTitle = noteMatch[1] ? this.toPascalCase(noteMatch[1]) : undefined;
      const noteContent = (noteMatch[2] || '').trim();
      if (noteContent) {
        return this.buildResult(
          'CREATE_NOTE',
          cleanRaw,
          confidence,
          { noteTitle, noteContent },
          `Crear nota UML: "${noteContent.slice(0, 40)}"`,
        );
      }
    }

    // 3. Crear Interfaz
    const ifaceMatch = norm.match(
      /^(?:crea|crear|agrega|agregar|nueva|create|add|new)\s+(?:una?\s+)?(?:interfaz|interface)\s+([a-z0-9_\s]+)$/i,
    );
    if (ifaceMatch) {
      const className = this.toPascalCase(ifaceMatch[1]);
      return this.buildResult(
        'CREATE_INTERFACE',
        cleanRaw,
        confidence,
        { className },
        `Crear interfaz «interface» ${className}`,
      );
    }

    // 4. Crear Enumeración
    const enumMatch = norm.match(
      /^(?:crea|crear|agrega|agregar|nueva|new|create|add)\s+(?:un[oa]?\s+)?(?:enum|enumeracion|enumeration)\s+([a-z0-9_]+)(?:\s+(?:con\s+los\s+valores|con\s+los\s+literales|con\s+valores|con\s+literales|con|valores|literales|with\s+values|with)\s+(.+))?$/i,
    );
    if (enumMatch) {
      const className = this.toPascalCase(enumMatch[1]);
      const literals = enumMatch[2]
        ? enumMatch[2]
            .split(/[,;]|\s+y\s+|\s+and\s+/i)
            .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
            .filter(Boolean)
        : undefined;
      return this.buildResult(
        'CREATE_ENUM',
        cleanRaw,
        confidence,
        { className, enumLiterals: literals },
        `Crear enumeración ${className}`,
      );
    }

    // 5. Agregar método / operación a una clase
    const methodMatch = norm.match(
      /^(?:agrega|agregar|anade|anadir|crea|crear|add)\s+(?:un\s+)?(?:metodo|operacion|funcion|method|operation)\s+([a-z0-9_]+)(?:\s+(?:de\s+tipo\s+|que\s+retorna\s+|retorna\s+|tipo\s+|returning\s+)([a-z0-9_<>[\]]+))?\s+(?:a|en|to|on)\s+(?:la\s+clase\s+|la\s+tabla\s+|la\s+interfaz\s+)?([a-z0-9_\s]+)$/i,
    );
    if (methodMatch) {
      const methodName = this.toCamelCase(methodMatch[1]);
      const returnType = this.normalizeDataType(methodMatch[2] || 'void', true);
      const className = this.toPascalCase(methodMatch[3]);
      return this.buildResult(
        'ADD_METHOD',
        cleanRaw,
        confidence,
        { className, methodName, returnType, visibility: '+' },
        `Agregar método ${methodName}(): ${returnType} a ${className}`,
      );
    }

    // 6. Eliminar método de clase
    const delMethodMatch = norm.match(
      /^(?:elimina|eliminar|borra|borrar|quita|quitar|delete|remove)\s+(?:el\s+)?(?:metodo|operacion|method)\s+([a-z0-9_]+)\s+(?:de|en|from)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-z0-9_\s]+)$/i,
    );
    if (delMethodMatch) {
      const methodName = this.toCamelCase(delMethodMatch[1]);
      const className = this.toPascalCase(delMethodMatch[2]);
      return this.buildResult(
        'DELETE_METHOD',
        cleanRaw,
        confidence,
        { className, methodName },
        `Eliminar método ${methodName}() de ${className}`,
      );
    }

    // 7. Eliminar atributo de clase
    const delAttrMatch = norm.match(
      /^(?:elimina|eliminar|borra|borrar|quita|quitar|delete|remove)\s+(?:el\s+)?(?:atributo|campo|columna|attribute|field|column)\s+([a-z0-9_]+)\s+(?:de|en|from)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-z0-9_\s]+)$/i,
    );
    if (delAttrMatch) {
      const attributeName = this.toCamelCase(delAttrMatch[1]);
      const className = this.toPascalCase(delAttrMatch[2]);
      return this.buildResult(
        'DELETE_ATTRIBUTE',
        cleanRaw,
        confidence,
        { className, attributeName },
        `Eliminar atributo ${attributeName} de ${className}`,
      );
    }

    // 8. Agregar atributo / clave primaria a una clase existente
    const pkAttrMatch = norm.match(
      /^(?:agrega|agregar|anade|anadir|crea|crear|add)\s+(?:una?\s+)?(?:clave\s+primaria|primary\s+key|pk|id)\s+(?:(?!de\b|tipo\b)([a-z0-9_]+)\s+)?(?:(?:de\s+tipo\s+|tipo\s+)?([a-z0-9_<>]+)\s+)?(?:a|en|to|on)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-z0-9_\s]+)$/i,
    );
    if (pkAttrMatch) {
      const rawName = pkAttrMatch[1] || 'id';
      const rawType = pkAttrMatch[2] || 'UUID';
      const className = this.toPascalCase(pkAttrMatch[3]);
      const attributeName = this.toCamelCase(rawName);
      const attributeType = this.normalizeDataType(rawType);
      return this.buildResult(
        'ADD_ATTRIBUTE',
        cleanRaw,
        confidence,
        {
          className,
          attributeName,
          attributeType,
          isPrimaryKey: true,
          isNullable: false,
          visibility: '-',
        },
        `Agregar clave primaria ${attributeName}: ${attributeType} a ${className}`,
      );
    }

    const attrMatch = norm.match(
      /^(?:agrega|agregar|anade|anadir|crea|crear|add)\s+(?:el\s+|un\s+)?(?:atributo|campo|columna|attribute|field|column)\s+([a-z0-9_]+)(?:\s+(?:de\s+tipo|tipo|as|:)?\s*([a-z0-9_<>[\]]+?))?(?:\s+(no\s+nulo|not\s+null|obligatorio|requerido|clave\s+primaria|pk))?\s+(?:a|en|para|to|on)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-z0-9_\s]+)$/i,
    );
    if (attrMatch) {
      const attributeName = this.toCamelCase(attrMatch[1]);
      const modifier = (attrMatch[3] || '').trim();
      const rawType = attrMatch[2] || 'String';
      const attributeType = this.normalizeDataType(rawType);
      const isPrimaryKey = /pk|clave\s+primaria|primary\s+key/i.test(modifier);
      const isNullable = !isPrimaryKey && !/no\s+nulo|not\s+null|obligatorio|requerido/i.test(modifier);
      const className = this.toPascalCase(attrMatch[4]);
      return this.buildResult(
        'ADD_ATTRIBUTE',
        cleanRaw,
        confidence,
        {
          className,
          attributeName,
          attributeType,
          isPrimaryKey,
          isNullable,
          visibility: '-',
        },
        `Agregar atributo ${attributeName}: ${attributeType} a ${className}`,
      );
    }

    // 9. Relaciones entre clases (Herencia, Realización, Composición, Agregación, Dependencia, Asociación, N:M)
    const relationParsed = this.parseRelationCommand(norm, cleanRaw, confidence);
    if (relationParsed) {
      return relationParsed;
    }

    // 10. Renombrar clase / tabla
    const renameMatch = norm.match(
      /^(?:renombra|renombrar|cambia\s+(?:el\s+)?nombre\s+(?:de\s+)?|rename)(?:\s+(?:la\s+)?(?:clase|tabla|entidad|interfaz|class))?\s+([a-z0-9_]+)\s+(?:a|por|to|into|as)\s+([a-z0-9_\s]+)$/i,
    );
    if (renameMatch) {
      const className = this.toPascalCase(renameMatch[1]);
      const newClassName = this.toPascalCase(renameMatch[2]);
      return this.buildResult(
        'RENAME_CLASS',
        cleanRaw,
        confidence,
        { className, newClassName },
        `Renombrar ${className} a ${newClassName}`,
      );
    }

    // 11. Eliminar clase / tabla
    const deleteClassMatch = norm.match(
      /^(?:elimina|eliminar|borra|borrar|quita|quitar|delete|remove)\s+(?:la\s+|el\s+)?(?:clase|tabla|entidad|interfaz|enum|nota|class)\s+([a-z0-9_\s]+)$/i,
    );
    if (deleteClassMatch) {
      const className = this.toPascalCase(deleteClassMatch[1]);
      return this.buildResult(
        'DELETE_CLASS',
        cleanRaw,
        confidence,
        { className },
        `Eliminar elemento ${className}`,
      );
    }

    // 12. Crear Clase (opcionalmente con atributos inline: "crea clase Cliente con nombre String, edad Integer")
    const createClassMatch = norm.match(
      /^(?:crea|crear|agrega|agregar|anade|anadir|nueva|nuevo|create|add|new)\s+(?:una?\s+)?(?:clase|tabla|entidad|class|table|entity)\s+(?:llamada\s+)?([a-z0-9_]+)(?:\s+(?:con|with)\s+(?:los\s+atributos\s+|atributos\s+|campos\s+)?(.+))?$/i,
    );
    if (createClassMatch) {
      const className = this.toPascalCase(createClassMatch[1]);
      const inlineRaw = createClassMatch[2]?.trim();
      const inlineAttributes = inlineRaw ? this.parseInlineAttributes(inlineRaw) : undefined;
      return this.buildResult(
        'CREATE_CLASS',
        cleanRaw,
        confidence,
        { className, inlineAttributes },
        inlineAttributes?.length
          ? `Crear clase ${className} con ${inlineAttributes.length} atributo(s)`
          : `Crear clase ${className}`,
      );
    }

    return this.buildResult(
      'UNKNOWN',
      cleanRaw,
      confidence,
      {},
      `Comando no reconocido: "${cleanRaw}"`,
    );
  }

  private parseRelationCommand(
    norm: string,
    cleanRaw: string,
    confidence: number,
  ): ParsedVoiceCommand | null {
    // a) Herencia directa: "Estudiante hereda de Persona", "Perro extiende Animal"
    const inheritDirect = norm.match(
      /^(?:la\s+clase\s+)?([a-z0-9_]+)\s+(?:hereda\s+de|extiende\s+de|extiende|inherits\s+from|extends)\s+(?:la\s+clase\s+)?([a-z0-9_]+)$/i,
    );
    if (inheritDirect) {
      const sourceClass = this.toPascalCase(inheritDirect[1]);
      const targetClass = this.toPascalCase(inheritDirect[2]);
      return this.buildResult(
        'CONNECT_CLASSES',
        cleanRaw,
        confidence,
        {
          sourceClass,
          targetClass,
          relationType: 'generalization',
          sourceMultiplicity: '',
          targetMultiplicity: '',
        },
        `Herencia: ${sourceClass} ──▷ ${targetClass}`,
      );
    }

    // b) Implementación / Realización: "PagoServicio implementa IPago"
    const realizeDirect = norm.match(
      /^(?:la\s+clase\s+)?([a-z0-9_]+)\s+(?:implementa|realiza|implements|realizes)\s+(?:la\s+interfaz\s+)?([a-z0-9_]+)$/i,
    );
    if (realizeDirect) {
      const sourceClass = this.toPascalCase(realizeDirect[1]);
      const targetClass = this.toPascalCase(realizeDirect[2]);
      return this.buildResult(
        'CONNECT_CLASSES',
        cleanRaw,
        confidence,
        {
          sourceClass,
          targetClass,
          relationType: 'realization',
          sourceMultiplicity: '',
          targetMultiplicity: '',
        },
        `Realización: ${sourceClass} ┈┈▷ ${targetClass}`,
      );
    }

    // c) "relacion de <tipo> entre A y B ..." o "conecta A con B ..."
    const typedRel = norm.match(
      /^(?:crea|crear|agrega|agregar|conecta|conectar|relaciona|relacionar|vincula|vincular|connect|link|relate|create)\s+(?:una?\s+)?(?:relacion\s+(?:de\s+)?)?(?:(asociacion|composicion|agregacion|herencia|generalizacion|realizacion|dependencia|clase\s+asociativa|association\s+class|composition|aggregation|inheritance|generalization|realization|dependency|association)\s+(?:entre|de|between)\s+)?([a-z0-9_]+)\s+(?:con|y|a|and|to|with)\s+([a-z0-9_]+)(?:\s+(.+))?$/i,
    );

    if (typedRel) {
      const relWord = (typedRel[1] || '').trim();
      const sourceClass = this.toPascalCase(typedRel[2]);
      const targetClass = this.toPascalCase(typedRel[3]);
      const tail = (typedRel[4] || '').trim();

      let relationType = this.mapRelationKeyword(relWord || tail);
      const { sourceMultiplicity, targetMultiplicity, isManyToMany } =
        this.extractMultiplicityFromTail(tail);

      if (isManyToMany && !relWord) {
        relationType = 'association_class';
      }

      return this.buildResult(
        'CONNECT_CLASSES',
        cleanRaw,
        confidence,
        {
          sourceClass,
          targetClass,
          relationType,
          sourceMultiplicity:
            relationType === 'generalization' || relationType === 'realization' || relationType === 'dependency'
              ? ''
              : sourceMultiplicity,
          targetMultiplicity:
            relationType === 'generalization' || relationType === 'realization' || relationType === 'dependency'
              ? ''
              : targetMultiplicity,
        },
        `Conectar ${sourceClass} → ${targetClass} (${relationType})`,
      );
    }

    return null;
  }

  private mapRelationKeyword(text: string): UmlRelationshipType {
    if (/clase\s+asociativa|association\s+class/i.test(text)) return 'association_class';
    if (/composicion|composition/i.test(text)) return 'composition';
    if (/agregacion|aggregation/i.test(text)) return 'aggregation';
    if (/herencia|generalizacion|inheritance|generalization/i.test(text)) return 'generalization';
    if (/realizacion|realization/i.test(text)) return 'realization';
    if (/dependencia|dependency/i.test(text)) return 'dependency';
    return 'association';
  }

  private extractMultiplicityFromTail(tail: string): {
    sourceMultiplicity: string;
    targetMultiplicity: string;
    isManyToMany: boolean;
  } {
    if (/muchos\s+a\s+muchos|many\s+to\s+many|n\s*:\s*m/i.test(tail)) {
      return { sourceMultiplicity: '*', targetMultiplicity: '*', isManyToMany: true };
    }
    if (/uno\s+a\s+muchos|1\s+a\s+muchos|one\s+to\s+many|1\s*:\s*n|1\s+a\s+\*/i.test(tail)) {
      return { sourceMultiplicity: '1', targetMultiplicity: '1..*', isManyToMany: false };
    }
    if (/muchos\s+a\s+uno|many\s+to\s+one|\*\s+a\s+1/i.test(tail)) {
      return { sourceMultiplicity: '0..*', targetMultiplicity: '1', isManyToMany: false };
    }
    if (/uno\s+a\s+uno|1\s+a\s+1|one\s+to\s+one|1\s*:\s*1/i.test(tail)) {
      return { sourceMultiplicity: '1', targetMultiplicity: '1', isManyToMany: false };
    }
    return { sourceMultiplicity: '1', targetMultiplicity: '1..*', isManyToMany: false };
  }

  private parseInlineAttributes(raw: string): VoiceInlineAttribute[] {
    const parts = raw
      .split(/[,;]|\s+y\s+|\s+and\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);

    const attrs: VoiceInlineAttribute[] = [];
    for (const part of parts) {
      const tokens = part.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;

      const lowerTokens = tokens.map((t) => t.toLowerCase());
      const hasPkWord = lowerTokens.includes('pk') || (lowerTokens.includes('clave') && lowerTokens.includes('primaria'));
      const filteredTokens = tokens.filter((t) => !/^(de|tipo|pk|not|null|no|nulo|clave|primaria)$/i.test(t));
      if (filteredTokens.length === 0) continue;

      const attrName = this.toCamelCase(filteredTokens[0]);
      const attrType = filteredTokens[1]
        ? this.normalizeDataType(filteredTokens[1])
        : attrName.toLowerCase() === 'id'
          ? 'UUID'
          : 'String';

      const isPk = hasPkWord || attrName.toLowerCase() === 'id';
      attrs.push({
        name: attrName,
        type: attrType,
        isPrimaryKey: isPk,
        isNullable: !isPk,
        visibility: '-',
      });
    }
    return attrs;
  }

  private normalizeDataType(raw: string, forReturn = false): string {
    const cleaned = (raw || '').trim().toLowerCase();
    if (!cleaned) return forReturn ? 'void' : 'String';
    if (/^(void|vacio|nada)$/.test(cleaned)) return 'void';
    if (/^(uuid|guid)$/.test(cleaned)) return 'UUID';
    if (/^(string|texto|cadena|varchar|text|nombre)$/.test(cleaned)) return 'String';
    if (/^(int|integer|entero|numero)$/.test(cleaned)) return 'Integer';
    if (/^(long|entero\s+largo|bigint)$/.test(cleaned)) return 'Long';
    if (/^(double|doble|flotante|float|real)$/.test(cleaned)) return 'Double';
    if (/^(decimal|bigdecimal|moneda|dinero|precio)$/.test(cleaned)) return 'BigDecimal';
    if (/^(bool|boolean|booleano|logico)$/.test(cleaned)) return 'Boolean';
    if (/^(fecha|date|localdate)$/.test(cleaned)) return 'LocalDate';
    if (/^(fechahora|timestamp|datetime|localdatetime)$/.test(cleaned)) return 'LocalDateTime';
    return this.toPascalCase(raw);
  }

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toPascalCase(text: string): string {
    return text
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  private toCamelCase(text: string): string {
    const pascal = this.toPascalCase(text);
    if (!pascal) return 'campo';
    if (!/[a-z]/.test(pascal) && pascal.length > 1) {
      return pascal.toLowerCase();
    }
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private buildResult(
    type: VoiceCommandType,
    rawTranscript: string,
    confidence: number,
    payload: VoiceCommandPayload,
    description: string,
  ): ParsedVoiceCommand {
    return { type, rawTranscript, confidence, payload, description };
  }
}
