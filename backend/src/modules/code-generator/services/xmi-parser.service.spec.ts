import { Test, TestingModule } from '@nestjs/testing';
import { XmiParserService } from './xmi-parser.service';
import * as fs from 'fs';
import * as path from 'path';

describe('XmiParserService', () => {
  let service: XmiParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XmiParserService],
    }).compile();

    service = module.get<XmiParserService>(XmiParserService);
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
});
