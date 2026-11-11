import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class VertexAiService {
  private readonly logger = new Logger(VertexAiService.name);
  private ai: GoogleGenAI;
  private readonly modelName: string;
  private readonly apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    const project = this.configService.get<string>('GCP_PROJECT_ID') || 'psyched-list-507014-d7';
    const location = this.configService.get<string>('GCP_LOCATION') || 'us-central1';
    const configuredModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-3-flash-preview';
    this.modelName = (configuredModel === 'gemini-2.5-flash') ? 'gemini-3-flash-preview' : configuredModel;
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');

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
        this.logger.log(
          `[VertexAI] Inicializado con Vertex AI ADC en proyecto: ${project}, región: ${location}, modelo: ${this.modelName}`,
        );
      }
    } catch (err) {
      this.logger.error(`[VertexAI] Error al instanciar GoogleGenAI: ${err}`);
    }
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
      this.modelName || 'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.6-flash',
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
