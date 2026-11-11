import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { DemoCollabSeedService } from '../src/modules/projects/services/demo-collab-seed.service';
import { YjsSyncService } from '../src/modules/projects/services/yjs-sync.service';
import { SessionRepository } from '../src/modules/projects/repositories/session.repository';
import { CollaborationGateway } from '../src/modules/projects/gateways/collaboration.gateway';
import { UserRepository } from '../src/modules/auth/repositories/user.repository';
import { OllamaAiService } from '../src/modules/ai-assistant/services/ollama-ai.service';
import { VertexAiService } from '../src/modules/ai-assistant/services/vertex-ai.service';

jest.setTimeout(90000);

describe('MongoDB NoSQL Persistence & Collaboration Continuity (e2e)', () => {
  let app: INestApplication<App>;
  let mongod: MongoMemoryServer;
  const previousUri = process.env.MONGODB_URI;
  const previousJwt = process.env.JWT_SECRET;

  let cesarToken: string;
  let anaToken: string;
  let outsiderToken: string;
  let cesarId: string;
  let anaId: string;
  let ecomProjectId: string;
  let ecomDiagramId: string;
  let createdSnapshotId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 30000 },
    });
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = 'case_studio_ai_e2e_test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (previousUri !== undefined) {
      process.env.MONGODB_URI = previousUri;
    } else {
      delete process.env.MONGODB_URI;
    }
    if (previousJwt !== undefined) {
      process.env.JWT_SECRET = previousJwt;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('debe inicializar los 4 usuarios y 2 proyectos colaborativos de forma idempotente en MongoDB', async () => {
    const cesarLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cesar@uagrm.edu.bo', password: 'Pass1234!' })
      .expect(200);

    cesarToken = cesarLogin.body.data.accessToken;
    cesarId = cesarLogin.body.data.user.id;

    const anaLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@uagrm.edu.bo', password: 'Pass1234!' })
      .expect(200);

    anaToken = anaLogin.body.data.accessToken;
    anaId = anaLogin.body.data.user.id;

    // Re-ejecutar seed y validar idempotencia
    const demoSeed = app.get(DemoCollabSeedService);
    await demoSeed.seedIfNeeded();

    const projectsRes = await request(app.getHttpServer())
      .get('/api/projects')
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);

    const projects = projectsRes.body.data;
    expect(projects).toHaveLength(2);
    const ecom = projects.find((p: any) => p.name === 'Ecommerce Colaborativo Demo');
    expect(ecom).toBeDefined();
    expect(ecom.memberCount).toBe(4);
    ecomProjectId = ecom.id;

    const diagramsRes = await request(app.getHttpServer())
      .get(`/api/diagrams/project/${ecomProjectId}`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);

    expect(diagramsRes.body.data).toHaveLength(1);
    ecomDiagramId = diagramsRes.body.data[0].id;
    expect(diagramsRes.body.data[0].nodes.length).toBeGreaterThanOrEqual(5);
  });

  it('debe devolver 404 al invitar correo inexistente y 403 a un usuario sin acceso al proyecto', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${ecomProjectId}/members`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({ email: 'noexiste@uagrm.edu.bo', role: 'EDITOR' })
      .expect(404);

    const regRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Usuario Externo',
        email: 'externo@uagrm.edu.bo',
        password: 'Pass1234!',
      })
      .expect(201);
    outsiderToken = regRes.body.data.accessToken;

    await request(app.getHttpServer())
      .get(`/api/projects/${ecomProjectId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/diagrams/project/${ecomProjectId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('debe guardar AST con autoría por nodo/evento y soportar creación + restauración de snapshots', async () => {
    const currentRes = await request(app.getHttpServer())
      .get(`/api/diagrams/${ecomDiagramId}`)
      .set('Authorization', `Bearer ${anaToken}`)
      .expect(200);

    const originalNodes = currentRes.body.data.nodes;
    const originalConns = currentRes.body.data.connections;

    const saveRes = await request(app.getHttpServer())
      .put(`/api/diagrams/${ecomDiagramId}/ast`)
      .set('Authorization', `Bearer ${anaToken}`)
      .send({
        defaultLineStyle: 'segment',
        nodes: [
          ...originalNodes.map((n: any) => ({
            id: n.id,
            name: n.name,
            elementType: n.elementType,
            stereotype: n.stereotype,
            noteContent: n.noteContent,
            positionX: n.positionX,
            positionY: n.positionY,
            width: n.width,
            height: n.height,
            isAnchor: n.isAnchor,
            assocMainConnId: n.assocMainConnId,
            attributes: n.attributes,
            methods: n.methods,
          })),
          {
            id: 'node_cupon_ana',
            name: 'CuponDescuento',
            elementType: 'CLASS',
            positionX: 120,
            positionY: 560,
            width: 230,
            attributes: [
              { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
              { name: 'codigo', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
            ],
            methods: [],
          },
        ],
        connections: originalConns,
      })
      .expect(200);

    const cuponNode = saveRes.body.data.nodes.find((n: any) => n.name === 'CuponDescuento');
    expect(cuponNode).toBeDefined();
    expect(cuponNode.createdByName).toBe('Ana Gómez Rojas');
    expect(cuponNode.lastModifiedByName).toBe('Ana Gómez Rojas');

    // Crear checkpoint/snapshot con ValidationPipe forbidNonWhitelisted
    const snapRes = await request(app.getHttpServer())
      .post(`/api/diagrams/${ecomDiagramId}/snapshots`)
      .set('Authorization', `Bearer ${anaToken}`)
      .send({ label: 'Hito con Cupón' })
      .expect(201);

    createdSnapshotId = snapRes.body.data.id;
    expect(snapRes.body.data.label).toBe('Hito con Cupón');

    // Borrar la clase CuponDescuento y restaurar el snapshot
    await request(app.getHttpServer())
      .put(`/api/diagrams/${ecomDiagramId}/ast`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({
        defaultLineStyle: 'segment',
        nodes: originalNodes.map((n: any) => ({
          id: n.id,
          name: n.name,
          elementType: n.elementType,
          stereotype: n.stereotype,
          noteContent: n.noteContent,
          positionX: n.positionX,
          positionY: n.positionY,
          width: n.width,
          height: n.height,
          isAnchor: n.isAnchor,
          assocMainConnId: n.assocMainConnId,
          attributes: n.attributes,
          methods: n.methods,
        })),
        connections: originalConns,
      })
      .expect(200);

    const restoredRes = await request(app.getHttpServer())
      .post(`/api/diagrams/${ecomDiagramId}/snapshots/${createdSnapshotId}/restore`)
      .set('Authorization', `Bearer ${anaToken}`)
      .expect(200);

    expect(restoredRes.body.data.nodes.some((n: any) => n.name === 'CuponDescuento')).toBe(true);
  });

  it('debe mantener continuidad multi-día, mensajes @mención, traspaso de anfitrión y rechazar userId anónimo WS', async () => {
    const yjsService = app.get(YjsSyncService);
    const sessionRepo = app.get(SessionRepository);
    const gateway = app.get(CollaborationGateway);
    const userRepo = app.get(UserRepository);

    // Simular salto al día siguiente para la sesión activa
    const activeSession = await sessionRepo.findActiveByDiagramId(ecomDiagramId);
    expect(activeSession).toBeTruthy();
    await sessionRepo.update(activeSession!.id, {
      lastActiveDay: '2026-11-10',
      activeDateKeys: ['2026-11-10'],
      hostUserId: cesarId,
      hostUserName: 'Cesar Quispe Delgado',
    });

    const day2Session = await yjsService.joinOrCreateSession(
      { diagramId: ecomDiagramId },
      anaId,
    );
    expect(day2Session.sessionNumber).toBeGreaterThanOrEqual(2);
    expect(day2Session.activeDateKeys?.length).toBeGreaterThanOrEqual(2);

    // Simular chat persistente con @cesar para generar notificación
    const cesar = await userRepo.findById(cesarId);
    const { notifications } = await yjsService.recordChatMessage({
      diagramId: ecomDiagramId,
      roomCode: day2Session.roomCode,
      senderType: 'human',
      userId: anaId,
      userName: 'Ana Gómez Rojas',
      message: '@cesar revisa la clase CuponDescuento antes de compilar',
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    // Cesar consulta notificaciones no leídas y resume bundle
    const notifRes = await request(app.getHttpServer())
      .get(`/api/collaboration/notifications?diagramId=${ecomDiagramId}&unreadOnly=true`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);
    expect(notifRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(notifRes.body.data[0].actorName).toBe('Ana Gómez Rojas');

    const resumeRes = await request(app.getHttpServer())
      .get(`/api/collaboration/diagrams/${ecomDiagramId}/resume`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);

    expect(resumeRes.body.data.session.sessionNumber).toBeGreaterThanOrEqual(2);
    expect(resumeRes.body.data.recentMessages.length).toBeGreaterThanOrEqual(1);
    expect(resumeRes.body.data.contributorStats.length).toBeGreaterThanOrEqual(1);
    expect(resumeRes.body.data.snapshots.length).toBeGreaterThanOrEqual(1);

    // Traspaso automático de anfitrión cuando Cesar se desconecta estando Ana conectada
    const transfer = await yjsService.handleHostDisconnectOrTransfer(
      day2Session.id,
      cesar!.id,
      [anaId],
    );
    expect(transfer?.transferred).toBe(true);
    expect(transfer?.newHostUserId).toBe(anaId);
    expect(transfer?.newHostUserName).toBe('Ana Gómez Rojas');

    // WebSocket guard debe rechazar userId anónimo ('anon_fsmo1') sin lanzar error de BD
    const fakeSocket = {
      id: 'sock-anon-test',
      join: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as any;
    const wsResult = await gateway.handleJoinRoom(
      {
        diagramId: ecomDiagramId,
        userId: 'anon_fsmo1',
        userName: 'Colaborador',
      },
      fakeSocket,
    );
    expect(wsResult.success).toBe(false);
    expect(wsResult.session).toBeNull();
  });

  it('Bloque B E2E: runtime Ollama/Colab config, IA consultiva con anotaciones en pizarra sin mutar AST y @IA en chat grupal', async () => {
    const ollamaService = app.get(OllamaAiService);
    const vertexService = app.get(VertexAiService);
    const gateway = app.get(CollaborationGateway);
    const yjsService = app.get(YjsSyncService);

    // 1. Configuración runtime de Ollama / Google Colab + resetToEnv
    const initialCfg = await request(app.getHttpServer())
      .get('/api/ai/ollama/config')
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);
    expect(initialCfg.body.data.baseUrl).toBeDefined();

    const updatedCfg = await request(app.getHttpServer())
      .post('/api/ai/ollama/config')
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({
        baseUrl: 'https://colab-demo-2026.ngrok-free.app',
        model: 'qwen2.5-coder:7b',
        visionModel: 'qwen2.5vl:7b',
      })
      .expect(200);
    expect(updatedCfg.body.data.baseUrl).toBe('https://colab-demo-2026.ngrok-free.app');
    expect(updatedCfg.body.data.isCustomRuntime).toBe(true);

    const ollamaSpy = jest.spyOn(ollamaService, 'isAvailable').mockResolvedValue(false);
    const testFailRes = await request(app.getHttpServer())
      .post('/api/ai/ollama/test')
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({ baseUrl: 'http://127.0.0.1:19999' })
      .expect(200);
    expect(testFailRes.body.data.ok).toBe(false);

    await request(app.getHttpServer())
      .post('/api/ai/ollama/config')
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({ resetToEnv: true })
      .expect(200);

    // 2. Snapshot del AST antes de consultar a la IA
    const beforeDiagram = await request(app.getHttpServer())
      .get(`/api/diagrams/${ecomDiagramId}`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);
    const beforeNodesCount = beforeDiagram.body.data.nodes.length;
    const beforeConnsCount = beforeDiagram.body.data.connections.length;

    const vertexSpy = jest.spyOn(vertexService, 'generateContent').mockResolvedValue(
      JSON.stringify({
        message: 'Equipo: revisé el modelo e identifiqué una oportunidad de mejora en Pedido.',
        summary: 'Sugerencia OMT sin mutar diagrama',
        suggestions: [
          {
            severity: 'idea',
            targetClassName: 'CuponDescuento',
            title: 'Validar fecha de vigencia',
            message: 'Agrega atributo fechaExpiracion LocalDate a CuponDescuento.',
            suggestedPrompt: 'Agrega atributo fechaExpiracion LocalDate a CuponDescuento',
          },
        ],
      }),
    );

    // 3. Consulta en modo ADVISE / REVIEW -> NO muta el lienzo, pero guarda anotaciones en pizarra + mensaje grupal
    const adviseRes = await request(app.getHttpServer())
      .post('/api/ai/prompt')
      .set('Authorization', `Bearer ${anaToken}`)
      .send({
        prompt: '¿Qué opinas de cómo quedó CuponDescuento?',
        diagramId: ecomDiagramId,
        currentNodes: beforeDiagram.body.data.nodes.map((n: any) => ({
          id: n.id,
          name: n.name,
          position: { x: n.positionX, y: n.positionY },
          attributes: n.attributes,
          methods: n.methods,
        })),
        currentConnections: beforeDiagram.body.data.connections,
        createWhiteboardNotes: true,
        broadcastToRoom: true,
      })
      .expect(200);

    expect(adviseRes.body.data.intentMode).toBe('ADVISE');
    expect(adviseRes.body.data.mutatedDiagram).toBe(false);
    expect(adviseRes.body.data.annotationsAdded.length).toBeGreaterThanOrEqual(1);

    const afterAdviseDiagram = await request(app.getHttpServer())
      .get(`/api/diagrams/${ecomDiagramId}`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .expect(200);
    expect(afterAdviseDiagram.body.data.nodes).toHaveLength(beforeNodesCount);
    expect(afterAdviseDiagram.body.data.connections).toHaveLength(beforeConnsCount);
    expect(afterAdviseDiagram.body.data.aiAnnotations.length).toBeGreaterThanOrEqual(1);

    const noteId = afterAdviseDiagram.body.data.aiAnnotations[0].id;
    const patchNoteRes = await request(app.getHttpServer())
      .patch(`/api/diagrams/${ecomDiagramId}/annotations/${noteId}`)
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({ status: 'applied' })
      .expect(200);
    expect(
      patchNoteRes.body.data.aiAnnotations.find((a: any) => a.id === noteId)?.status,
    ).toBe('applied');

    // 4. Modo RECAP multi-día sin mutar
    const recapRes = await request(app.getHttpServer())
      .post('/api/ai/prompt')
      .set('Authorization', `Bearer ${cesarToken}`)
      .send({
        prompt: '¿Qué avanzamos ayer en el proyecto?',
        diagramId: ecomDiagramId,
        currentNodes: beforeDiagram.body.data.nodes,
        currentConnections: beforeDiagram.body.data.connections,
      })
      .expect(200);
    expect(recapRes.body.data.intentMode).toBe('RECAP');
    expect(recapRes.body.data.mutatedDiagram).toBe(false);

    // 5. Invocación directa "@IA ..." dentro del chat grupal WebSocket
    await gateway.handleChatMessage({
      diagramId: ecomDiagramId,
      userId: cesarId,
      userName: 'Cesar Quispe Delgado',
      message: '@IA audita las reglas OMT de este diagrama',
    });

    const historyAfterMention = await yjsService.getRoomHistory(ecomDiagramId, 30);
    const hasHumanTagMsg = historyAfterMention.recentChatMessages.some(
      (m) => m.senderType === 'human' && m.message.includes('@IA audita'),
    );
    const hasAiReplyMsg = historyAfterMention.recentChatMessages.some(
      (m) => m.senderType === 'ai' && (m.aiMode === 'DISCIPLINE' || m.aiMode === 'ADVISE'),
    );
    expect(hasHumanTagMsg).toBe(true);
    expect(hasAiReplyMsg).toBe(true);

    ollamaSpy.mockRestore();
    vertexSpy.mockRestore();
  });
});

