import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import {
  AiAnnotationStatus,
  DiagramDto,
  DiagramSnapshotItem,
  SaveDiagramAstRequest,
} from '../models/diagram.model';
import { ApiResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DiagramService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/diagrams`;

  // Signals para estado reactivo
  readonly currentDiagram = signal<DiagramDto | null>(null);
  readonly isSaving = signal<boolean>(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private unwrap<T>(res: any): T {
    return (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
  }

  loadDiagram(diagramId: string): Observable<DiagramDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.get<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}`).pipe(
      map((res) => this.unwrap<DiagramDto>(res)),
      tap((diagram) => {
        this.currentDiagram.set(diagram);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        const msg = err.error?.error?.message || err.error?.message || 'Error al cargar el diagrama';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        return throwError(() => err);
      }),
    );
  }

  loadDiagramsByProject(projectId: string): Observable<DiagramDto[]> {
    this.isLoading.set(true);
    return this.http.get<ApiResponse<DiagramDto[]>>(`${this.apiUrl}/project/${projectId}`).pipe(
      map((res) => this.unwrap<DiagramDto[]>(res)),
      tap(() => this.isLoading.set(false)),
      catchError((err) => {
        this.isLoading.set(false);
        return throwError(() => err);
      }),
    );
  }

  createDiagram(projectId: string, name: string): Observable<DiagramDto> {
    this.isLoading.set(true);
    return this.http.post<ApiResponse<DiagramDto>>(this.apiUrl, { projectId, name }).pipe(
      map((res) => this.unwrap<DiagramDto>(res)),
      tap((diagram) => {
        this.currentDiagram.set(diagram);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        return throwError(() => err);
      }),
    );
  }

  saveAst(diagramId: string, payload: SaveDiagramAstRequest): Observable<DiagramDto> {
    this.isSaving.set(true);
    return this.http.put<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}/ast`, payload).pipe(
      map((res) => this.unwrap<DiagramDto>(res)),
      tap((saved) => {
        this.currentDiagram.set(saved);
        this.isSaving.set(false);
        this.lastSavedAt.set(new Date());
      }),
      catchError((err) => {
        this.isSaving.set(false);
        return throwError(() => err);
      }),
    );
  }

  listSnapshots(diagramId: string): Observable<DiagramSnapshotItem[]> {
    return this.http.get<ApiResponse<DiagramSnapshotItem[]>>(`${this.apiUrl}/${diagramId}/snapshots`).pipe(
      map((res) => this.unwrap<DiagramSnapshotItem[]>(res) || []),
    );
  }

  createSnapshot(diagramId: string, label?: string): Observable<DiagramSnapshotItem> {
    return this.http
      .post<ApiResponse<DiagramSnapshotItem>>(`${this.apiUrl}/${diagramId}/snapshots`, {
        label: label?.trim() || undefined,
      })
      .pipe(map((res) => this.unwrap<DiagramSnapshotItem>(res)));
  }

  restoreSnapshot(diagramId: string, snapshotId: string): Observable<DiagramDto> {
    return this.http
      .post<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}/snapshots/${snapshotId}/restore`, {})
      .pipe(
        map((res) => this.unwrap<DiagramDto>(res)),
        tap((restored) => {
          this.currentDiagram.set(restored);
        }),
      );
  }

  updateAnnotationStatus(
    diagramId: string,
    annotationId: string,
    status: AiAnnotationStatus,
  ): Observable<DiagramDto> {
    return this.http
      .patch<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}/annotations/${annotationId}`, {
        status,
      })
      .pipe(
        map((res) => this.unwrap<DiagramDto>(res)),
        tap((updated) => {
          this.currentDiagram.set(updated);
        }),
      );
  }
}
