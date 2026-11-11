import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { environment } from '../../../environments/environment';

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
  models: AiModelOption[];
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
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/ai`;

  getAvailableModels(): Observable<AvailableModelsResponse> {
    return this.http.get<any>(`${this.apiUrl}/models`).pipe(
      map((res) => (res && res.data ? res.data : res) as AvailableModelsResponse),
    );
  }

  sendTextPrompt(
    prompt: string,
    diagramId: string,
    roomCode?: string,
    currentNodes: UmlClassNode[] = [],
    currentConnections: UmlConnection[] = [],
    sessionHistory: any[] = [],
    options?: { provider?: 'ollama' | 'vertex'; model?: string },
  ): Observable<AiResponse> {
    return this.http.post<any>(`${this.apiUrl}/prompt`, {
      prompt,
      diagramId,
      roomCode,
      currentNodes,
      currentConnections,
      sessionHistory,
      provider: options?.provider,
      model: options?.model,
    }).pipe(
      map((res) => (res && res.data ? res.data : res) as AiResponse),
    );
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
    options?: { provider?: 'ollama' | 'vertex'; model?: string },
  ): Observable<AiResponse> {
    return this.http.post<any>(`${this.apiUrl}/vision-diagram`, {
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
    }).pipe(
      map((res) => (res && res.data ? res.data : res) as AiResponse),
    );
  }
}

