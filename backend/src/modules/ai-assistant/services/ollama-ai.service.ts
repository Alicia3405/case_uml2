import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OllamaGenerateOptions {
  model?: string;
  systemInstruction?: string;
  contents: string;
  responseMimeType?: string;
  formatJson?: boolean;
  images?: string[];
}

export interface OllamaModelDetails {
  name: string;
  model: string;
  size: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

@Injectable()
export class OllamaAiService {
  private readonly logger = new Logger(OllamaAiService.name);
  private readonly baseUrl: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434').replace(/\/$/, '');
    this.modelName = this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5:3b';
    this.timeoutMs = parseInt(this.configService.get<string>('OLLAMA_TIMEOUT_MS') || '120000', 10);

    this.logger.log(`[Ollama] Configurado con endpoint: ${this.baseUrl}, modelo: ${this.modelName}`);
  }

  /**
   * Verifica si el servidor Ollama local está respondiendo.
   */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Obtiene la lista de modelos disponibles en Ollama local con metadatos completos.
   */
  async listDetailedModels(): Promise<OllamaModelDetails[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []) as OllamaModelDetails[];
    } catch (err: any) {
      this.logger.warn(`[Ollama] No se pudo listar modelos detallados: ${err.message || err}`);
      return [];
    }
  }

  /**
   * Obtiene la lista simple de nombres de modelos disponibles en Ollama local.
   */
  async listModels(): Promise<string[]> {
    const detailed = await this.listDetailedModels();
    return detailed.map((m) => m.name || m.model);
  }

  /**
   * Genera contenido textual/estructurado (JSON) usando el modelo Qwen en Ollama.
   */
  async generateContent(options: OllamaGenerateOptions): Promise<string> {
    const isJson = options.formatJson || options.responseMimeType?.includes('json');
    const targetModel = options.model || this.modelName;

    const payload: any = {
      model: targetModel,
      prompt: options.contents,
      system: options.systemInstruction || '',
      stream: false,
      format: isJson ? 'json' : undefined,
      options: {
        temperature: 0.1,
        num_ctx: 4096,
        num_thread: 2,
      },
    };
    if (options.images && options.images.length > 0) {
      payload.images = options.images;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.log(`[Ollama] Generando respuesta con ${targetModel}...`);
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (err: any) {
      this.logger.error(`[Ollama] Error en generateContent con ${targetModel}: ${err.message || err}`);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getModelName(): string {
    return this.modelName;
  }
}
