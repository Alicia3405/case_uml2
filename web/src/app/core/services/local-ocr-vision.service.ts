import { Injectable, signal } from '@angular/core';
import {
  UmlAttribute,
  UmlClassNode,
  UmlConnection,
  UmlElementType,
  UmlMethod,
  UmlRelationshipType,
  UmlVisibility,
} from '../models/diagram.model';

export interface OcrWordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface LocalVisionResult {
  success: boolean;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  rawTextExtracted: string;
  modelUsed: string;
  processingMs: number;
  errorMessage?: string;
}

interface TextLine {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  text: string;
}

interface CardCluster {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  words: OcrWordBox[];
  lines: TextLine[];
}

@Injectable({
  providedIn: 'root',
})
export class LocalOcrVisionService {
  readonly isProcessing = signal<boolean>(false);
  readonly progressPercent = signal<number>(0);
  readonly statusMessage = signal<string>('');

  protected async loadTesseract(): Promise<typeof import('tesseract.js')> {
    return import('tesseract.js');
  }

  /**
   * Analiza una imagen/boceto UML completamente Offline en el navegador con Tesseract.js.
   * Nunca inventa clases ni relaciones ficticias: solo retorna lo detectado en el OCR 2D o texto.
   */
  async parseDiagramImageOffline(imageDataUrl: string): Promise<LocalVisionResult> {
    const startTime = Date.now();
    this.isProcessing.set(true);
    this.progressPercent.set(5);
    this.statusMessage.set('Preprocesando imagen para OCR local...');

    try {
      const processedInput = await this.preprocessImageForOcr(imageDataUrl);
      this.progressPercent.set(20);
      this.statusMessage.set('Cargando motor Tesseract OCR Offline...');

      const tesseractMod = await this.loadTesseract();
      const TesseractNS: any = (tesseractMod as any).default || tesseractMod;

      let worker: any = null;
      let recognizeData: any = null;

      try {
        try {
          worker = await TesseractNS.createWorker('spa+eng', TesseractNS.OEM?.LSTM_ONLY ?? 1, {
            logger: (m: any) => {
              if (m?.status === 'recognizing text' && typeof m.progress === 'number') {
                this.progressPercent.set(25 + Math.round(m.progress * 60));
                this.statusMessage.set(`Extrayendo texto y bloques UML (${Math.round(m.progress * 100)}%)...`);
              }
            },
          });
        } catch {
          worker = await TesseractNS.createWorker('eng', TesseractNS.OEM?.LSTM_ONLY ?? 1);
        }

        const result = await worker.recognize(processedInput, {}, { text: true, blocks: true });
        recognizeData = result?.data;
      } finally {
        if (worker && typeof worker.terminate === 'function') {
          try {
            await worker.terminate();
          } catch {}
        }
      }

      this.progressPercent.set(90);
      this.statusMessage.set('Reconstruyendo clases UML 2D y multiplicidades...');

      const rawText = String(recognizeData?.text || '').trim();
      const words = this.extractWordBoxes(recognizeData);

      const { nodes, connections } = this.buildAstFromOcrData(words, rawText);
      const processingMs = Date.now() - startTime;

      if (nodes.length === 0) {
        return {
          success: false,
          nodes: [],
          connections: [],
          rawTextExtracted: rawText,
          modelUsed: 'Tesseract.js OCR 2D (Offline)',
          processingMs,
          errorMessage: rawText
            ? 'Se extrajo texto, pero no se identificaron clases UML válidas. Prueba con una imagen más nítida o usa Gemini Vision.'
            : 'No se detectó texto legible en la imagen adjunta.',
        };
      }

      return {
        success: true,
        nodes,
        connections,
        rawTextExtracted: rawText,
        modelUsed: 'Tesseract.js OCR 2D (Offline)',
        processingMs,
      };
    } catch (err: any) {
      return {
        success: false,
        nodes: [],
        connections: [],
        rawTextExtracted: '',
        modelUsed: 'Tesseract.js OCR 2D (Offline)',
        processingMs: Date.now() - startTime,
        errorMessage: err?.message || 'Error ejecutando el motor OCR local en el navegador.',
      };
    } finally {
      this.isProcessing.set(false);
      this.progressPercent.set(100);
      this.statusMessage.set('');
    }
  }

  /**
   * Mejora contraste, escala imágenes pequeñas y auto-invierte fondos oscuros
   * para maximizar precisión de OCR en capturas de pantalla o pizarras.
   */
  async preprocessImageForOcr(imageDataUrl: string): Promise<string | HTMLCanvasElement> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return imageDataUrl;
    }

    try {
      const probeCanvas = document.createElement('canvas');
      if (!probeCanvas.getContext || !probeCanvas.getContext('2d')) {
        return imageDataUrl;
      }
    } catch {
      return imageDataUrl;
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (result: string | HTMLCanvasElement) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => done(imageDataUrl), 3000);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width || 800;
          const height = img.naturalHeight || img.height || 600;
          const scale = width < 1400 ? Math.min(2, 1600 / Math.max(width, 1)) : 1;

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            done(imageDataUrl);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          let sumLum = 0;
          const step = 16;
          let count = 0;
          for (let i = 0; i < data.length; i += 4 * step) {
            sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            count++;
          }
          const isDarkTheme = count > 0 && sumLum / count < 122;

          for (let i = 0; i < data.length; i += 4) {
            let lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (isDarkTheme) {
              lum = 255 - lum;
            }
            const stretched = Math.max(0, Math.min(255, Math.round((lum - 128) * 1.45 + 128)));
            data[i] = stretched;
            data[i + 1] = stretched;
            data[i + 2] = stretched;
          }

          ctx.putImageData(imgData, 0, 0);
          done(canvas);
        } catch {
          done(imageDataUrl);
        }
      };
      img.onerror = () => done(imageDataUrl);
      img.src = imageDataUrl;
    });
  }

  /**
   * Extrae todas las palabras con coordenadas desde la estructura de bloques de Tesseract.js v7
   * (y soporta también `data.words` si proviene de pruebas unitarias o wrappers previos).
   */
  extractWordBoxes(recognizeData: any): OcrWordBox[] {
    const collected: OcrWordBox[] = [];

    if (Array.isArray(recognizeData?.blocks)) {
      for (const block of recognizeData.blocks) {
        for (const para of block?.paragraphs || []) {
          for (const line of para?.lines || []) {
            for (const word of line?.words || []) {
              const text = String(word?.text || '').trim();
              const bbox = word?.bbox;
              if (text && bbox) {
                collected.push({
                  text,
                  confidence: Number(word?.confidence ?? 80),
                  bbox: {
                    x0: Number(bbox.x0 ?? 0),
                    y0: Number(bbox.y0 ?? 0),
                    x1: Number(bbox.x1 ?? 0),
                    y1: Number(bbox.y1 ?? 0),
                  },
                });
              }
            }
          }
        }
      }
    }

    if (collected.length === 0 && Array.isArray(recognizeData?.words)) {
      for (const word of recognizeData.words) {
        const text = String(word?.text || '').trim();
        const bbox = word?.bbox;
        if (text && bbox) {
          collected.push({
            text,
            confidence: Number(word?.confidence ?? 80),
            bbox: {
              x0: Number(bbox.x0 ?? 0),
              y0: Number(bbox.y0 ?? 0),
              x1: Number(bbox.x1 ?? 0),
              y1: Number(bbox.y1 ?? 0),
            },
          });
        }
      }
    }

    return collected.filter((w) => {
      const cleaned = w.text.trim();
      if (!cleaned) return false;
      if (this.isConnectorToken(cleaned)) return true;
      return w.confidence >= 22;
    });
  }

  /**
   * Convierte palabras 2D y texto OCR en nodos y relaciones UML válidos.
   * Público para poder validarse unitariamente de manera determinista sin red.
   */
  buildAstFromOcrData(
    rawWords: OcrWordBox[],
    rawText: string,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    if (rawWords.length > 0) {
      const spatialResult = this.clusterWordsInto2DCards(rawWords, rawText);
      if (spatialResult.nodes.length > 0) {
        return spatialResult;
      }
    }

    return this.parseTextualUmlFallback(rawText);
  }

  private clusterWordsInto2DCards(
    words: OcrWordBox[],
    rawText: string,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    const connectorTokens: OcrWordBox[] = [];
    const cardWords: OcrWordBox[] = [];

    for (const w of words) {
      const t = w.text.trim();
      if (!t || /^[\[\]|_\\\/.,;=`~^]+$/.test(t)) continue;
      if (this.isConnectorToken(t)) {
        connectorTokens.push(w);
      } else {
        cardWords.push(w);
      }
    }

    if (cardWords.length === 0) {
      return { nodes: [], connections: [] };
    }

    const heights = cardWords
      .map((w) => Math.max(8, w.bbox.y1 - w.bbox.y0))
      .sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 16;

    // Agrupar palabras cercanas en clusters espaciales (tarjetas de clases UML)
    const clusters: { x0: number; y0: number; x1: number; y1: number; words: OcrWordBox[] }[] = [];
    const visited = new Set<number>();
    const gapX = Math.max(48, medianH * 3.8);
    const gapY = Math.max(24, medianH * 2.1);

    for (let i = 0; i < cardWords.length; i++) {
      if (visited.has(i)) continue;
      visited.add(i);

      const queue = [i];
      const group: OcrWordBox[] = [];

      while (queue.length > 0) {
        const idx = queue.shift()!;
        const curr = cardWords[idx];
        group.push(curr);

        for (let j = 0; j < cardWords.length; j++) {
          if (visited.has(j)) continue;
          const cand = cardWords[j];

          const dx = Math.max(0, curr.bbox.x0 - cand.bbox.x1, cand.bbox.x0 - curr.bbox.x1);
          const dy = Math.max(0, curr.bbox.y0 - cand.bbox.y1, cand.bbox.y0 - curr.bbox.y1);

          const sameLineClose = dy <= medianH * 0.85 && dx <= gapX;
          const stackedInsideCard = dy <= gapY && dx <= medianH * 2.5 && this.horizontalOverlapOrNear(curr.bbox, cand.bbox, gapX);

          if (sameLineClose || stackedInsideCard) {
            visited.add(j);
            queue.push(j);
          }
        }
      }

      const x0 = Math.min(...group.map((g) => g.bbox.x0));
      const y0 = Math.min(...group.map((g) => g.bbox.y0));
      const x1 = Math.max(...group.map((g) => g.bbox.x1));
      const y1 = Math.max(...group.map((g) => g.bbox.y1));

      clusters.push({ x0, y0, x1, y1, words: group });
    }

    // Reconstruir líneas dentro de cada tarjeta
    const cards: CardCluster[] = clusters
      .map((c) => ({
        ...c,
        lines: this.reconstructLines(c.words, medianH),
      }))
      .filter((c) => c.lines.length > 0);

    // Convertir cada CardCluster en UmlClassNode con coordenadas normalizadas al lienzo
    const minX = Math.min(...cards.map((c) => c.x0));
    const maxX = Math.max(...cards.map((c) => c.x1));
    const minY = Math.min(...cards.map((c) => c.y0));
    const maxY = Math.max(...cards.map((c) => c.y1));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    const targetCanvasW = Math.min(1100, Math.max(520, cards.length * 290));
    const targetCanvasH = Math.min(760, Math.max(360, cards.length * 160));

    const nodes: UmlClassNode[] = [];
    const nodeCards: { node: UmlClassNode; card: CardCluster }[] = [];
    const seenNames = new Set<string>();
    const ts = Date.now();

    cards.forEach((card, idx) => {
      const parsedNode = this.parseCardLinesToNode(card.lines, `ocr_node_${ts}_${idx}`);
      if (!parsedNode) return;

      let uniqueName = parsedNode.name;
      let suffix = 2;
      while (seenNames.has(uniqueName.toLowerCase())) {
        uniqueName = `${parsedNode.name}_${suffix++}`;
      }
      seenNames.add(uniqueName.toLowerCase());
      parsedNode.name = uniqueName;

      const normX = cards.length === 1 ? 260 : 90 + Math.round(((card.x0 - minX) / spanX) * targetCanvasW);
      const normY = cards.length === 1 ? 140 : 80 + Math.round(((card.y0 - minY) / spanY) * targetCanvasH);
      parsedNode.position = { x: normX, y: normY };

      nodes.push(parsedNode);
      nodeCards.push({ node: parsedNode, card });
    });

    this.resolveOverlappingNodePositions(nodes);

    // Reconstruir relaciones únicamente con evidencia espacial real o declaraciones textuales explícitas
    const connections: UmlConnection[] = [];
    const edgeKeys = new Set<string>();

    for (let i = 0; i < nodeCards.length; i++) {
      for (let j = i + 1; j < nodeCards.length; j++) {
        const a = nodeCards[i];
        const b = nodeCards[j];

        const corridorTokens = connectorTokens.filter((tok) =>
          this.isTokenInCorridor(tok.bbox, a.card, b.card, medianH * 2.5),
        );

        if (corridorTokens.length === 0) {
          continue;
        }

        const relEvidence = this.inferRelationFromCorridor(corridorTokens, a.card, b.card);
        if (!relEvidence) continue;

        const key = `${a.node.id}->${b.node.id}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          connections.push({
            id: `ocr_conn_${ts}_${connections.length}`,
            sourceNodeId: a.node.id,
            targetNodeId: b.node.id,
            sourceId: `${a.node.id}_right`,
            targetId: `${b.node.id}_left`,
            type: relEvidence.type,
            lineStyle: 'segment',
            sourceMultiplicity: relEvidence.sourceMultiplicity,
            targetMultiplicity: relEvidence.targetMultiplicity,
            name: relEvidence.label,
          });
        }
      }
    }

    // Complementar con relaciones explícitas escritas en texto OCR (p. ej. "Cliente 1 -> * Pedido")
    const textConns = this.parseExplicitTextRelations(rawText, nodes);
    for (const tc of textConns) {
      const fwd = `${tc.sourceNodeId}->${tc.targetNodeId}`;
      const rev = `${tc.targetNodeId}->${tc.sourceNodeId}`;
      if (!edgeKeys.has(fwd) && !edgeKeys.has(rev)) {
        edgeKeys.add(fwd);
        connections.push(tc);
      }
    }

    return { nodes, connections };
  }

  private horizontalOverlapOrNear(
    a: { x0: number; x1: number },
    b: { x0: number; x1: number },
    tolerance: number,
  ): boolean {
    const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return overlap >= -tolerance;
  }

  private reconstructLines(words: OcrWordBox[], medianH: number): TextLine[] {
    const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const grouped: OcrWordBox[][] = [];

    for (const w of sorted) {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      const targetGroup = grouped.find((line) => {
        const ly =
          line.reduce((acc, item) => acc + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.length;
        return Math.abs(cy - ly) <= Math.max(8, medianH * 0.65);
      });

      if (targetGroup) {
        targetGroup.push(w);
      } else {
        grouped.push([w]);
      }
    }

    return grouped
      .map((line) => {
        const ordered = [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0);
        const text = ordered.map((w) => w.text.trim()).join(' ').trim();
        return {
          y0: Math.min(...ordered.map((w) => w.bbox.y0)),
          y1: Math.max(...ordered.map((w) => w.bbox.y1)),
          x0: Math.min(...ordered.map((w) => w.bbox.x0)),
          x1: Math.max(...ordered.map((w) => w.bbox.x1)),
          text,
        };
      })
      .filter((l) => l.text.length > 0 && !/^[=\-_─┈*•+]{2,}$/.test(l.text));
  }

  private parseCardLinesToNode(lines: TextLine[], id: string): UmlClassNode | null {
    if (lines.length === 0) return null;

    let elementType: UmlElementType = 'CLASS';
    let stereotype: string | undefined;
    let cursor = 0;

    // Detectar estereotipo UML en la primera línea (<<interface>>, <<enum>>, <<note>>)
    const first = lines[0].text.replace(/[«»<>]/g, '').trim().toLowerCase();
    if (/^(interface|interfaz)$/.test(first)) {
      elementType = 'INTERFACE';
      stereotype = 'interface';
      cursor = 1;
    } else if (/^(enum|enumeration|enumeracion)$/.test(first)) {
      elementType = 'ENUM';
      stereotype = 'enumeration';
      cursor = 1;
    } else if (/^(note|nota)$/.test(first)) {
      elementType = 'NOTE';
      cursor = 1;
    }

    const headerLine = lines[cursor]?.text || '';
    const cleanedTitle = headerLine
      .replace(/[|{}\[\]()]/g, ' ')
      .replace(/^class\s+/i, '')
      .trim()
      .split(/\s+/)[0];

    if (!cleanedTitle || cleanedTitle.length < 2 || /^\d+$/.test(cleanedTitle)) {
      return null;
    }

    const name = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    const bodyLines = lines.slice(cursor + 1);

    if (elementType === 'NOTE') {
      return {
        id,
        name,
        elementType: 'NOTE',
        noteContent: bodyLines.map((l) => l.text).join('\n') || name,
        position: { x: 100, y: 100 },
        width: 220,
        attributes: [],
        methods: [],
      };
    }

    const attributes: UmlAttribute[] = [];
    const methods: UmlMethod[] = [];

    for (const line of bodyLines) {
      const txt = line.text.replace(/[|]/g, '').trim();
      if (!txt || txt.length < 2) continue;

      if (elementType === 'ENUM') {
        const lit = txt.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
        if (lit) {
          attributes.push({
            name: lit,
            type: 'EnumLiteral',
            visibility: '+',
            isPrimaryKey: false,
            isNullable: false,
            orderIndex: attributes.length,
          });
        }
        continue;
      }

      if (txt.includes('(') && txt.includes(')')) {
        const m = this.parseMethodLine(txt, methods.length);
        if (m) methods.push(m);
      } else {
        const a = this.parseAttributeLine(txt, attributes.length);
        if (a) attributes.push(a);
      }
    }

    return {
      id,
      name,
      elementType,
      stereotype,
      position: { x: 100, y: 100 },
      width: 220,
      attributes,
      methods,
    };
  }

  private parseAttributeLine(rawLine: string, orderIndex: number): UmlAttribute | null {
    let visibility: UmlVisibility = '-';
    let work = rawLine.trim();

    if (/^[+\-#~]/.test(work)) {
      visibility = work.charAt(0) as UmlVisibility;
      work = work.slice(1).trim();
    }

    const isPrimaryKey = /\bPK\b|\[PK\]/i.test(work);
    const isNullable = !isPrimaryKey && !/\bNN\b|NOT\s+NULL|\*$/i.test(work);

    work = work
      .replace(/\[?PK\]?/gi, '')
      .replace(/\[?FK\]?/gi, '')
      .replace(/\[?NN\]?/gi, '')
      .replace(/NOT\s+NULL/gi, '')
      .replace(/\*$/, '')
      .trim();

    if (!work) return null;

    let name = '';
    let type = 'String';

    if (work.includes(':')) {
      const [nPart, tPart] = work.split(':', 2);
      name = this.cleanIdentifier(nPart);
      type = this.normalizeOcrType(tPart);
    } else {
      const parts = work.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && /^(int|integer|long|string|varchar|double|float|boolean|bool|uuid|date|datetime|localdate|localdatetime|decimal|bigdecimal)$/i.test(parts[0])) {
        type = this.normalizeOcrType(parts[0]);
        name = this.cleanIdentifier(parts[1]);
      } else {
        name = this.cleanIdentifier(parts[0] || '');
        if (parts[1]) {
          type = this.normalizeOcrType(parts[1]);
        } else if (name.toLowerCase() === 'id') {
          type = 'UUID';
        }
      }
    }

    if (!name) return null;
    const pkFinal = isPrimaryKey || name.toLowerCase() === 'id';

    return {
      name,
      type,
      visibility,
      isPrimaryKey: pkFinal,
      isNullable: pkFinal ? false : isNullable,
      orderIndex,
    };
  }

  private parseMethodLine(rawLine: string, orderIndex: number): UmlMethod | null {
    let visibility: UmlVisibility = '+';
    let work = rawLine.trim();

    if (/^[+\-#~]/.test(work)) {
      visibility = work.charAt(0) as UmlVisibility;
      work = work.slice(1).trim();
    }

    const m = work.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*([a-zA-Z0-9_<>\[\]]+))?/);
    if (!m) return null;

    return {
      name: m[1],
      parameters: (m[2] || '').trim(),
      returnType: m[3] ? this.normalizeOcrType(m[3], true) : 'void',
      visibility,
      orderIndex,
    };
  }

  private isConnectorToken(text: string): boolean {
    const t = text.trim();
    return (
      /^(1|0\.\.1|1\.\.\*|0\.\.\*|\*|n|m|\.\.)$/i.test(t) ||
      /^(-->|->|<--|<-|<->|<>|◆|◇|▷|─+|┈+|<<|>>)$/.test(t)
    );
  }

  private isTokenInCorridor(
    tok: { x0: number; y0: number; x1: number; y1: number },
    a: CardCluster,
    b: CardCluster,
    padding: number,
  ): boolean {
    const cx = (tok.x0 + tok.x1) / 2;
    const cy = (tok.y0 + tok.y1) / 2;

    const minX = Math.min(a.x0, b.x0) - padding;
    const maxX = Math.max(a.x1, b.x1) + padding;
    const minY = Math.min(a.y0, b.y0) - padding;
    const maxY = Math.max(a.y1, b.y1) + padding;

    const insideA = cx >= a.x0 && cx <= a.x1 && cy >= a.y0 && cy <= a.y1;
    const insideB = cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;

    return !insideA && !insideB && cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }

  private inferRelationFromCorridor(
    tokens: OcrWordBox[],
    a: CardCluster,
    b: CardCluster,
  ): {
    type: UmlRelationshipType;
    sourceMultiplicity: string;
    targetMultiplicity: string;
    label?: string;
  } | null {
    if (tokens.length === 0) return null;

    const centerA = { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 };
    const centerB = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };

    let type: UmlRelationshipType = 'association';
    let sourceMult = '1';
    let targetMult = '1..*';

    const joined = tokens.map((t) => t.text.trim()).join(' ');
    if (/◆/.test(joined)) type = 'composition';
    else if (/◇/.test(joined)) type = 'aggregation';
    else if (/▷/.test(joined)) type = 'generalization';
    else if (/┈/.test(joined)) type = 'dependency';

    const multTokens = tokens.filter((t) => /^(1|0\.\.1|1\.\.\*|0\.\.\*|\*|n|m)$/i.test(t.text.trim()));
    if (multTokens.length >= 2) {
      const sorted = [...multTokens].sort((t1, t2) => {
        const cx1 = (t1.bbox.x0 + t1.bbox.x1) / 2;
        const cy1 = (t1.bbox.y0 + t1.bbox.y1) / 2;
        const dA1 = Math.hypot(cx1 - centerA.x, cy1 - centerA.y);
        const cx2 = (t2.bbox.x0 + t2.bbox.x1) / 2;
        const cy2 = (t2.bbox.y0 + t2.bbox.y1) / 2;
        const dA2 = Math.hypot(cx2 - centerA.x, cy2 - centerA.y);
        return dA1 - dA2;
      });
      sourceMult = sorted[0].text.trim();
      targetMult = sorted[sorted.length - 1].text.trim();
    } else if (multTokens.length === 1) {
      const t = multTokens[0];
      const cx = (t.bbox.x0 + t.bbox.x1) / 2;
      const cy = (t.bbox.y0 + t.bbox.y1) / 2;
      const dA = Math.hypot(cx - centerA.x, cy - centerA.y);
      const dB = Math.hypot(cx - centerB.x, cy - centerB.y);
      if (dA < dB) {
        sourceMult = t.text.trim();
      } else {
        targetMult = t.text.trim();
      }
    }

    return {
      type,
      sourceMultiplicity: sourceMult,
      targetMultiplicity: targetMult,
    };
  }

  private parseExplicitTextRelations(
    rawText: string,
    nodes: UmlClassNode[],
  ): UmlConnection[] {
    if (!rawText || nodes.length < 2) return [];

    const byName = new Map<string, UmlClassNode>();
    for (const n of nodes) {
      byName.set(n.name.toLowerCase(), n);
    }

    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const conns: UmlConnection[] = [];
    const ts = Date.now();

    for (const line of lines) {
      // Ej: "Cliente 1 -> * Pedido : realiza" o "Perro extends Animal"
      const arrowMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:["']?([0-9*\.]+)["']?\s*)?(?:-->|->|--\*|o--|<\|--|extends|implements)\s*(?:["']?([0-9*\.]+)["']?\s*)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(.+))?$/i,
      );
      if (arrowMatch) {
        const src = byName.get(arrowMatch[1].toLowerCase());
        const tgt = byName.get(arrowMatch[4].toLowerCase());
        if (src && tgt && src.id !== tgt.id) {
          let type: UmlRelationshipType = 'association';
          if (/\bextends\b|<\|--/i.test(line)) type = 'generalization';
          else if (/\bimplements\b/i.test(line)) type = 'realization';
          else if (/--\*/.test(line)) type = 'composition';
          else if (/o--/.test(line)) type = 'aggregation';

          conns.push({
            id: `ocr_txt_conn_${ts}_${conns.length}`,
            sourceNodeId: src.id,
            targetNodeId: tgt.id,
            sourceId: `${src.id}_right`,
            targetId: `${tgt.id}_left`,
            type,
            lineStyle: 'segment',
            sourceMultiplicity: arrowMatch[2] || (type === 'generalization' || type === 'realization' ? '' : '1'),
            targetMultiplicity: arrowMatch[3] || (type === 'generalization' || type === 'realization' ? '' : '1..*'),
            name: arrowMatch[5]?.trim(),
          });
        }
      }
    }

    return conns;
  }

  private parseTextualUmlFallback(rawText: string): {
    nodes: UmlClassNode[];
    connections: UmlConnection[];
  } {
    if (!rawText.trim()) return { nodes: [], connections: [] };

    const nodes: UmlClassNode[] = [];
    const ts = Date.now();
    const blockRegex = /\b(class|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(rawText)) !== null) {
      const kind = match[1].toLowerCase();
      const elementType: UmlElementType =
        kind === 'interface' ? 'INTERFACE' : kind === 'enum' ? 'ENUM' : 'CLASS';
      const name = match[2];
      const innerLines = match[3]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const idx = nodes.length;
      const attributes: UmlAttribute[] = [];
      const methods: UmlMethod[] = [];

      for (const l of innerLines) {
        if (elementType === 'ENUM') {
          const lit = l.replace(/[,;]/g, '').trim().toUpperCase();
          if (lit) {
            attributes.push({
              name: lit,
              type: 'EnumLiteral',
              visibility: '+',
              isPrimaryKey: false,
              isNullable: false,
              orderIndex: attributes.length,
            });
          }
        } else if (l.includes('(') && l.includes(')')) {
          const m = this.parseMethodLine(l, methods.length);
          if (m) methods.push(m);
        } else {
          const a = this.parseAttributeLine(l, attributes.length);
          if (a) attributes.push(a);
        }
      }

      nodes.push({
        id: `ocr_txt_${ts}_${idx}`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        elementType,
        stereotype: elementType === 'INTERFACE' ? 'interface' : elementType === 'ENUM' ? 'enumeration' : undefined,
        position: { x: 100 + (idx % 3) * 280, y: 100 + Math.floor(idx / 3) * 230 },
        width: 220,
        attributes,
        methods,
      });
    }

    const connections = this.parseExplicitTextRelations(rawText, nodes);
    return { nodes, connections };
  }

  private resolveOverlappingNodePositions(nodes: UmlClassNode[]): void {
    const minDx = 260;
    const minDy = 190;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = Math.abs(a.position.x - b.position.x);
          const dy = Math.abs(a.position.y - b.position.y);
          if (dx < minDx && dy < minDy) {
            b.position.x = a.position.x + minDx;
          }
        }
      }
    }
  }

  private cleanIdentifier(raw: string): string {
    return raw
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
      .replace(/^(\d)/, '_$1');
  }

  private normalizeOcrType(raw: string, forReturn = false): string {
    const clean = (raw || '').replace(/[;,]/g, '').trim();
    const low = clean.toLowerCase();
    if (!low) return forReturn ? 'void' : 'String';
    if (low === 'void') return 'void';
    if (low === 'uuid' || low === 'guid') return 'UUID';
    if (low === 'string' || low === 'str' || low === 'varchar' || low === 'text') return 'String';
    if (low === 'int' || low === 'integer') return 'Integer';
    if (low === 'long' || low === 'bigint') return 'Long';
    if (low === 'double' || low === 'float') return 'Double';
    if (low === 'decimal' || low === 'bigdecimal') return 'BigDecimal';
    if (low === 'bool' || low === 'boolean') return 'Boolean';
    if (low === 'date' || low === 'localdate') return 'LocalDate';
    if (low === 'datetime' || low === 'timestamp' || low === 'localdatetime') return 'LocalDateTime';
    return clean;
  }
}
