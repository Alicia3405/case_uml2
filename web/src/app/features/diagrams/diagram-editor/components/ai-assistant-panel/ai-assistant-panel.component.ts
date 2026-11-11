import {
  Component,
  computed,
  inject,
  signal,
  input,
  output,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroSparkles,
  heroChevronRight,
  heroXMark,
  heroMicrophone,
  heroStop,
  heroClipboard,
  heroCamera,
  heroPhoto,
  heroPaperAirplane,
  heroClipboardDocumentCheck,
  heroChatBubbleLeftRight,
  heroCpuChip,
  heroArrowPath,
  heroChevronDown,
  heroChevronUp,
  heroDocumentMagnifyingGlass,
  heroCog6Tooth,
  heroLightBulb,
  heroExclamationTriangle,
  heroBolt,
  heroShieldCheck,
  heroCheck,
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  AiAssistantService,
  AiResponse,
  AiModelOption,
  AiPromptMode,
  AiResolvedIntentMode,
  AiSuggestionItem,
  DisciplineAlertItem,
} from '../../../../../core/services/ai-assistant.service';
import { LocalOcrVisionService } from '../../../../../core/services/local-ocr-vision.service';
import { VoiceCommandService } from '../../../../../core/services/voice-command.service';
import {
  AiAnnotationItem,
  UmlClassNode,
  UmlConnection,
} from '../../../../../core/models/diagram.model';

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  imagePreview?: string;
  retryImageBase64?: string;
  changesSummary?: string;
  providerUsed?: 'ollama' | 'vertex' | 'local-ocr';
  modelUsed?: string;
  intentMode?: AiResolvedIntentMode;
  mutatedDiagram?: boolean;
  suggestions?: AiSuggestionItem[];
  disciplineAlerts?: DisciplineAlertItem[];
  annotationsCount?: number;
  broadcastedToRoom?: boolean;
  timestamp: Date;
  status?: 'success' | 'clarification' | 'error' | 'pending';
}

import { TranslatePipe } from '../../../../../core/i18n';

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroSparkles,
      heroChevronRight,
      heroXMark,
      heroMicrophone,
      heroStop,
      heroClipboard,
      heroCamera,
      heroPhoto,
      heroPaperAirplane,
      heroClipboardDocumentCheck,
      heroChatBubbleLeftRight,
      heroCpuChip,
      heroArrowPath,
      heroChevronDown,
      heroChevronUp,
      heroDocumentMagnifyingGlass,
      heroCog6Tooth,
      heroLightBulb,
      heroExclamationTriangle,
      heroBolt,
      heroShieldCheck,
      heroCheck,
    }),
  ],
  templateUrl: './ai-assistant-panel.component.html',
})
export class AiAssistantPanelComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly aiService = inject(AiAssistantService);
  readonly localOcrService = inject(LocalOcrVisionService);
  private readonly voiceCommandService = inject(VoiceCommandService);

  @ViewChild('chatScrollContainer') chatScrollContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('imageInput') imageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('webcamVideo') webcamVideoRef?: ElementRef<HTMLVideoElement>;

  // Inputs
  readonly isOpen = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly roomCode = input<string | null>(null);
  readonly currentNodes = input<UmlClassNode[]>([]);
  readonly currentConnections = input<UmlConnection[]>([]);
  readonly selectedNodeIds = input<string[]>([]);

  // Outputs
  readonly closePanel = output<void>();
  readonly applyMutation = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
    rawResponse?: any;
  }>();
  readonly annotationsCreated = output<AiAnnotationItem[]>();

  // Modelos de IA disponibles y seleccionados por el usuario
  readonly availableModels = signal<AiModelOption[]>([]);
  readonly selectedModelId = signal<string>('');
  readonly selectedProvider = signal<'ollama' | 'vertex'>('ollama');
  readonly isOllamaAvailable = signal<boolean>(false);
  readonly isLoadingModels = signal<boolean>(false);
  readonly isModelDropdownOpen = signal<boolean>(false);
  readonly serverOllamaVisionModel = signal<string>('qwen2.5vl:7b');

  // Modo de interacción Copilot (2do Examen Parcial)
  readonly promptMode = signal<AiPromptMode>('auto');
  readonly broadcastToRoom = signal<boolean>(true);
  readonly createWhiteboardNotes = signal<boolean>(true);

  readonly modeOptions: Array<{ id: AiPromptMode; label: string; emoji: string; hint: string }> = [
    { id: 'auto', label: 'Auto', emoji: '🤖', hint: 'Detecta automáticamente si consultas o editas' },
    { id: 'advise', label: 'Opinar', emoji: '💡', hint: 'Consejos, atributos y teoría OMT sin tocar el lienzo' },
    { id: 'review', label: 'Revisar', emoji: '🔍', hint: 'Evalúa clases, relaciones o qué hizo el equipo' },
    { id: 'discipline', label: 'OMT/UML', emoji: '📐', hint: 'Disciplina de PKs, N:M y normalización' },
    { id: 'mutate', label: 'Editar', emoji: '⚡', hint: 'Aplica cambios reales sobre clases/atributos' },
    { id: 'recap', label: 'Resumen', emoji: '🕒', hint: 'Resume avances multi-día y autores' },
  ];

  // Conector Ollama Local / Google Colab (ngrok) en caliente
  readonly showOllamaConfig = signal<boolean>(false);
  readonly ollamaUrlDraft = signal<string>('http://localhost:11434');
  readonly ollamaModelDraft = signal<string>('qwen2.5:3b');
  readonly ollamaVisionModelDraft = signal<string>('qwen2.5vl:7b');
  readonly ollamaIsCustomRuntime = signal<boolean>(false);
  readonly isTestingOllama = signal<boolean>(false);
  readonly isSavingOllama = signal<boolean>(false);
  readonly ollamaTestStatus = signal<{ ok: boolean; text: string; models?: string[] } | null>(null);

  // Estados reactivos internos
  readonly isAiProcessing = signal<boolean>(false);
  readonly aiPrompt = signal<string>('');
  readonly attachedImageBase64 = signal<string | null>(null);
  readonly attachedImageName = signal<string | null>(null);
  readonly isVoiceListening = signal<boolean>(false);
  readonly showWebcamModal = signal<boolean>(false);

  readonly selectedFocusNames = computed(() => {
    const ids = new Set(this.selectedNodeIds());
    if (ids.size === 0) return [];
    return this.currentNodes()
      .filter((n) => !n.isAnchor && ids.has(n.id))
      .map((n) => n.name);
  });

  // Historial conversacional
  readonly aiChatMessages = signal<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu compañero Copilot de Modelado UML.\n\nNo editaré el lienzo sin tu permiso: puedes pedirme opinión ("¿qué atributos le pondrías?"), revisar errores OMT/UML, consultar qué avanzaron tus compañeros, o pedirme editar el diagrama. También puedes conectar tu Ollama de Google Colab (ngrok).',
      timestamp: new Date(),
    },
  ]);

  private speechRecognition: any = null;
  private webcamMediaStream: MediaStream | null = null;

  ngOnInit(): void {
    this.loadAvailableModels();
    this.loadOllamaRuntimeConfig(true);
  }

  loadAvailableModels(): void {
    this.isLoadingModels.set(true);
    this.aiService.getAvailableModels().subscribe({
      next: (res) => {
        this.isLoadingModels.set(false);
        const data = (res as any)?.data || res;
        const models: AiModelOption[] = data?.models || [];
        this.availableModels.set(models);
        this.isOllamaAvailable.set(data?.isOllamaAvailable ?? false);
        if (data?.ollamaVisionModel) {
          this.serverOllamaVisionModel.set(data.ollamaVisionModel);
        }

        const savedModelId = localStorage.getItem('uml_preferred_ai_model');
        const foundSaved = models.find((m) => m.id === savedModelId);

        if (foundSaved) {
          this.selectedModelId.set(foundSaved.id);
          this.selectedProvider.set(foundSaved.provider);
        } else if (data?.defaultModel) {
          const def = models.find((m) => m.id === data.defaultModel);
          this.selectedModelId.set(data.defaultModel);
          this.selectedProvider.set(def ? def.provider : (data.defaultProvider || 'ollama'));
        } else if (models.length > 0) {
          this.selectedModelId.set(models[0].id);
          this.selectedProvider.set(models[0].provider);
        }
      },
      error: (err) => {
        this.isLoadingModels.set(false);
        console.warn('No se pudieron listar los modelos de IA:', err);
        this.availableModels.set([
          {
            id: 'gemini-2.5-flash',
            name: 'Google Gemini 2.5 Flash',
            provider: 'vertex',
            isLocal: false,
            description: 'Google Cloud Vertex AI',
          },
        ]);
        this.selectedModelId.set('gemini-2.5-flash');
        this.selectedProvider.set('vertex');
      },
    });
  }

  toggleOllamaConfigPanel(): void {
    const next = !this.showOllamaConfig();
    this.showOllamaConfig.set(next);
    if (next) {
      this.ollamaTestStatus.set(null);
      this.loadOllamaRuntimeConfig(false);
    }
  }

  loadOllamaRuntimeConfig(silent = false): void {
    this.aiService.getOllamaConfig().subscribe({
      next: (cfg) => {
        if (!cfg) return;
        this.ollamaUrlDraft.set(cfg.baseUrl || 'http://localhost:11434');
        this.ollamaModelDraft.set(cfg.model || 'qwen2.5:3b');
        this.ollamaVisionModelDraft.set(cfg.visionModel || 'qwen2.5vl:7b');
        this.ollamaIsCustomRuntime.set(Boolean(cfg.isCustomRuntime));
        this.serverOllamaVisionModel.set(cfg.visionModel || 'qwen2.5vl:7b');
      },
      error: (err) => {
        if (!silent) {
          this.ollamaTestStatus.set({
            ok: false,
            text: err?.error?.message || 'No se pudo obtener la configuración actual de Ollama.',
          });
        }
      },
    });
  }

  testOllamaConnection(): void {
    const url = this.ollamaUrlDraft().trim();
    if (!url || this.isTestingOllama()) return;
    this.isTestingOllama.set(true);
    this.ollamaTestStatus.set(null);

    this.aiService.testOllamaConnection(url).subscribe({
      next: (res) => {
        this.isTestingOllama.set(false);
        if (res.ok) {
          const visionInfo = res.hasVisionModel ? ' • Visión OK' : ' • Sin modelo visión';
          this.ollamaTestStatus.set({
            ok: true,
            text: `Conectado en ${res.latencyMs} ms (${res.models.length} modelos${visionInfo})`,
            models: res.models,
          });
        } else {
          this.ollamaTestStatus.set({
            ok: false,
            text: res.error || 'No respondió el servidor Ollama/Colab en esa URL.',
          });
        }
      },
      error: (err) => {
        this.isTestingOllama.set(false);
        this.ollamaTestStatus.set({
          ok: false,
          text: err?.error?.message || err?.message || 'Error al probar conexión con Ollama/Colab.',
        });
      },
    });
  }

  saveOllamaConfig(): void {
    const baseUrl = this.ollamaUrlDraft().trim();
    if (!baseUrl || this.isSavingOllama()) return;
    this.isSavingOllama.set(true);

    this.aiService
      .updateOllamaConfig({
        baseUrl,
        model: this.ollamaModelDraft().trim() || undefined,
        visionModel: this.ollamaVisionModelDraft().trim() || undefined,
      })
      .subscribe({
        next: (cfg) => {
          this.isSavingOllama.set(false);
          this.ollamaUrlDraft.set(cfg.baseUrl);
          this.ollamaModelDraft.set(cfg.model);
          this.ollamaVisionModelDraft.set(cfg.visionModel);
          this.ollamaIsCustomRuntime.set(Boolean(cfg.isCustomRuntime));
          this.serverOllamaVisionModel.set(cfg.visionModel);
          this.ollamaTestStatus.set({
            ok: true,
            text: `Endpoint conectado en caliente (${cfg.baseUrl}). Actualizando modelos...`,
          });
          localStorage.setItem('uml_preferred_ai_model', cfg.model);
          this.loadAvailableModels();
        },
        error: (err) => {
          this.isSavingOllama.set(false);
          this.ollamaTestStatus.set({
            ok: false,
            text: err?.error?.message || 'URL inválida o rechazada por el servidor.',
          });
        },
      });
  }

  resetOllamaConfig(): void {
    if (this.isSavingOllama()) return;
    this.isSavingOllama.set(true);
    this.aiService.updateOllamaConfig({ resetToEnv: true }).subscribe({
      next: (cfg) => {
        this.isSavingOllama.set(false);
        this.ollamaUrlDraft.set(cfg.baseUrl);
        this.ollamaModelDraft.set(cfg.model);
        this.ollamaVisionModelDraft.set(cfg.visionModel);
        this.ollamaIsCustomRuntime.set(false);
        this.ollamaTestStatus.set({
          ok: true,
          text: `Restablecido a configuración por defecto (${cfg.baseUrl}).`,
        });
        this.loadAvailableModels();
      },
      error: (err) => {
        this.isSavingOllama.set(false);
        this.ollamaTestStatus.set({
          ok: false,
          text: err?.error?.message || 'No se pudo restablecer Ollama.',
        });
      },
    });
  }

  toggleModelDropdown(): void {
    this.isModelDropdownOpen.update((v) => !v);
  }

  closeModelDropdown(): void {
    this.isModelDropdownOpen.set(false);
  }

  selectModel(model: AiModelOption): void {
    this.selectedModelId.set(model.id);
    this.selectedProvider.set(model.provider);
    localStorage.setItem('uml_preferred_ai_model', model.id);
    this.closeModelDropdown();
  }

  onModelChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const modelId = target.value;
    const model = this.availableModels().find((m) => m.id === modelId);
    if (model) {
      this.selectModel(model);
    }
  }

  getSelectedModel(): AiModelOption | undefined {
    return this.availableModels().find((m) => m.id === this.selectedModelId());
  }

  ngOnDestroy(): void {
    if (this.speechRecognition && this.isVoiceListening()) {
      this.speechRecognition.stop();
    }
    this.stopWebcam();
  }

  onAiInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.applyAiPrompt();
    }
  }

  setAiSuggestion(text: string, forcedMode?: AiPromptMode): void {
    this.aiPrompt.set(text);
    if (forcedMode) {
      this.promptMode.set(forcedMode);
    }
  }

  private resolveVisionProviderAndModel(): { provider: 'ollama' | 'vertex'; model: string } {
    const provider = this.selectedProvider();
    const selModel = this.selectedModelId();
    if (provider === 'ollama') {
      const looksLikeVision = /(?:vl|vision|llava|minicpm|moondream)/i.test(selModel);
      return {
        provider: 'ollama',
        model: looksLikeVision
          ? selModel
          : (this.ollamaVisionModelDraft() || this.serverOllamaVisionModel() || 'qwen2.5vl:7b'),
      };
    }
    return {
      provider: 'vertex',
      model: selModel || 'gemini-2.5-flash',
    };
  }

  // -------------------------------------------------------------
  // PROMPT / ENVÍO DE MENSAJES (TEXTO / VISIÓN / CONSULTIVO)
  // -------------------------------------------------------------
  applyAiPrompt(): void {
    const promptText = this.aiPrompt().trim();
    const imageBase64 = this.attachedImageBase64();

    if ((!promptText && !imageBase64) || this.isAiProcessing()) {
      return;
    }

    if (this.isReadOnly() && (imageBase64 || this.promptMode() === 'mutate')) {
      return;
    }

    const effectiveMode: AiPromptMode =
      this.isReadOnly() && this.promptMode() === 'auto'
        ? 'advise'
        : this.promptMode();

    const userMessageText = promptText || (imageBase64 ? 'Digitalizar diagrama desde imagen adjunta' : '');
    const sentImage = imageBase64;
    const mimeMatch = sentImage?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-' + Date.now(),
        sender: 'user',
        text: userMessageText,
        timestamp: new Date(),
        imagePreview: sentImage || undefined,
      },
    ]);

    this.isAiProcessing.set(true);
    this.scrollToBottom();

    const dId = this.diagramId() || 'temp_diagram';
    const rCode = this.roomCode() || undefined;
    const provider = this.selectedProvider();
    const model = this.selectedModelId();
    const commonOpts = {
      mode: effectiveMode,
      broadcastToRoom: this.isReadOnly() ? false : this.broadcastToRoom(),
      createWhiteboardNotes: this.isReadOnly() ? false : this.createWhiteboardNotes(),
      selectedNodeIds: this.selectedNodeIds(),
    };

    if (sentImage) {
      const visionTarget = this.resolveVisionProviderAndModel();
      this.aiService
        .sendVisionPrompt(
          sentImage,
          mimeType,
          promptText || 'Analiza este boceto/diagrama y digitalízalo como entidades UML completas.',
          dId,
          rCode,
          this.currentNodes(),
          this.currentConnections(),
          [],
          {
            ...commonOpts,
            provider: visionTarget.provider,
            model: visionTarget.model,
          },
        )
        .subscribe({
          next: (res) => this.handleAiResponse(res, '📸 Reconocimiento de Boceto / Imagen', sentImage),
          error: (err) => this.handleAiError(err, sentImage),
        });
    } else {
      this.aiService
        .sendTextPrompt(
          promptText,
          dId,
          rCode,
          this.currentNodes(),
          this.currentConnections(),
          [],
          {
            ...commonOpts,
            provider,
            model,
          },
        )
        .subscribe({
          next: (res) => this.handleAiResponse(res, '✨ Copilot IA (Prompt)'),
          error: (err) => this.handleAiError(err),
        });
    }

    this.aiPrompt.set('');
    this.attachedImageBase64.set(null);
    this.attachedImageName.set(null);
  }

  executeSuggestion(suggestedPrompt?: string): void {
    const clean = suggestedPrompt?.trim();
    if (!clean || this.isReadOnly() || this.isAiProcessing()) return;

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-sug-' + Date.now(),
        sender: 'user',
        text: `⚡ Aplicar sugerencia: ${clean}`,
        timestamp: new Date(),
      },
    ]);

    this.isAiProcessing.set(true);
    this.scrollToBottom();

    const dId = this.diagramId() || 'temp_diagram';
    const rCode = this.roomCode() || undefined;
    this.aiService
      .sendTextPrompt(
        clean,
        dId,
        rCode,
        this.currentNodes(),
        this.currentConnections(),
        [],
        {
          provider: this.selectedProvider(),
          model: this.selectedModelId(),
          mode: 'mutate',
          broadcastToRoom: this.broadcastToRoom(),
          createWhiteboardNotes: this.createWhiteboardNotes(),
          selectedNodeIds: this.selectedNodeIds(),
        },
      )
      .subscribe({
        next: (res) => this.handleAiResponse(res, '⚡ Sugerencia Aplicada'),
        error: (err) => this.handleAiError(err),
      });
  }

  async runLocalOcrAnalysis(imageOverride?: string): Promise<void> {
    if (this.isReadOnly() || this.isAiProcessing() || this.localOcrService.isProcessing()) {
      return;
    }

    const targetImage = imageOverride || this.attachedImageBase64();
    if (!targetImage) return;

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-ocr-u-' + Date.now(),
        sender: 'user',
        text: imageOverride
          ? 'Reintentar digitalización offline con Tesseract OCR 2D'
          : 'Digitalizar diagrama offline con Tesseract OCR 2D',
        timestamp: new Date(),
        imagePreview: imageOverride ? undefined : targetImage,
      },
    ]);

    if (!imageOverride) {
      this.aiPrompt.set('');
      this.attachedImageBase64.set(null);
      this.attachedImageName.set(null);
    }

    this.isAiProcessing.set(true);
    this.scrollToBottom();

    const result = await this.localOcrService.parseDiagramImageOffline(targetImage);
    this.isAiProcessing.set(false);

    if (result.success && result.nodes.length > 0) {
      const summary = `OCR Offline 2D detectó ${result.nodes.length} clase(s) y ${result.connections.length} relación(es) en ${result.processingMs} ms.`;
      this.aiChatMessages.update((msgs) => [
        ...msgs,
        {
          id: 'msg-ocr-res-' + Date.now(),
          sender: 'assistant',
          text:
            `Digitalización local completada sin internet (${result.nodes.map((n) => n.name).join(', ')}).` +
            (result.connections.length === 0
              ? '\nNota: Si algunas líneas conectoras no pudieron inferirse desde la imagen, puedes unirlas manualmente o con comandos de voz.'
              : ''),
          changesSummary: summary,
          status: 'success',
          providerUsed: 'local-ocr',
          modelUsed: result.modelUsed,
          timestamp: new Date(),
        },
      ]);

      this.applyMutation.emit({
        nodes: result.nodes,
        connections: result.connections,
        summary,
        rawResponse: result,
      });
    } else {
      const snippet = result.rawTextExtracted
        ? `\n\nTexto detectado: "${result.rawTextExtracted.slice(0, 220)}${result.rawTextExtracted.length > 220 ? '...' : ''}"`
        : '';
      this.aiChatMessages.update((msgs) => [
        ...msgs,
        {
          id: 'msg-ocr-err-' + Date.now(),
          sender: 'assistant',
          text: (result.errorMessage || 'No se pudieron identificar clases UML válidas en la imagen.') + snippet,
          status: 'error',
          providerUsed: 'local-ocr',
          modelUsed: result.modelUsed,
          timestamp: new Date(),
        },
      ]);
    }

    this.scrollToBottom();
  }

  getIntentBadgeLabel(mode?: AiResolvedIntentMode): string {
    switch (mode) {
      case 'ADVISE':
        return '💡 Opinión / Asesoría';
      case 'REVIEW':
        return '🔍 Revisión del Modelo';
      case 'DISCIPLINE':
        return '📐 Disciplina OMT/UML';
      case 'RECAP':
        return '🕒 Resumen Multi-Sesión';
      case 'MUTATE':
        return '⚡ Cambio en Pizarra';
      default:
        return '🤖 Copilot IA';
    }
  }

  private handleAiResponse(res: AiResponse, sourceTag: string, sentImage?: string | null): void {
    this.isAiProcessing.set(false);

    const summary = res.changesSummary || res.message || 'Respuesta de Copilot IA.';
    const isClarification = res.action === 'clarification' || res.action === 'clarification_required';
    const isError = !res.success && !isClarification;

    const shouldMutate =
      res.mutatedDiagram !== undefined
        ? Boolean(res.mutatedDiagram)
        : Boolean(res.action === 'diagram_mutated' || res.action === 'vision_extract');

    let status: 'success' | 'clarification' | 'error' = 'success';
    if (isClarification) status = 'clarification';
    else if (isError) status = 'error';

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-res-' + Date.now(),
        sender: 'assistant',
        text: res.message || (isClarification ? 'Por favor aclara la solicitud.' : '¡Listo!'),
        changesSummary: summary,
        status,
        providerUsed: res.providerUsed,
        modelUsed: res.modelUsed,
        intentMode: res.intentMode,
        mutatedDiagram: shouldMutate,
        suggestions: res.suggestions || [],
        disciplineAlerts: res.disciplineAlerts || [],
        annotationsCount: res.annotationsAdded?.length || 0,
        broadcastedToRoom: Boolean(res.broadcastedToRoom),
        retryImageBase64: isError && sentImage ? sentImage : undefined,
        timestamp: new Date(),
      },
    ]);

    if (res.annotationsAdded && res.annotationsAdded.length > 0) {
      this.annotationsCreated.emit(res.annotationsAdded);
    }

    if (res.success && shouldMutate && !this.isReadOnly() && Array.isArray(res.nodes)) {
      this.applyMutation.emit({
        nodes: res.nodes,
        connections: res.connections || [],
        summary,
        rawResponse: res,
      });
    }

    this.scrollToBottom();
  }

  private handleAiError(err: any, sentImage?: string | null): void {
    this.isAiProcessing.set(false);
    const msg = err.error?.message || err.message || 'Error de conexión con el Asistente IA.';

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-err-' + Date.now(),
        sender: 'assistant',
        text:
          '❌ Ocurrió un error al procesar tu solicitud: ' +
          msg +
          (sentImage ? '\n\nPuedes reintentar offline usando OCR Tesseract local.' : ''),
        retryImageBase64: sentImage || undefined,
        status: 'error',
        timestamp: new Date(),
      },
    ]);

    this.scrollToBottom();
  }

  // -------------------------------------------------------------
  // DICTADO POR VOZ (WEB SPEECH API)
  // -------------------------------------------------------------
  toggleVoiceRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz nativo (Web Speech API). Usa Chrome o Edge.');
      return;
    }

    if (this.isVoiceListening()) {
      this.speechRecognition?.stop();
      this.isVoiceListening.set(false);
      return;
    }

    if (this.voiceCommandService.isListening()) {
      this.voiceCommandService.stopListening();
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.lang = 'es-ES';
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
      };

      this.speechRecognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          const current = this.aiPrompt().trim();
          this.aiPrompt.set(current ? `${current} ${transcript}` : transcript);
        }
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.onerror = () => {
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.start();
    } catch {
      this.isVoiceListening.set(false);
    }
  }

  // -------------------------------------------------------------
  // IMÁGENES / VISION (PEGAR, ARRASTRAR, ARCHIVO)
  // -------------------------------------------------------------
  triggerImageInput(): void {
    this.imageInputRef?.nativeElement?.click();
  }

  onImageSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      this.processImageFile(file);
    }
    target.value = '';
  }

  onPasteImage(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          event.preventDefault();
          this.processImageFile(blob);
          break;
        }
      }
    }
  }

  pasteFromClipboard(): void {
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard
        .read()
        .then((items) => {
          for (const item of items) {
            const imageType = item.types.find((t) => t.startsWith('image/'));
            if (imageType) {
              item.getType(imageType).then((blob) => {
                this.processImageFile(blob);
              });
              return;
            }
          }
          alert('No se encontró ninguna imagen en el portapapeles. Copia una captura con Ctrl+C o tecla Impr Pant primero.');
        })
        .catch(() => {
          alert('Usa el atajo de teclado Ctrl+V dentro del cuadro de texto para pegar la imagen.');
        });
    } else {
      alert('Usa el atajo Ctrl+V dentro del cuadro de texto.');
    }
  }

  onDropImage(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      this.processImageFile(files[0]);
    }
  }

  removeAttachedImage(): void {
    this.attachedImageBase64.set(null);
    this.attachedImageName.set(null);
  }

  private processImageFile(file: File | Blob): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      this.attachedImageBase64.set(base64);
      this.attachedImageName.set((file as File).name || 'captura_pizarra.png');
    };
    reader.readAsDataURL(file);
  }

  // -------------------------------------------------------------
  // CÁMARA WEB
  // -------------------------------------------------------------
  openWebcamModal(): void {
    this.showWebcamModal.set(true);
    setTimeout(() => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((stream) => {
            this.webcamMediaStream = stream;
            if (this.webcamVideoRef?.nativeElement) {
              this.webcamVideoRef.nativeElement.srcObject = stream;
            }
          })
          .catch((err) => {
            alert('No se pudo acceder a la cámara: ' + err.message);
            this.closeWebcamModal();
          });
      }
    }, 100);
  }

  closeWebcamModal(): void {
    this.stopWebcam();
    this.showWebcamModal.set(false);
  }

  private stopWebcam(): void {
    if (this.webcamMediaStream) {
      this.webcamMediaStream.getTracks().forEach((track) => track.stop());
      this.webcamMediaStream = null;
    }
  }

  captureWebcamPhoto(): void {
    if (!this.webcamVideoRef?.nativeElement) return;
    const video = this.webcamVideoRef.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.attachedImageBase64.set(dataUrl);
      this.attachedImageName.set(`foto_camara_${Date.now()}.jpg`);
    }
    this.closeWebcamModal();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatScrollContainerRef?.nativeElement) {
        const el = this.chatScrollContainerRef.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
