import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AiAnnotationItem, UmlClassNode, UmlConnection } from '../models/diagram.model';
import { environment } from '../../../environments/environment';

export type AiPromptMode = 'auto' | 'mutate' | 'advise' | 'review' | 'discipline' | 'recap';
export type AiResolvedIntentMode = 'MUTATE' | 'ADVISE' | 'REVIEW' | 'DISCIPLINE' | 'RECAP';

export interface AiModelOption {
  id: string;
  name: string;
  provider: 'ollama' | 'vertex';
  isLocal: boolean;
  parameterSize?: string;
  sizeMb?: number;
  description?: string;
}

export interface AvailableModelsResponse {
  defaultModel: string;
  defaultProvider: 'ollama' | 'vertex';
  isOllamaAvailable: boolean;
  ollamaBaseUrl?: string;
  ollamaVisionModel?: string;
  models: AiModelOption[];
}

export interface AiSuggestionItem {
  id: string;
  severity: 'idea' | 'warning' | 'discipline';
  targetNodeId?: string;
  targetClassName?: string;
  title: string;
  message: string;
  suggestedPrompt?: string;
}

export interface DisciplineAlertItem {
  code: string;
  severity: 'warning' | 'discipline';
  targetNodeId?: string;
  className?: string;
  message: string;
  suggestedPrompt?: string;
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

export interface AiPromptRequestOptions {
  provider?: 'ollama' | 'vertex';
  model?: string;
  mode?: AiPromptMode;
  broadcastToRoom?: boolean;
  createWhiteboardNotes?: boolean;
  selectedNodeIds?: string[];
  persistChanges?: boolean;
}

export interface AiResponse {
  success: boolean;
  action: string;
  message: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  changesSummary: string;
  providerUsed?: 'ollama' | 'vertex';
  modelUsed?: string;
  intentMode?: AiResolvedIntentMode;
  mutatedDiagram?: boolean;
  suggestions?: AiSuggestionItem[];
  annotationsAdded?: AiAnnotationItem[];
  disciplineAlerts?: DisciplineAlertItem[];
  broadcastedToRoom?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/ai`;

  private unwrap<T>(res: any): T {
    return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
  }

  getAvailableModels(): Observable<AvailableModelsResponse> {
    return this.http.get<any>(`${this.apiUrl}/models`).pipe(
      map((res) => this.unwrap<AvailableModelsResponse>(res)),
    );
  }

  getOllamaConfig(): Observable<OllamaRuntimeConfig> {
    return this.http.get<any>(`${this.apiUrl}/ollama/config`).pipe(
      map((res) => this.unwrap<OllamaRuntimeConfig>(res)),
    );
  }

  updateOllamaConfig(dto: {
    baseUrl?: string;
    model?: string;
    visionModel?: string;
    resetToEnv?: boolean;
  }): Observable<OllamaRuntimeConfig> {
    return this.http.post<any>(`${this.apiUrl}/ollama/config`, dto).pipe(
      map((res) => this.unwrap<OllamaRuntimeConfig>(res)),
    );
  }

  testOllamaConnection(baseUrl?: string): Observable<OllamaConnectionTestResult> {
    return this.http
      .post<any>(`${this.apiUrl}/ollama/test`, {
        baseUrl: baseUrl?.trim() || undefined,
      })
      .pipe(map((res) => this.unwrap<OllamaConnectionTestResult>(res)));
  }

  sendTextPrompt(
    prompt: string,
    diagramId: string,
    roomCode?: string,
    currentNodes: UmlClassNode[] = [],
    currentConnections: UmlConnection[] = [],
    sessionHistory: any[] = [],
    options?: AiPromptRequestOptions,
  ): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/prompt`, {
        prompt,
        diagramId,
        roomCode,
        currentNodes,
        currentConnections,
        sessionHistory,
        provider: options?.provider,
        model: options?.model,
        mode: options?.mode,
        broadcastToRoom: options?.broadcastToRoom,
        createWhiteboardNotes: options?.createWhiteboardNotes,
        selectedNodeIds: options?.selectedNodeIds,
        persistChanges: options?.persistChanges,
      })
      .pipe(map((res) => this.unwrap<AiResponse>(res)));
  }

  sendVisionPrompt(
    imageBase64: string,
    mimeType: string,
    prompt: string | undefined,
    diagramId: string,
    roomCode?: string,
    currentNodes: UmlClassNode[] = [],
    currentConnections: UmlConnection[] = [],
    sessionHistory: any[] = [],
    options?: AiPromptRequestOptions,
  ): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/vision-diagram`, {
        imageBase64,
        mimeType,
        prompt,
        diagramId,
        roomCode,
        currentNodes,
        currentConnections,
        sessionHistory,
        provider: options?.provider,
        model: options?.model,
        mode: options?.mode,
        broadcastToRoom: options?.broadcastToRoom,
        createWhiteboardNotes: options?.createWhiteboardNotes,
        selectedNodeIds: options?.selectedNodeIds,
        persistChanges: options?.persistChanges,
      })
      .pipe(map((res) => this.unwrap<AiResponse>(res)));
  }

  sendAudioPrompt(
    prompt: string,
    diagramId: string,
    roomCode?: string,
    currentNodes: UmlClassNode[] = [],
    currentConnections: UmlConnection[] = [],
    sessionHistory: any[] = [],
    options?: AiPromptRequestOptions,
  ): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/audio-prompt`, {
        prompt,
        diagramId,
        roomCode,
        currentNodes,
        currentConnections,
        sessionHistory,
        provider: options?.provider,
        model: options?.model,
        mode: options?.mode,
        broadcastToRoom: options?.broadcastToRoom,
        createWhiteboardNotes: options?.createWhiteboardNotes,
        selectedNodeIds: options?.selectedNodeIds,
        persistChanges: options?.persistChanges,
      })
      .pipe(map((res) => this.unwrap<AiResponse>(res)));
  }
}

