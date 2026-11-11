import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AiAssistantPanelComponent } from './ai-assistant-panel.component';
import { AiAssistantService, AiResponse } from '../../../../../core/services/ai-assistant.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { LocalOcrVisionService } from '../../../../../core/services/local-ocr-vision.service';
import { VoiceCommandService } from '../../../../../core/services/voice-command.service';

describe('AiAssistantPanelComponent', () => {
  let mockAiService: {
    getAvailableModels: ReturnType<typeof vi.fn>;
    getOllamaConfig: ReturnType<typeof vi.fn>;
    updateOllamaConfig: ReturnType<typeof vi.fn>;
    testOllamaConnection: ReturnType<typeof vi.fn>;
    sendTextPrompt: ReturnType<typeof vi.fn>;
    sendVisionPrompt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAiService = {
      getAvailableModels: vi.fn().mockReturnValue(
        of({
          defaultModel: 'qwen2.5:3b',
          defaultProvider: 'ollama',
          isOllamaAvailable: true,
          models: [
            { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', provider: 'ollama', isLocal: true },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'vertex', isLocal: false },
          ],
        }),
      ),
      getOllamaConfig: vi.fn().mockReturnValue(
        of({
          baseUrl: 'http://localhost:11434',
          model: 'qwen2.5:3b',
          visionModel: 'qwen2.5vl:7b',
          timeoutMs: 30000,
          isCustomRuntime: false,
        }),
      ),
      updateOllamaConfig: vi.fn(),
      testOllamaConnection: vi.fn(),
      sendTextPrompt: vi.fn(),
      sendVisionPrompt: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AiAssistantPanelComponent],
      providers: [
        { provide: AiAssistantService, useValue: mockAiService },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', fullName: 'Alice' }) } },
        { provide: LocalOcrVisionService, useValue: { isProcessing: () => false } },
        { provide: VoiceCommandService, useValue: { parseCommand: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('debe consultar en modo ADVISE sin mutar el lienzo y emitir annotationsCreated', () => {
    const fixture = TestBed.createComponent(AiAssistantPanelComponent);
    fixture.componentRef.setInput('diagramId', 'diag-1');
    fixture.componentRef.setInput('roomCode', 'ROOM-1');
    fixture.componentRef.setInput('selectedNodeIds', ['n1']);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    let mutated = false;
    let emittedAnnotations: any[] = [];
    component.applyMutation.subscribe(() => {
      mutated = true;
    });
    component.annotationsCreated.subscribe((anns) => {
      emittedAnnotations = anns;
    });

    const consultativeResponse: AiResponse = {
      success: true,
      action: 'advise_only',
      message: 'Agrega atributo correo a Cliente',
      nodes: [],
      connections: [],
      changesSummary: 'Asesoría de atributos',
      intentMode: 'ADVISE',
      mutatedDiagram: false,
      annotationsAdded: [
        {
          id: 'ann-1',
          authorName: 'Copilot IA',
          severity: 'idea',
          title: 'Sugerencia en Cliente',
          message: 'Agrega correo: String',
          status: 'open',
        },
      ],
    };
    mockAiService.sendTextPrompt.mockReturnValueOnce(of(consultativeResponse));

    component.setAiSuggestion('¿Qué atributos le faltarían a Cliente?', 'advise');
    component.applyAiPrompt();

    expect(mutated).toBe(false);
    expect(emittedAnnotations).toHaveLength(1);
    expect(mockAiService.sendTextPrompt).toHaveBeenCalledWith(
      '¿Qué atributos le faltarían a Cliente?',
      'diag-1',
      'ROOM-1',
      [],
      [],
      [],
      expect.objectContaining({
        mode: 'advise',
        selectedNodeIds: ['n1'],
      }),
    );
  });

  it('debe permitir consultas en modo solo lectura (VIEWER) forzando advise sin broadcast', () => {
    const fixture = TestBed.createComponent(AiAssistantPanelComponent);
    fixture.componentRef.setInput('diagramId', 'diag-1');
    fixture.componentRef.setInput('isReadOnly', true);
    fixture.detectChanges();

    const component = fixture.componentInstance;

    // Bloquea modo mutate en VIEWER
    component.setAiSuggestion('Borra todo', 'mutate');
    component.applyAiPrompt();
    expect(mockAiService.sendTextPrompt).not.toHaveBeenCalled();

    // Permite consulta en auto -> fuerza advise y broadcastToRoom: false
    mockAiService.sendTextPrompt.mockReturnValueOnce(
      of({
        success: true,
        action: 'advise_only',
        message: 'Explicación teórica',
        nodes: [],
        connections: [],
        changesSummary: 'Solo lectura',
        intentMode: 'ADVISE',
        mutatedDiagram: false,
      }),
    );

    component.setAiSuggestion('¿Por qué usaron herencia aquí?', 'auto');
    component.applyAiPrompt();

    expect(mockAiService.sendTextPrompt).toHaveBeenCalledWith(
      '¿Por qué usaron herencia aquí?',
      'diag-1',
      undefined,
      [],
      [],
      [],
      expect.objectContaining({
        mode: 'advise',
        broadcastToRoom: false,
        createWhiteboardNotes: false,
      }),
    );
  });

  it('debe ejecutar sugerencia con 1 clic en modo mutate y emitir applyMutation', () => {
    const fixture = TestBed.createComponent(AiAssistantPanelComponent);
    fixture.componentRef.setInput('diagramId', 'diag-1');
    fixture.detectChanges();

    const component = fixture.componentInstance;
    let emittedNodesCount = -1;
    component.applyMutation.subscribe((ev) => {
      emittedNodesCount = ev.nodes.length;
    });

    mockAiService.sendTextPrompt.mockReturnValueOnce(
      of({
        success: true,
        action: 'diagram_mutated',
        message: 'Clase actualizada',
        nodes: [{ id: 'n1', name: 'Cliente', position: { x: 0, y: 0 }, width: 220, attributes: [], methods: [] }],
        connections: [],
        changesSummary: 'Se aplicó la sugerencia',
        intentMode: 'MUTATE',
        mutatedDiagram: true,
      }),
    );

    component.executeSuggestion('Agrega PK UUID id a Cliente');

    expect(mockAiService.sendTextPrompt).toHaveBeenCalledWith(
      'Agrega PK UUID id a Cliente',
      'diag-1',
      undefined,
      [],
      [],
      [],
      expect.objectContaining({ mode: 'mutate' }),
    );
    expect(emittedNodesCount).toBe(1);
    expect(component.getIntentBadgeLabel('DISCIPLINE')).toContain('Disciplina OMT/UML');
  });

  it('debe activar automáticamente Tesseract OCR 2D cuando falla la visión del servidor', async () => {
    const fixture = TestBed.createComponent(AiAssistantPanelComponent);
    fixture.componentRef.setInput('diagramId', 'diag-1');
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const ocrService = TestBed.inject(LocalOcrVisionService) as any;
    ocrService.parseDiagramImageOffline = vi.fn().mockResolvedValueOnce({
      success: true,
      nodes: [
        {
          id: 'ocr-n1',
          name: 'Producto',
          elementType: 'CLASS',
          position: { x: 100, y: 100 },
          width: 220,
          attributes: [{ name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false }],
          methods: [],
        },
      ],
      connections: [],
      rawTextExtracted: 'Producto',
      modelUsed: 'Tesseract.js OCR 2D (Offline)',
      processingMs: 120,
    });

    let emittedNodes: any[] = [];
    component.applyMutation.subscribe((ev) => {
      emittedNodes = ev.nodes;
    });

    mockAiService.sendVisionPrompt.mockReturnValueOnce(
      of({
        success: false,
        action: 'error',
        message: 'Could not load the default credentials',
        nodes: [],
        connections: [],
        changesSummary: 'Error de visión',
      }),
    );

    component.attachedImageBase64.set('data:image/png;base64,iVBORw0KGgo=');
    component.applyAiPrompt();

    await vi.waitFor(() => {
      expect(ocrService.parseDiagramImageOffline).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=');
      expect(emittedNodes).toHaveLength(1);
    });
    expect(emittedNodes[0].name).toBe('Producto');
  });
});

