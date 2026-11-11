import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OllamaGenerateOptions {
  model?: string;
  systemInstruction?: string;
  contents: string;
  responseMimeType?: string;
  formatJson?: boolean;
  images?: string[];
  temperature?: number;
  numCtx?: number;
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

export interface OllamaRuntimeConfig {
  baseUrl: string;
  model: string;
  visionModel: string;
  timeoutMs: number;
  isCustomRuntime: boolean;
}

export interface OllamaConnectionTestResult {
  ok: boolean;
  baseUrl: string;
  latencyMs: number;
  models: string[];
  detailedModels: OllamaModelDetails[];
  defaultModel: string;
  visionModel: string;
  hasVisionModel: boolean;
  error?: string;
}

@Injectable()
export class OllamaAiService {
  private readonly logger = new Logger(OllamaAiService.name);
  private readonly initialBaseUrl: string;
  private readonly initialModelName: string;
  private readonly initialVisionModelName: string;
  private runtimeBaseUrl: string;
  private runtimeModelName: string;
  private runtimeVisionModelName: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.initialBaseUrl = (this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434').replace(/\/$/, '');
    this.initialModelName = this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5:3b';
    this.initialVisionModelName = this.configService.get<string>('OLLAMA_VISION_MODEL') || 'qwen2.5vl:7b';
    this.runtimeBaseUrl = this.initialBaseUrl;
    this.runtimeModelName = this.initialModelName;
    this.runtimeVisionModelName = this.initialVisionModelName;
    this.timeoutMs = parseInt(this.configService.get<string>('OLLAMA_TIMEOUT_MS') || '120000', 10);
    this.apiKey = this.configService.get<string>('OLLAMA_API_KEY') || undefined;

    this.logger.log(
      `[Ollama] Configurado con endpoint: ${this.runtimeBaseUrl}, modelo: ${this.runtimeModelName}, visión: ${this.runtimeVisionModelName}`,
    );
  }

  private normalizeAndValidateUrl(rawUrl: string): string {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      throw new BadRequestException('La URL de Ollama no puede estar vacía');
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException(`URL de Ollama inválida: ${trimmed}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('La URL de Ollama debe usar protocolo http:// o https://');
    }

    return parsed.toString().replace(/\/$/, '');
  }

  private buildHeaders(includeJsonContentType = false): Record<string, string> {
    const headers: Record<string, string> = {
      // Evita la pantalla HTML de advertencia en túneles ngrok (ej. Google Colab)
      'ngrok-skip-browser-warning': 'true',
    };
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  getRuntimeConfig(): OllamaRuntimeConfig {
    return {
      baseUrl: this.runtimeBaseUrl,
      model: this.runtimeModelName,
      visionModel: this.runtimeVisionModelName,
      timeoutMs: this.timeoutMs,
      isCustomRuntime:
        this.runtimeBaseUrl !== this.initialBaseUrl ||
        this.runtimeModelName !== this.initialModelName ||
        this.runtimeVisionModelName !== this.initialVisionModelName,
    };
  }

  setRuntimeConfig(update: {
    baseUrl?: string;
    model?: string;
    visionModel?: string;
    resetToEnv?: boolean;
  }): OllamaRuntimeConfig {
    if (update.resetToEnv) {
      this.runtimeBaseUrl = this.initialBaseUrl;
      this.runtimeModelName = this.initialModelName;
      this.runtimeVisionModelName = this.initialVisionModelName;
    }
    if (update.baseUrl !== undefined && update.baseUrl.trim() !== '') {
      this.runtimeBaseUrl = this.normalizeAndValidateUrl(update.baseUrl);
    }
    if (update.model !== undefined && update.model.trim() !== '') {
      this.runtimeModelName = update.model.trim();
    }
    if (update.visionModel !== undefined && update.visionModel.trim() !== '') {
      this.runtimeVisionModelName = update.visionModel.trim();
    }

    this.logger.log(
      `[Ollama] Runtime actualizado -> URL: ${this.runtimeBaseUrl}, modelo: ${this.runtimeModelName}, visión: ${this.runtimeVisionModelName}`,
    );
    return this.getRuntimeConfig();
  }

  /**
   * Prueba la conectividad hacia el endpoint Ollama actual o una URL candidata (Colab/ngrok/localhost).
   */
  async testConnection(overrideBaseUrl?: string): Promise<OllamaConnectionTestResult> {
    const targetUrl = overrideBaseUrl?.trim()
      ? this.normalizeAndValidateUrl(overrideBaseUrl)
      : this.runtimeBaseUrl;

    const startMs = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${targetUrl}/api/tags`, {
        headers: this.buildHeaders(false),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startMs;
      if (!res.ok) {
        return {
          ok: false,
          baseUrl: targetUrl,
          latencyMs,
          models: [],
          detailedModels: [],
          defaultModel: this.runtimeModelName,
          visionModel: this.runtimeVisionModelName,
          hasVisionModel: false,
          error: `Ollama respondió HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      const detailedModels = (data.models || []) as OllamaModelDetails[];
      const models = detailedModels.map((m) => m.name || m.model).filter(Boolean);
      const hasVisionModel = models.some((m) =>
        /(?:vl|vision|llava|minicpm|moondream|qwen2\.5vl|qwen3-vl)/i.test(m),
      );

      return {
        ok: true,
        baseUrl: targetUrl,
        latencyMs,
        models,
        detailedModels,
        defaultModel: this.runtimeModelName,
        visionModel: this.runtimeVisionModelName,
        hasVisionModel,
      };
    } catch (err: any) {
      return {
        ok: false,
        baseUrl: targetUrl,
        latencyMs: Date.now() - startMs,
        models: [],
        detailedModels: [],
        defaultModel: this.runtimeModelName,
        visionModel: this.runtimeVisionModelName,
        hasVisionModel: false,
        error: err?.name === 'AbortError' ? 'Tiempo de espera agotado (5s)' : err?.message || 'Error de conexión',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Verifica si el servidor Ollama configurado está respondiendo.
   */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${this.runtimeBaseUrl}/api/tags`, {
        headers: this.buildHeaders(false),
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
   * Obtiene la lista de modelos disponibles en Ollama con metadatos completos.
   */
  async listDetailedModels(): Promise<OllamaModelDetails[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(`${this.runtimeBaseUrl}/api/tags`, {
        headers: this.buildHeaders(false),
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []) as OllamaModelDetails[];
    } catch (err: any) {
      this.logger.warn(`[Ollama] No se pudo listar modelos detallados: ${err.message || err}`);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Obtiene la lista simple de nombres de modelos disponibles en Ollama.
   */
  async listModels(): Promise<string[]> {
    const detailed = await this.listDetailedModels();
    return detailed.map((m) => m.name || m.model);
  }

  /**
   * Genera contenido textual/estructurado (JSON o texto) y soporta imágenes Base64 para modelos multimodales (ej. qwen2.5vl:7b).
   */
  async generateContent(options: OllamaGenerateOptions): Promise<string> {
    const isJson = options.formatJson || options.responseMimeType?.includes('json');
    const targetModel = options.model || this.runtimeModelName;

    const payload: any = {
      model: targetModel,
      prompt: options.contents,
      system: options.systemInstruction || '',
      stream: false,
      format: isJson ? 'json' : undefined,
      options: {
        temperature: options.temperature ?? 0.1,
        num_ctx: options.numCtx ?? 4096,
      },
    };
    if (options.images && options.images.length > 0) {
      payload.images = options.images.map((img) =>
        img.replace(/^data:[^;]+;base64,/, '').trim(),
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.log(`[Ollama] Generando respuesta con ${targetModel} en ${this.runtimeBaseUrl}...`);
      const response = await fetch(`${this.runtimeBaseUrl}/api/generate`, {
        method: 'POST',
        headers: this.buildHeaders(true),
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
    return this.runtimeModelName;
  }

  getVisionModelName(): string {
    return this.runtimeVisionModelName;
  }

  getBaseUrl(): string {
    return this.runtimeBaseUrl;
  }
}
