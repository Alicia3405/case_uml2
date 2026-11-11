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

  it('debe permitir actualizar el endpoint Colab/ngrok en caliente y enviar ngrok-skip-browser-warning', async () => {
    const updated = service.setRuntimeConfig({
      baseUrl: 'https://demo-colab.ngrok-free.app/',
      model: 'qwen2.5-coder:7b',
      visionModel: 'qwen2.5vl:7b',
    });

    expect(updated.baseUrl).toBe('https://demo-colab.ngrok-free.app');
    expect(updated.model).toBe('qwen2.5-coder:7b');
    expect(updated.visionModel).toBe('qwen2.5vl:7b');
    expect(updated.isCustomRuntime).toBe(true);

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        models: [{ name: 'qwen2.5-coder:7b' }, { name: 'qwen2.5vl:7b' }],
      }),
    });
    global.fetch = mockFetch as any;

    const testResult = await service.testConnection();
    expect(testResult.ok).toBe(true);
    expect(testResult.hasVisionModel).toBe(true);
    expect(testResult.models).toContain('qwen2.5vl:7b');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://demo-colab.ngrok-free.app/api/tags',
      expect.objectContaining({
        headers: expect.objectContaining({
          'ngrok-skip-browser-warning': 'true',
        }),
      }),
    );
  });

  it('debe enviar imágenes Base64 limpias a Ollama Vision en /api/generate', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ response: '{"nodes":[]}' }),
    });
    global.fetch = mockFetch as any;

    await service.generateContent({
      model: 'qwen2.5vl:7b',
      contents: 'Extrae diagrama',
      images: ['data:image/png;base64,QUJDRA=='],
      formatJson: true,
    });

    const bodyPassed = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(bodyPassed.model).toBe('qwen2.5vl:7b');
    expect(bodyPassed.images).toEqual(['QUJDRA==']);
  });

  it('debe restablecer URL y modelos de entorno cuando resetToEnv es true', () => {
    service.setRuntimeConfig({
      baseUrl: 'https://colab-temp.ngrok-free.app',
      model: 'qwen2.5-coder:7b',
      visionModel: 'llava:7b',
    });
    expect(service.getRuntimeConfig().isCustomRuntime).toBe(true);

    const reset = service.setRuntimeConfig({ resetToEnv: true });
    expect(reset.baseUrl).toBe('http://localhost:11434');
    expect(reset.model).toBe('qwen2.5:3b');
    expect(reset.isCustomRuntime).toBe(false);
  });
});
