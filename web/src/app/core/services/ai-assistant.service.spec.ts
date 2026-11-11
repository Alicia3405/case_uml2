import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import {
  AiAssistantService,
  AvailableModelsResponse,
  AiResponse,
  OllamaConnectionTestResult,
  OllamaRuntimeConfig,
} from './ai-assistant.service';

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

  it('debe enviar el proveedor, modelo, modo Copilot y contexto de pizarra al invocar sendTextPrompt', () => {
    const mockAiResponse: AiResponse = {
      success: true,
      action: 'advise_only',
      message: 'Te sugiero agregar fechaEmision y total a Factura',
      nodes: [],
      connections: [],
      changesSummary: 'Sugerencia consultiva',
      providerUsed: 'ollama',
      modelUsed: 'qwen2.5-coder:7b',
      intentMode: 'ADVISE',
      mutatedDiagram: false,
      broadcastedToRoom: true,
      annotationsAdded: [
        {
          id: 'ann-1',
          authorName: 'Copilot IA',
          severity: 'idea',
          title: 'Atributos de Factura',
          message: 'Agrega fechaEmision y total',
          status: 'open',
        },
      ],
    };

    mockHttpClient.post.mockReturnValue(of({ data: mockAiResponse }));

    service
      .sendTextPrompt('¿Qué atributos le pondrías a Factura?', 'diag-123', 'ROOM-1', [], [], [], {
        provider: 'ollama',
        model: 'qwen2.5-coder:7b',
        mode: 'advise',
        broadcastToRoom: true,
        createWhiteboardNotes: true,
        selectedNodeIds: ['node-factura'],
        persistChanges: false,
      })
      .subscribe((res) => {
        expect(res).toEqual(mockAiResponse);
        expect(res.intentMode).toBe('ADVISE');
        expect(res.mutatedDiagram).toBe(false);
        expect(res.annotationsAdded).toHaveLength(1);
      });

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/prompt'),
      expect.objectContaining({
        prompt: '¿Qué atributos le pondrías a Factura?',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        provider: 'ollama',
        model: 'qwen2.5-coder:7b',
        mode: 'advise',
        broadcastToRoom: true,
        createWhiteboardNotes: true,
        selectedNodeIds: ['node-factura'],
        persistChanges: false,
      }),
    );
  });

  it('debe enviar comandos de voz por /ai/audio-prompt con opciones de colaboración', () => {
    const mockVoiceResponse: AiResponse = {
      success: true,
      action: 'discipline_report',
      message: 'Revisión completada',
      nodes: [],
      connections: [],
      changesSummary: 'Auditoría OMT',
      intentMode: 'DISCIPLINE',
      mutatedDiagram: false,
    };
    mockHttpClient.post.mockReturnValue(of(mockVoiceResponse));

    service
      .sendAudioPrompt('Revisa el diagrama según reglas OMT', 'diag-voice', 'ROOM-V', [], [], [], {
        mode: 'discipline',
        broadcastToRoom: true,
      })
      .subscribe((res) => {
        expect(res.intentMode).toBe('DISCIPLINE');
      });

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/audio-prompt'),
      expect.objectContaining({
        prompt: 'Revisa el diagrama según reglas OMT',
        diagramId: 'diag-voice',
        mode: 'discipline',
        broadcastToRoom: true,
      }),
    );
  });

  it('debe consultar, actualizar y probar configuración Ollama/Colab en caliente', () => {
    const runtimeConfig: OllamaRuntimeConfig = {
      baseUrl: 'https://demo.ngrok-free.app',
      model: 'qwen2.5:7b',
      visionModel: 'qwen2.5vl:7b',
      timeoutMs: 45000,
      isCustomRuntime: true,
    };
    mockHttpClient.get.mockReturnValueOnce(of({ data: runtimeConfig }));
    service.getOllamaConfig().subscribe((cfg) => {
      expect(cfg.isCustomRuntime).toBe(true);
      expect(cfg.baseUrl).toBe('https://demo.ngrok-free.app');
    });

    mockHttpClient.post.mockReturnValueOnce(of({ data: runtimeConfig }));
    service
      .updateOllamaConfig({
        baseUrl: 'https://demo.ngrok-free.app',
        model: 'qwen2.5:7b',
        visionModel: 'qwen2.5vl:7b',
      })
      .subscribe((cfg) => {
        expect(cfg.model).toBe('qwen2.5:7b');
      });

    const testResult: OllamaConnectionTestResult = {
      ok: true,
      baseUrl: 'https://demo.ngrok-free.app',
      latencyMs: 120,
      models: ['qwen2.5:7b', 'qwen2.5vl:7b'],
      detailedModels: [],
      defaultModel: 'qwen2.5:7b',
      visionModel: 'qwen2.5vl:7b',
      hasVisionModel: true,
    };
    mockHttpClient.post.mockReturnValueOnce(of({ data: testResult }));
    service.testOllamaConnection('https://demo.ngrok-free.app').subscribe((res) => {
      expect(res.ok).toBe(true);
      expect(res.hasVisionModel).toBe(true);
    });
  });
});
