import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { AiAssistantService, AvailableModelsResponse, AiResponse } from './ai-assistant.service';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let mockHttpClient: any;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
    service = Object.create(AiAssistantService.prototype);
    (service as any).http = mockHttpClient;
    (service as any).apiUrl = 'http://localhost:3000/api/ai';
  });

  it('debe solicitar la lista de modelos disponibles a /ai/models', () => {
    const mockResponse: AvailableModelsResponse = {
      defaultModel: 'qwen2.5:3b',
      defaultProvider: 'ollama',
      isOllamaAvailable: true,
      models: [
        {
          id: 'qwen2.5:3b',
          name: 'Qwen 2.5 (3B)',
          provider: 'ollama',
          isLocal: true,
        },
        {
          id: 'gemini-2.5-flash',
          name: 'Google Gemini 2.5 Flash',
          provider: 'vertex',
          isLocal: false,
        },
      ],
    };

    mockHttpClient.get.mockReturnValue(of(mockResponse));

    service.getAvailableModels().subscribe((res) => {
      expect(res).toEqual(mockResponse);
      expect(res.models.length).toBe(2);
      expect(res.isOllamaAvailable).toBe(true);
    });

    expect(mockHttpClient.get).toHaveBeenCalledWith(expect.stringContaining('/ai/models'));
  });

  it('debe enviar el proveedor y modelo seleccionados al invocar sendTextPrompt', () => {
    const mockAiResponse: AiResponse = {
      success: true,
      action: 'diagram_mutated',
      message: 'Tabla Creada',
      nodes: [],
      connections: [],
      changesSummary: 'Cambio aplicado',
      providerUsed: 'ollama',
      modelUsed: 'qwen2.5-coder:7b',
    };

    mockHttpClient.post.mockReturnValue(of(mockAiResponse));

    service
      .sendTextPrompt(
        'Crea tabla Factura',
        'diag-123',
        'ROOM-1',
        [],
        [],
        [],
        { provider: 'ollama', model: 'qwen2.5-coder:7b' },
      )
      .subscribe((res) => {
        expect(res).toEqual(mockAiResponse);
        expect(res.providerUsed).toBe('ollama');
        expect(res.modelUsed).toBe('qwen2.5-coder:7b');
      });

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/prompt'),
      expect.objectContaining({
        prompt: 'Crea tabla Factura',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        provider: 'ollama',
        model: 'qwen2.5-coder:7b',
      }),
    );
  });
});
