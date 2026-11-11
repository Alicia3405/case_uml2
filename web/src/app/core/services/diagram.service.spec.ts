import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DiagramService } from './diagram.service';
import { DiagramDto, DiagramSnapshotItem } from '../models/diagram.model';

describe('DiagramService', () => {
  let service: DiagramService;
  let injector: EnvironmentInjector;
  let mockHttpClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
    };
    injector = createEnvironmentInjector(
      [{ provide: HttpClient, useValue: mockHttpClient }],
      null as any,
    );
    runInInjectionContext(injector, () => {
      service = new DiagramService();
    });
  });

  it('debe listar, crear y restaurar snapshots actualizando currentDiagram', () => {
    const sampleSnapshot: DiagramSnapshotItem = {
      id: 'snap-1',
      diagramId: 'diag-1',
      sessionNumber: 2,
      sessionDate: '2026-11-11',
      label: 'Checkpoint pre-entrega',
      summary: '3 clases',
      savedByUserId: 'user-1',
      savedByName: 'Alice',
      createdAt: '2026-11-11T10:00:00Z',
      nodes: [],
      connections: [],
    };
    mockHttpClient.get.mockReturnValueOnce(of({ data: [sampleSnapshot] }));

    service.listSnapshots('diag-1').subscribe((snaps) => {
      expect(snaps).toHaveLength(1);
      expect(snaps[0].label).toBe('Checkpoint pre-entrega');
    });

    mockHttpClient.post.mockReturnValueOnce(of({ data: sampleSnapshot }));
    service.createSnapshot('diag-1', 'Checkpoint pre-entrega').subscribe((snap) => {
      expect(snap.sessionNumber).toBe(2);
    });

    const restoredDiagram: DiagramDto = {
      id: 'diag-1',
      projectId: 'proj-1',
      name: 'Sistema Bancario',
      version: '1.0.0',
      defaultLineStyle: 'adaptive-curve',
      nodes: [],
      connections: [],
      aiAnnotations: [],
      revisionCount: 5,
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-11T10:00:00Z',
    };
    mockHttpClient.post.mockReturnValueOnce(of({ data: restoredDiagram }));
    service.restoreSnapshot('diag-1', 'snap-1').subscribe((diag) => {
      expect(diag.revisionCount).toBe(5);
    });
    expect(service.currentDiagram()?.revisionCount).toBe(5);
  });

  it('debe actualizar el estado de anotaciones de IA en pizarra y refrescar currentDiagram', () => {
    const updatedDiagram: DiagramDto = {
      id: 'diag-1',
      projectId: 'proj-1',
      name: 'Sistema Bancario',
      version: '1.0.0',
      defaultLineStyle: 'adaptive-curve',
      nodes: [],
      connections: [],
      aiAnnotations: [
        {
          id: 'ann-1',
          authorName: 'Copilot IA',
          severity: 'warning',
          title: 'Revisar cardinalidad',
          message: 'Cambiar *..* por clase intermedia',
          status: 'applied',
        },
      ],
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-11T10:05:00Z',
    };

    mockHttpClient.patch.mockReturnValueOnce(of({ data: updatedDiagram }));
    service.updateAnnotationStatus('diag-1', 'ann-1', 'applied').subscribe((diag) => {
      expect(diag.aiAnnotations?.[0].status).toBe('applied');
    });
    expect(service.currentDiagram()?.aiAnnotations?.[0].status).toBe('applied');
  });
});
