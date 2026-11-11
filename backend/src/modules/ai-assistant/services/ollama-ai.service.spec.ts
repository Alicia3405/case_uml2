import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaAiService } from './ollama-ai.service';

describe('OllamaAiService', () => {
  let service: OllamaAiService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'OLLAMA_BASE_URL') return 'http://localhost:11434';
        if (key === 'OLLAMA_MODEL') return 'qwen2.5:3b';
        if (key === 'OLLAMA_TIMEOUT_MS') return '5000';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaAiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OllamaAiService>(OllamaAiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
    expect(service.getModelName()).toBe('qwen2.5:3b');
  });

  it('debe verificar disponibilidad exitosamente cuando fetch responde 200', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ models: [{ name: 'qwen2.5:3b' }] }),
    });
    global.fetch = mockFetch as any;

    const available = await service.isAvailable();
    expect(available).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });

  it('debe retornar false en isAvailable si fetch falla', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as any;

    const available = await service.isAvailable();
    expect(available).toBe(false);
  });

  it('debe generar contenido llamando al endpoint /api/generate de Ollama', async () => {
    const mockResponse = JSON.stringify({ action: 'create', nodes: [] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ response: mockResponse }),
    }) as any;

    const result = await service.generateContent({
      systemInstruction: 'Eres un asistente UML',
      contents: 'Crea tabla Cliente',
      formatJson: true,
    });

    expect(result).toBe(mockResponse);
  });
});
