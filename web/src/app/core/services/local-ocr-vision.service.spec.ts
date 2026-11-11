import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalOcrVisionService, OcrWordBox } from './local-ocr-vision.service';

describe('LocalOcrVisionService', () => {
  let service: LocalOcrVisionService;

  beforeEach(() => {
    service = new LocalOcrVisionService();
  });

  it('debe extraer palabras desde la estructura de bloques de Tesseract v7 y hacer fallback a data.words', () => {
    const v7Data = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { text: 'Cliente', confidence: 92, bbox: { x0: 10, y0: 10, x1: 90, y1: 30 } },
                    { text: 'ruido', confidence: 12, bbox: { x0: 10, y0: 40, x1: 50, y1: 55 } },
                    { text: '1', confidence: 15, bbox: { x0: 210, y0: 50, x1: 220, y1: 68 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const extractedV7 = service.extractWordBoxes(v7Data);
    expect(extractedV7).toHaveLength(2); // Mantiene 'Cliente' y el token conector '1' aunque su confianza sea 15, filtra ruido
    expect(extractedV7.map((w) => w.text)).toEqual(['Cliente', '1']);

    const legacyData = {
      words: [{ text: 'Pedido', confidence: 88, bbox: { x0: 300, y0: 10, x1: 380, y1: 30 } }],
    };
    const extractedLegacy = service.extractWordBoxes(legacyData);
    expect(extractedLegacy).toHaveLength(1);
    expect(extractedLegacy[0].text).toBe('Pedido');
  });

  it('debe agrupar palabras 2D en dos clases distintas y NO inventar relaciones si no hay tokens ni texto relacional', () => {
    const words: OcrWordBox[] = [
      // Tarjeta izquierda: Usuario (x: 40..220)
      { text: 'Usuario', confidence: 95, bbox: { x0: 80, y0: 40, x1: 170, y1: 60 } },
      { text: '-id', confidence: 90, bbox: { x0: 45, y0: 76, x1: 75, y1: 92 } },
      { text: ':', confidence: 90, bbox: { x0: 78, y0: 76, x1: 84, y1: 92 } },
      { text: 'UUID', confidence: 90, bbox: { x0: 88, y0: 76, x1: 135, y1: 92 } },
      { text: 'PK', confidence: 90, bbox: { x0: 140, y0: 76, x1: 165, y1: 92 } },
      { text: '-email:', confidence: 90, bbox: { x0: 45, y0: 102, x1: 115, y1: 118 } },
      { text: 'String', confidence: 90, bbox: { x0: 120, y0: 102, x1: 180, y1: 118 } },
      { text: '+autenticar():', confidence: 88, bbox: { x0: 45, y0: 130, x1: 155, y1: 146 } },
      { text: 'Boolean', confidence: 88, bbox: { x0: 160, y0: 130, x1: 215, y1: 146 } },

      // Tarjeta derecha muy separada: Producto (x: 520..700)
      { text: 'Producto', confidence: 95, bbox: { x0: 560, y0: 40, x1: 650, y1: 60 } },
      { text: '-nombre:', confidence: 90, bbox: { x0: 525, y0: 76, x1: 600, y1: 92 } },
      { text: 'String', confidence: 90, bbox: { x0: 606, y0: 76, x1: 660, y1: 92 } },
      { text: '-precio:', confidence: 90, bbox: { x0: 525, y0: 102, x1: 595, y1: 118 } },
      { text: 'decimal', confidence: 90, bbox: { x0: 602, y0: 102, x1: 670, y1: 118 } },
    ];

    const result = service.buildAstFromOcrData(words, 'Usuario Producto');
    expect(result.nodes).toHaveLength(2);
    expect(result.connections).toHaveLength(0); // Cero relaciones inventadas

    const userNode = result.nodes.find((n) => n.name === 'Usuario')!;
    expect(userNode).toBeTruthy();
    expect(userNode.attributes).toHaveLength(2);
    expect(userNode.attributes[0]).toMatchObject({
      name: 'id',
      type: 'UUID',
      isPrimaryKey: true,
      isNullable: false,
    });
    expect(userNode.attributes[1]).toMatchObject({
      name: 'email',
      type: 'String',
    });
    expect(userNode.methods).toHaveLength(1);
    expect(userNode.methods[0]).toMatchObject({
      name: 'autenticar',
      returnType: 'Boolean',
    });

    const prodNode = result.nodes.find((n) => n.name === 'Producto')!;
    expect(prodNode).toBeTruthy();
    expect(prodNode.attributes[1]).toMatchObject({
      name: 'precio',
      type: 'BigDecimal',
    });
  });

  it('debe detectar multiplicidades y tipo de relación en el corredor espacial 2D entre tarjetas', () => {
    const words: OcrWordBox[] = [
      // Tarjeta Cliente (x: 40..180)
      { text: 'Cliente', confidence: 95, bbox: { x0: 60, y0: 40, x1: 140, y1: 60 } },
      { text: '-nombre:', confidence: 92, bbox: { x0: 45, y0: 76, x1: 115, y1: 92 } },
      { text: 'String', confidence: 92, bbox: { x0: 120, y0: 76, x1: 175, y1: 92 } },

      // Corredor entre Cliente y Pedido (x: 240..440)
      { text: '1', confidence: 85, bbox: { x0: 230, y0: 60, x1: 242, y1: 76 } },
      { text: '◆', confidence: 85, bbox: { x0: 255, y0: 60, x1: 270, y1: 76 } },
      { text: '*', confidence: 85, bbox: { x0: 430, y0: 60, x1: 442, y1: 76 } },

      // Tarjeta Pedido (x: 500..650)
      { text: 'Pedido', confidence: 95, bbox: { x0: 530, y0: 40, x1: 610, y1: 60 } },
      { text: '-total:', confidence: 92, bbox: { x0: 505, y0: 76, x1: 565, y1: 92 } },
      { text: 'Double', confidence: 92, bbox: { x0: 572, y0: 76, x1: 630, y1: 92 } },
    ];

    const result = service.buildAstFromOcrData(words, 'Cliente 1 * Pedido');
    expect(result.nodes).toHaveLength(2);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).toMatchObject({
      type: 'composition',
      sourceMultiplicity: '1',
      targetMultiplicity: '*',
    });
  });

  it('debe soportar fallback textual con bloques { ... } y relaciones explícitas', () => {
    const rawText = `
      class Persona {
        -id: UUID PK
        -nombre: String NN
      }
      class Estudiante {
        -codigo: String
        +inscribir(cursoId: UUID): Boolean
      }
      enum EstadoMatricula {
        ACTIVA
        RETIRADA
      }
      Estudiante extends Persona
    `;

    const result = service.buildAstFromOcrData([], rawText);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((n) => n.name === 'EstadoMatricula')?.elementType).toBe('ENUM');
    expect(result.nodes.find((n) => n.name === 'EstadoMatricula')?.attributes.map((a) => a.name)).toEqual([
      'ACTIVA',
      'RETIRADA',
    ]);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].type).toBe('generalization');
  });

  it('debe retornar éxito falso sin clases inventadas cuando el OCR no produce texto UML válido', async () => {
    class MockFailOcrService extends LocalOcrVisionService {
      protected override async loadTesseract(): Promise<any> {
        return {
          createWorker: async () => ({
            recognize: async () => ({ data: { text: '1234', blocks: [] } }),
            terminate: async () => {},
          }),
        };
      }
    }

    const mockService = new MockFailOcrService();
    const res = await mockService.parseDiagramImageOffline('data:image/png;base64,AAA');
    expect(res.success).toBe(false);
    expect(res.nodes).toEqual([]);
    expect(res.connections).toEqual([]);
    expect(res.errorMessage).toContain('no se identificaron clases UML');
  });
});

