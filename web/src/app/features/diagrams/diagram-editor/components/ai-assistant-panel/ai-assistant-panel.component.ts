import {
  Component,
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
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import { AiAssistantService, AiResponse, AiModelOption } from '../../../../../core/services/ai-assistant.service';
import {
  UmlClassNode,
  UmlConnection,
} from '../../../../../core/models/diagram.model';

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  imagePreview?: string;
  changesSummary?: string;
  providerUsed?: 'ollama' | 'vertex';
  modelUsed?: string;
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
    }),
  ],
  templateUrl: './ai-assistant-panel.component.html',
})
export class AiAssistantPanelComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly aiService = inject(AiAssistantService);

  @ViewChild('chatScrollContainer') chatScrollContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('imageInput') imageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('webcamVideo') webcamVideoRef?: ElementRef<HTMLVideoElement>;

  // Inputs
  readonly isOpen = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly roomCode = input<string | null>(null);
  readonly currentNodes = input<UmlClassNode[]>([]);
  readonly currentConnections = input<UmlConnection[]>([]);

  // Outputs
  readonly closePanel = output<void>();
  readonly applyMutation = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
    rawResponse?: any;
  }>();

  // Modelos de IA disponibles y seleccionados por el usuario
  readonly availableModels = signal<AiModelOption[]>([]);
  readonly selectedModelId = signal<string>('');
  readonly selectedProvider = signal<'ollama' | 'vertex'>('ollama');
  readonly isOllamaAvailable = signal<boolean>(false);
  readonly isLoadingModels = signal<boolean>(false);
  readonly isModelDropdownOpen = signal<boolean>(false);

  // Estados reactivos internos
  readonly isAiProcessing = signal<boolean>(false);
  readonly aiPrompt = signal<string>('');
  readonly attachedImageBase64 = signal<string | null>(null);
  readonly attachedImageName = signal<string | null>(null);
  readonly isVoiceListening = signal<boolean>(false);
  readonly showWebcamModal = signal<boolean>(false);

  // Historial conversacional
  readonly aiChatMessages = signal<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu Copilot de Modelado UML.\n\nPuedes elegir entre tus modelos locales de Ollama (ej: Qwen 2.5 Coder) o Gemini en la nube mediante el selector de modelos. Pídeme crear tablas, agregar atributos, conectar entidades, o adjuntar un boceto para digitalizarlo.',
      timestamp: new Date(),
    },
  ]);

  private speechRecognition: any = null;
  private webcamMediaStream: MediaStream | null = null;

  ngOnInit(): void {
    this.loadAvailableModels();
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

        // Verificar si existe una preferencia guardada en localStorage
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
        // Fallback en caso de error de red
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

  setAiSuggestion(text: string): void {
    this.aiPrompt.set(text);
  }

  // -------------------------------------------------------------
  // PROMPT / ENVÍO DE MENSAJES (TEXTO / VISIÓN)
  // -------------------------------------------------------------
  applyAiPrompt(): void {
    const promptText = this.aiPrompt().trim();
    const imageBase64 = this.attachedImageBase64();

    if ((!promptText && !imageBase64) || this.isAiProcessing()) {
      return;
    }

    const userMessageText = promptText || (imageBase64 ? 'Digitalizar diagrama desde imagen adjunta' : '');

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-' + Date.now(),
        sender: 'user',
        text: userMessageText,
        timestamp: new Date(),
        imagePreview: imageBase64 || undefined,
      },
    ]);

    this.isAiProcessing.set(true);
    this.scrollToBottom();

    const dId = this.diagramId() || 'temp_diagram';
    const rCode = this.roomCode() || undefined;
    const provider = this.selectedProvider();
    const model = this.selectedModelId();

    if (imageBase64) {
      this.aiService
        .sendVisionPrompt(
          imageBase64,
          'image/jpeg',
          promptText || 'Analiza este boceto/diagrama y digitalízalo como entidades UML completas.',
          dId,
          rCode,
          this.currentNodes(),
          this.currentConnections(),
          [],
          { provider: 'vertex', model: 'gemini-2.5-flash' },
        )
        .subscribe({
          next: (res) => this.handleAiResponse(res, '📸 Reconocimiento de Boceto / Imagen'),
          error: (err) => this.handleAiError(err),
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
          { provider, model },
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

  private handleAiResponse(res: AiResponse, sourceTag: string): void {
    this.isAiProcessing.set(false);

    const summary = res.changesSummary || res.message || 'Diagrama actualizado por Copilot IA.';
    const isClarification = res.action === 'clarification' || res.action === 'clarification_required';
    const isError = !res.success && !isClarification;

    let status: 'success' | 'clarification' | 'error' = 'success';
    if (isClarification) status = 'clarification';
    else if (isError) status = 'error';

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-res-' + Date.now(),
        sender: 'assistant',
        text: res.message || (isClarification ? 'Por favor aclara la solicitud.' : '¡Diagrama modelado con éxito!'),
        changesSummary: summary,
        status,
        providerUsed: res.providerUsed,
        modelUsed: res.modelUsed,
        timestamp: new Date(),
      },
    ]);

    if (res.success && res.nodes && res.nodes.length > 0) {
      this.applyMutation.emit({
        nodes: res.nodes,
        connections: res.connections || [],
        summary,
        rawResponse: res,
      });
    }

    this.scrollToBottom();
  }

  private handleAiError(err: any): void {
    this.isAiProcessing.set(false);
    const msg = err.error?.message || err.message || 'Error de conexión con el Asistente IA.';

    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'msg-err-' + Date.now(),
        sender: 'assistant',
        text: '❌ Ocurrió un error al procesar tu solicitud: ' + msg,
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
