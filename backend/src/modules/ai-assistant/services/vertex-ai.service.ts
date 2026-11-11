import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class VertexAiService {
  private readonly logger = new Logger(VertexAiService.name);
  private ai: GoogleGenAI;
  private readonly modelName: string;
  private readonly apiKey?: string;
  private missingCredentialsWarned = false;

  constructor(private readonly configService: ConfigService) {
    const project = this.configService.get<string>('GCP_PROJECT_ID') || 'psyched-list-507014-d7';
    const location = this.configService.get<string>('GCP_LOCATION') || 'us-central1';
    const configuredModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
    this.modelName = configuredModel;
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim() || undefined;

    this.initClient(project, location);
  }

  private initClient(project: string, location: string): void {
    try {
      if (this.apiKey) {
        this.ai = new GoogleGenAI({
          apiKey: this.apiKey,
        });
        this.logger.log(
          `[VertexAI/Gemini] Inicializado con API Key directa de Google GenAI, modelo principal: ${this.modelName}`,
        );
      } else {
        this.ai = new GoogleGenAI({
          vertexai: true,
          project,
          location,
        });
        const hasGac = Boolean(process.env['GOOGLE_APPLICATION_CREDENTIALS']?.trim());
        if (hasGac) {
          this.logger.log(
            `[VertexAI] Inicializado con Vertex AI ADC en proyecto: ${project}, región: ${location}, modelo: ${this.modelName}`,
          );
        } else {
          this.logger.warn(
            `[VertexAI] Sin GEMINI_API_KEY ni GOOGLE_APPLICATION_CREDENTIALS explícitos (proyecto: ${project}); se usará ADC si existe en el host o fallback local/determinista.`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`[VertexAI] Error al instanciar GoogleGenAI: ${err}`);
    }
  }

  private isNonRetryableAuthError(error: any): boolean {
    const msg = String(error?.message || error || '');
    return /could not load the default credentials|api[_\s]?key not valid|api_key_invalid|unauthenticated|permission_denied|401\b|403\b/i.test(
      msg,
    );
  }

  async generateContent(options: {
    systemInstruction?: string;
    contents: any;
    responseMimeType?: string;
  }): Promise<string> {
    const config: any = {};
    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    if (options.responseMimeType) {
      config.responseMimeType = options.responseMimeType;
    }

    const candidateModels = [
      this.modelName || 'gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-3-flash-preview',
    ];
    const modelsToTry = Array.from(new Set(candidateModels));

    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      for (const model of modelsToTry) {
        try {
          const response = await this.ai.models.generateContent({
            model,
            contents: options.contents,
            config: Object.keys(config).length > 0 ? config : undefined,
          });
          if (response && response.text) {
            return response.text;
          }
        } catch (error: any) {
          lastError = error;
          if (this.isNonRetryableAuthError(error)) {
            if (!this.missingCredentialsWarned) {
              this.logger.warn(
                `[Gemini] Credenciales de Google/Vertex AI no disponibles (${error?.message || error}). Omitiendo reintentos redundantes.`,
              );
              this.missingCredentialsWarned = true;
            }
            throw error;
          }
          this.logger.warn(`[Gemini] Error con ${model} en intento ${attempt}: ${error?.message || error}. Probando siguiente modelo...`);
        }
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    this.logger.error(`[Gemini] Todos los modelos fallaron: ${lastError?.message || lastError}`);
    throw lastError;
  }
}
