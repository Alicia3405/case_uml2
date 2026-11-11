import { Test, TestingModule } from '@nestjs/testing';
import { XmiParserService } from './xmi-parser.service';
import { XmiExporterService } from './xmi-exporter.service';
import * as fs from 'fs';
import * as path from 'path';

describe('XmiParserService', () => {
  let service: XmiParserService;
  let exporter: XmiExporterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XmiParserService, XmiExporterService],
    }).compile();

    service = module.get<XmiParserService>(XmiParserService);
    exporter = module.get<XmiExporterService>(XmiExporterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse real Enterprise Architect v17 prueba.xml file correctly with positions and classes', () => {
    const filePath = '/home/evert/uagrm/8voSemestre/inf422/General project/prueba.xml';
    if (fs.existsSync(filePath)) {
      const xmlContent = fs.readFileSync(filePath, 'utf-8');
      const result = service.parseXmi(xmlContent);

      expect(result).toBeDefined();
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);

      const aNode = result.nodes[0];
      expect(aNode).toBeDefined();
      expect(aNode.position).toBeDefined();
      expect(typeof aNode.position.x).toBe('number');
      expect(typeof aNode.position.y).toBe('number');

      expect(result.connections).toBeDefined();
    }
  });

  it('should throw BadRequestException if XML is empty or invalid', () => {
    expect(() => service.parseXmi('')).toThrow();
  });

  it('should round-trip CLASS (with PK/visibility), INTERFACE, ENUM and NOTE elements cleanly', () => {
    const xml = exporter.exportToXmi({
      name: 'RoundTripModel',
      defaultLineStyle: 'segment',
      nodes: [
        {
          id: 'c1',
          name: 'Factura',
          elementType: 'CLASS',
          position: { x: 60, y: 80 },
          attributes: [
            { name: 'codigo', type: 'String', visibility: 'private', isPk: true, isNullable: false },
            { name: 'observacion', type: 'String', visibility: 'protected', isPk: false, isNullable: true },
          ],
          methods: [{ name: 'emitir', returnType: 'Boolean', visibility: 'public', parameters: '' }],
        },
        {
          id: 'i1',
          name: 'Auditable',
          elementType: 'INTERFACE',
          position: { x: 340, y: 80 },
          attributes: [],
          methods: [{ name: 'auditar', returnType: 'void', visibility: 'public', parameters: '' }],
        },
        {
          id: 'e1',
          name: 'EstadoFactura',
          elementType: 'ENUM',
          position: { x: 60, y: 260 },
          attributes: [
            { name: 'BORRADOR', type: 'EnumLiteral' },
            { name: 'EMITIDA', type: 'EnumLiteral' },
          ],
          methods: [],
        },
        {
          id: 'n1',
          name: 'NotaFiscal',
          elementType: 'NOTE',
          noteContent: 'Requiere firma digital',
          position: { x: 340, y: 260 },
        },
      ],
      connections: [],
    });

    const parsed = service.parseXmi(xml);
    expect(parsed.nodes).toHaveLength(4);

    const cls = parsed.nodes.find((n) => n.name === 'Factura');
    expect(cls?.elementType).toBe('CLASS');
    expect(cls?.attributes?.find((a) => a.name === 'codigo')?.isPk).toBe(true);
    expect(cls?.attributes?.find((a) => a.name === 'observacion')?.visibility).toBe('protected');
    expect(cls?.attributes?.find((a) => a.name === 'observacion')?.isNullable).toBe(true);

    const iface = parsed.nodes.find((n) => n.name === 'Auditable');
    expect(iface?.elementType).toBe('INTERFACE');

    const en = parsed.nodes.find((n) => n.name === 'EstadoFactura');
    expect(en?.elementType).toBe('ENUM');
    expect(en?.attributes?.map((a) => a.name)).toEqual(['BORRADOR', 'EMITIDA']);

    const note = parsed.nodes.find((n) => n.elementType === 'NOTE');
    expect(note?.noteContent).toBe('Requiere firma digital');
  });
});
