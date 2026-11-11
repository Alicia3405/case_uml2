import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { CollaborationPanelComponent } from './collaboration-panel.component';
import { ChatMessage, CollaborationService } from '../../../../../core/services/collaboration.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { ProjectService } from '../../../../../core/services/project.service';
import { AiAssistantService } from '../../../../../core/services/ai-assistant.service';

describe('CollaborationPanelComponent', () => {
  let chatMessagesSignal = signal<ChatMessage[]>([]);
  let mockCollabService: any;
  let mockProjectService: any;
  let mockAiService: any;

  beforeEach(async () => {
    chatMessagesSignal = signal<ChatMessage[]>([]);
    mockCollabService = {
      isConnected: signal(false),
      activeRoomCode: signal<string | null>(null),
      currentDiagramId: signal<string | null>(null),
      chatMessages: chatMessagesSignal,
      unreadChatCount: signal(0),
      activityLogs: signal([]),
      collaborators: signal([]),
      sessionMeta: signal(null),
      setChatPanelVisible: vi.fn(),
      markChatAsRead: vi.fn(),
      sendChatMessage: vi.fn((msg: string) => {
        chatMessagesSignal.update((list) => [
          ...list,
          {
            id: `u_${list.length}`,
            userId: 'u1',
            userName: 'Luis',
            message: msg,
            timestamp: new Date().toISOString(),
          },
        ]);
      }),
      appendLocalChatMessage: vi.fn((partial: any) => {
        chatMessagesSignal.update((list) => [
          ...list,
          {
            ...partial,
            id: `sys_${list.length}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }),
      getContributions: vi.fn().mockReturnValue(of({ contributorStats: [] })),
      sendActivityLog: vi.fn(),
    };

    mockProjectService = {
      searchUsers: vi.fn().mockReturnValue(
        of([
          {
            id: 'u2',
            fullName: 'Ana Gomez',
            email: 'ana@uagrm.edu.bo',
            alreadyMember: false,
          },
        ]),
      ),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
    };

    mockAiService = {
      sendTextPrompt: vi.fn().mockReturnValue(
        of({
          success: true,
          action: 'advise_only',
          message: 'Agrega atributo precio: Double y stock: Integer a Producto.',
          nodes: [],
          connections: [],
          changesSummary: 'Sugerencia aplicada',
          intentMode: 'ADVISE',
          mutatedDiagram: false,
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [CollaborationPanelComponent],
      providers: [
        { provide: CollaborationService, useValue: mockCollabService },
        {
          provide: AuthService,
          useValue: { currentUser: signal({ id: 'u1', fullName: 'Luis Mendoza', email: 'luis@uagrm.edu.bo' }) },
        },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: AiAssistantService, useValue: mockAiService },
      ],
    }).compileComponents();
  });

  it('debe invocar @IA en modo local y mostrar guía cuando no se antepone @IA', () => {
    const fixture = TestBed.createComponent(CollaborationPanelComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('currentNodes', [
      {
        id: 'n1',
        name: 'Producto',
        elementType: 'CLASS',
        position: { x: 0, y: 0 },
        width: 220,
        attributes: [{ name: 'nombre', type: 'String', visibility: '-' }],
        methods: [],
      },
    ]);
    fixture.detectChanges();

    const component = fixture.componentInstance;

    // 1. Mensaje sin @IA en modo local -> guía de uso
    component.chatDraft.set('hola equipo');
    component.onSendChat();
    expect(mockAiService.sendTextPrompt).not.toHaveBeenCalled();
    expect(chatMessagesSignal().some((m) => m.senderType === 'system')).toBe(true);

    // 2. Mensaje con @IA -> consulta a AiAssistantService con el contexto del lienzo
    component.chatDraft.set('@IA dime cómo mejorar la clase Producto');
    component.onSendChat();
    expect(mockAiService.sendTextPrompt).toHaveBeenCalledWith(
      'dime cómo mejorar la clase Producto',
      'temp_diagram',
      undefined,
      expect.arrayContaining([expect.objectContaining({ name: 'Producto' })]),
      [],
      [],
      expect.objectContaining({ mode: 'auto', broadcastToRoom: false }),
    );
    expect(
      chatMessagesSignal().some(
        (m) => m.senderType === 'ai' && m.message.includes('Agrega atributo precio'),
      ),
    ).toBe(true);
  });

  it('debe buscar colaboradores dinámicamente al escribir y autocompletar al seleccionar', async () => {
    const fixture = TestBed.createComponent(CollaborationPanelComponent);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('projectId', 'proj-1');
    fixture.componentRef.setInput('currentUserRole', 'OWNER');
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.onInviteInputChange('ana');

    await vi.waitFor(() => {
      expect(mockProjectService.searchUsers).toHaveBeenCalledWith('ana', 'proj-1');
      expect(component.inviteSearchResults()).toHaveLength(1);
    });

    component.selectInviteCandidate(component.inviteSearchResults()[0]);
    expect(component.inviteEmail()).toBe('ana@uagrm.edu.bo');
    expect(component.showUserDropdown()).toBe(false);
  });
});

