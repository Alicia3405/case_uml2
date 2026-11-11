import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiAssistantService } from './ai-assistant.service';
import { VertexAiService } from './vertex-ai.service';
import { OllamaAiService } from './ollama-ai.service';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let vertexAiService: jest.Mocked<VertexAiService>;
  let collaborationGateway: any;

  beforeEach(async () => {
    const mockVertexAiService = {
      generateContent: jest.fn(),
    };

    const mockOllamaAiService = {
      isAvailable: jest.fn().mockResolvedValue(false),
      listModels: jest.fn().mockResolvedValue([]),
      generateContent: jest.fn(),
      getModelName: jest.fn().mockReturnValue('qwen2.5:3b'),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'AI_PROVIDER') return 'vertex';
        return null;
      }),
    };

    const mockCollaborationGateway = {
      server: {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      },
      lockNodeForAi: jest.fn(),
      unlockNodeForAi: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        { provide: VertexAiService, useValue: mockVertexAiService },
        { provide: OllamaAiService, useValue: mockOllamaAiService },
        { provide: CollaborationGateway, useValue: mockCollaborationGateway },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
    vertexAiService = module.get(VertexAiService);
    collaborationGateway = module.get(CollaborationGateway);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findNodeFuzzy', () => {
    it('debe encontrar nodos con nombres inexactos, plurales o con espacios', () => {
      const nodes = [
        { id: 'n1', name: 'DetalleCompra', position: { x: 0, y: 0 }, attributes: [], methods: [] },
        { id: 'n2', name: 'Usuario', position: { x: 0, y: 0 }, attributes: [], methods: [] },
      ];

      expect(service.findNodeFuzzy(nodes, 'Detalles de compra')?.name).toBe('DetalleCompra');
      expect(service.findNodeFuzzy(nodes, 'detalle de compra')?.name).toBe('DetalleCompra');
      expect(service.findNodeFuzzy(nodes, 'detalle_compra')?.name).toBe('DetalleCompra');
      expect(service.findNodeFuzzy(nodes, 'Usuarios')?.name).toBe('Usuario');
    });
  });

  describe('processTextPrompt', () => {
    it('debe eliminar la tabla y sus conexiones cuando se le pide "elimina la tabla Detalles de compra"', async () => {
      const currentNodes = [
        { id: 'node_compra', name: 'Compra', position: { x: 100, y: 100 }, attributes: [], methods: [] },
        { id: 'node_det_compra', name: 'DetalleCompra', position: { x: 400, y: 100 }, attributes: [], methods: [] },
      ];
      const currentConnections = [
        {
          id: 'conn_1',
          sourceNodeId: 'node_compra',
          targetNodeId: 'node_det_compra',
          sourceId: 'node_compra_right',
          targetId: 'node_det_compra_left',
          type: 'composition',
        },
      ];

      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla DetalleCompra eliminada',
          nodes: [{ id: 'node_compra', name: 'Compra', position: { x: 100, y: 100 }, attributes: [], methods: [] }],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'elimina la tabla de Detalles de compra',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Compra');
      expect(result.connections).toHaveLength(0);
      expect(collaborationGateway.server.to).toHaveBeenCalledWith('diagram_diag-123');
    });

    it('debe eliminar tablas cuando se usa infinitivo como "eliminar tabla DetalleCompra"', async () => {
      const currentNodes = [
        { id: 'node_compra', name: 'Compra', position: { x: 100, y: 100 }, attributes: [], methods: [] },
        { id: 'node_det_compra', name: 'DetalleCompra', position: { x: 400, y: 100 }, attributes: [], methods: [] },
      ];

      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla DetalleCompra eliminada',
          nodes: [{ id: 'node_compra', name: 'Compra', position: { x: 100, y: 100 }, attributes: [], methods: [] }],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'eliminar tabla DetalleCompra',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Compra');
    });

    it('debe eliminar un atributo específico cuando se le pide', async () => {
      const currentNodes = [
        {
          id: 'node_user',
          name: 'Usuario',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'rol', type: 'String' },
          ],
          methods: [],
        },
      ];

      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Atributo rol eliminado',
          nodes: [
            {
              id: 'node_user',
              name: 'Usuario',
              position: { x: 100, y: 100 },
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'elimina el atributo rol de la tabla Usuario',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes[0].attributes).toHaveLength(1);
      expect(result.nodes[0].attributes[0].name).toBe('id');
    });

    it('debe mutar el diagrama agregando la nueva tabla y deduplicando atributos', async () => {
      const currentNodes = [
        {
          id: 'node_1',
          name: 'Usuario',
          position: { x: 100, y: 80 },
          width: 220,
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      const mockVertexResponse = JSON.stringify({
        isClarificationRequired: false,
        message: 'Se creó la tabla Producto y su relación con Usuario.',
        changesSummary: 'Tabla Producto creada con 3 atributos y relación con Usuario',
        nodes: [
          {
            id: 'node_prod',
            name: 'Producto',
            position: { x: 760, y: 80 },
            width: 220,
            attributes: [
              { name: 'id', type: 'UUID' },
              { name: 'nombre', type: 'String' },
              { name: 'precio', type: 'Double' },
            ],
            methods: [{ name: 'getId', parameters: '', returnType: 'UUID' }],
          },
        ],
        connections: [
          {
            id: 'conn_prod_user',
            sourceNodeId: 'node_prod',
            targetNodeId: 'node_1',
            sourceId: 'node_prod_right',
            targetId: 'node_1_left',
            type: 'association',
            sourceMultiplicity: '*',
            targetMultiplicity: '1',
          },
        ],
      });

      vertexAiService.generateContent.mockResolvedValue(mockVertexResponse);

      const result = await service.processTextPrompt({
        prompt: 'Crea una tabla Producto con atributos id UUID, nombre String, precio Double y relacionala con Usuarios con multiplicidad *',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('diagram_mutated');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.name)).toContain('Usuario');
      expect(result.nodes.map(n => n.name)).toContain('Producto');
    });

    it('debe eliminar los atributos de la tabla <<X>> sin eliminar la tabla ni las demás tablas', async () => {
      const currentNodes = [
        {
          id: 'node_x',
          name: 'Cliente',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'nombre', type: 'String' },
          ],
          methods: [],
        },
        {
          id: 'node_y',
          name: 'Pedido',
          position: { x: 400, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Atributos de Cliente eliminados',
          nodes: [
            {
              id: 'node_x',
              name: 'Cliente',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
            {
              id: 'node_y',
              name: 'Pedido',
              position: { x: 400, y: 100 },
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'Elimina los atributos de la tabla <<Cliente>>',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(2);
      const clienteNode = result.nodes.find(n => n.name === 'Cliente');
      expect(clienteNode).toBeDefined();
      expect(clienteNode?.attributes).toHaveLength(0);
      const pedidoNode = result.nodes.find(n => n.name === 'Pedido');
      expect(pedidoNode).toBeDefined();
      expect(pedidoNode?.attributes).toHaveLength(1);
    });

    it('NO debe vaciar el diagrama cuando se le pide "Elimina todos los atributos de la tabla<<X>>"', async () => {
      const currentNodes = [
        {
          id: 'node_x',
          name: 'Cliente',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'email', type: 'String' },
          ],
          methods: [],
        },
        {
          id: 'node_y',
          name: 'Factura',
          position: { x: 400, y: 100 },
          attributes: [{ name: 'total', type: 'Double' }],
          methods: [],
        },
      ];

      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Todos los atributos de la tabla Cliente eliminados',
          nodes: [
            {
              id: 'node_x',
              name: 'Cliente',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
            {
              id: 'node_y',
              name: 'Factura',
              position: { x: 400, y: 100 },
              attributes: [{ name: 'total', type: 'Double' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'Elimina todos los atributos de la tabla<<Cliente>>',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      // El diagrama NO debe quedar vacío
      expect(result.nodes).toHaveLength(2);
      const clienteNode = result.nodes.find(n => n.name === 'Cliente');
      expect(clienteNode).toBeDefined();
      expect(clienteNode?.attributes).toHaveLength(0);
      const facturaNode = result.nodes.find(n => n.name === 'Factura');
      expect(facturaNode).toBeDefined();
      expect(facturaNode?.attributes).toHaveLength(1);
    });

    it('debe limpiar todo el diagrama cuando se solicita explícitamente "elimina todas las tablas"', async () => {
      const currentNodes = [
        { id: 'node_1', name: 'Usuario', position: { x: 100, y: 100 }, attributes: [], methods: [] },
      ];

      const result = await service.processTextPrompt({
        prompt: 'elimina todas las tablas',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(0);
      expect(result.connections).toHaveLength(0);
    });

    it('debe eliminar en cascada la tabla intermedia AB y el ancla cuando se elimina la tabla A', async () => {
      const currentNodes = [
        { id: 'node_a', name: 'Tabla_A', position: { x: 100, y: 100 }, attributes: [], methods: [] },
        { id: 'node_b', name: 'Tabla_B', position: { x: 500, y: 100 }, attributes: [], methods: [] },
        { id: 'anchor_ab', name: '', position: { x: 300, y: 100 }, width: 0, height: 0, isAnchor: true, attributes: [], methods: [] },
        { id: 'node_ab', name: 'Tabla_A_Tabla_B', position: { x: 300, y: 250 }, assocMainConnId: 'conn_main', attributes: [], methods: [] },
      ];

      const currentConnections = [
        {
          id: 'conn_main',
          sourceNodeId: 'node_a',
          targetNodeId: 'node_b',
          sourceId: 'node_a_right',
          targetId: 'node_b_left',
          type: 'association',
          assocAnchorNodeId: 'anchor_ab',
        },
        {
          id: 'conn_dashed',
          sourceNodeId: 'anchor_ab',
          targetNodeId: 'node_ab',
          sourceId: 'anchor_ab',
          targetId: 'node_ab_top',
          type: 'association_class',
        },
      ];

      // La IA devuelve que solo queda Tabla_B (o incluso si devuelve Tabla_B y Tabla_A_Tabla_B por descuido)
      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla Tabla_A eliminada',
          nodes: [
            { id: 'node_b', name: 'Tabla_B', position: { x: 500, y: 100 }, attributes: [], methods: [] },
          ],
          connections: [],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'elimina la tabla Tabla_A',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      // Solo debe quedar Tabla_B
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Tabla_B');
      // Todas las conexiones hacia A o AB deben desaparecer
      expect(result.connections).toHaveLength(0);
    });

    it('debe generar automáticamente la tabla intermedia y el ancla para relaciones muchos a muchos sin tabla intermedia', async () => {
      const currentNodes = [
        { id: 'node_estudiante', name: 'Estudiante', position: { x: 100, y: 100 }, attributes: [{ name: 'id', type: 'UUID' }], methods: [] },
        { id: 'node_curso', name: 'Curso', position: { x: 500, y: 100 }, attributes: [{ name: 'id', type: 'UUID' }], methods: [] },
      ];

      const currentConnections = [
        {
          id: 'conn_mn',
          sourceNodeId: 'node_estudiante',
          targetNodeId: 'node_curso',
          sourceId: 'node_estudiante_right',
          targetId: 'node_curso_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      // Simulamos que la IA devuelve el diagrama con la relación muchos a muchos directa
      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Relación muchos a muchos procesada',
          nodes: currentNodes,
          connections: currentConnections,
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'genera la tabla intermedia de la relación muchos a muchos',
        diagramId: 'diag-123',
        roomCode: 'ROOM-1',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      // Debe haber 4 nodos: Estudiante, Curso, Ancla e Intermedia
      expect(result.nodes).toHaveLength(4);

      const anchorNode = result.nodes.find(n => n.isAnchor);
      expect(anchorNode).toBeDefined();
      expect(anchorNode?.width).toBe(0);

      const assocNode = result.nodes.find(n => n.name === 'Estudiante_Curso');
      expect(assocNode).toBeDefined();
      expect(assocNode?.assocMainConnId).toBe('conn_mn');
      expect(assocNode?.attributes).toEqual([
        { name: 'estudianteId', type: 'UUID' },
        { name: 'cursoId', type: 'UUID' },
      ]);
      expect(assocNode?.attributes.map(a => a.name)).not.toContain('id');
      expect(assocNode?.attributes.map(a => a.name)).not.toContain('fechaRegistro');

      // Debe haber 2 conexiones: la principal y la de enlace «link»
      expect(result.connections).toHaveLength(2);
      const mainConn = result.connections.find(c => c.id === 'conn_mn');
      expect(mainConn?.assocAnchorNodeId).toBe(anchorNode?.id);

      const dashedConn = result.connections.find(c => c.type === 'association_class');
      expect(dashedConn).toBeDefined();
      expect(dashedConn?.name).toBe('«link»');
      expect(dashedConn?.sourceNodeId).toBe(anchorNode?.id);
      expect(dashedConn?.targetNodeId).toBe(assocNode?.id);
    });

    it('debe descartar tablas intermedias y conexiones alucinadas cuando el usuario solo pide agregar una tabla concreta sin relaciones', async () => {
      const currentNodes = [
        { id: 'node_prod', name: 'Products', position: { x: 100, y: 100 }, attributes: [{ name: 'id', type: 'UUID' }], methods: [] },
      ];

      // Simulamos que el LLM alucina agregando Usuario_Products, OrderProduct y una conexión M:N
      vertexAiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Usuario agregado',
          nodes: [
            ...currentNodes,
            { id: 'node_user', name: 'Usuario', position: { x: 400, y: 100 }, attributes: [{ name: 'id', type: 'UUID' }, { name: 'name', type: 'String' }, { name: 'email', type: 'String' }], methods: [] },
            { id: 'node_user_prod', name: 'Usuario_Products', position: { x: 250, y: 300 }, attributes: [{ name: 'usuarioId', type: 'UUID' }, { name: 'productId', type: 'Long' }], methods: [] },
            { id: 'node_order_prod', name: 'OrderProduct', position: { x: 600, y: 300 }, attributes: [{ name: 'orderId', type: 'Long' }, { name: 'productId', type: 'Long' }], methods: [] },
          ],
          connections: [
            {
              id: 'conn_alucinada',
              sourceNodeId: 'node_user',
              targetNodeId: 'node_prod',
              type: 'association',
              sourceMultiplicity: '*',
              targetMultiplicity: '*',
            },
          ],
        }),
      );

      const result = await service.processTextPrompt({
        prompt: 'agrega una tabla usuario con id, name y email',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      // Solo deben existir Products y Usuario (NO Usuario_Products ni OrderProduct)
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.name).sort()).toEqual(['Products', 'Usuario']);

      // No debe haberse creado la conexión alucinada
      expect(result.connections).toHaveLength(0);
    });
  });

  describe('resolveManyToManyRelationships', () => {
    it('debe generar tabla intermedia para multiplicidades *, 0..*, 1..* y n sin alterar relaciones 1 a muchos', () => {
      const nodes = [
        { id: 'n1', name: 'Alumno', position: { x: 100, y: 100 }, attributes: [], methods: [] },
        { id: 'n2', name: 'Materia', position: { x: 500, y: 100 }, attributes: [], methods: [] },
        { id: 'n3', name: 'Profesor', position: { x: 100, y: 400 }, attributes: [], methods: [] },
      ];

      const connections = [
        {
          id: 'conn_1',
          sourceNodeId: 'n1',
          targetNodeId: 'n2',
          sourceId: 'n1_right',
          targetId: 'n2_left',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1..*',
        },
        {
          id: 'conn_2',
          sourceNodeId: 'n3',
          targetNodeId: 'n2',
          sourceId: 'n3_right',
          targetId: 'n2_bottom',
          type: 'association',
          sourceMultiplicity: '1',
          targetMultiplicity: '*',
        },
      ];

      const res = service.resolveManyToManyRelationships(nodes, connections);

      expect(res.resolvedCount).toBe(1);
      // conn_1 se resuelve con tabla intermedia (Alumno_Materia) y ancla
      expect(res.nodes).toHaveLength(5); // 3 originales + 1 ancla + 1 Alumno_Materia
      const assoc = res.nodes.find(n => n.name === 'Alumno_Materia');
      expect(assoc).toBeDefined();

      // conn_2 (1 a *) permanece intacta sin ancla ni tabla intermedia adicional
      const conn2 = res.connections.find(c => c.id === 'conn_2');
      expect(conn2?.assocAnchorNodeId).toBeUndefined();
    });

    it('no debe duplicar la tabla asociativa si Gemini ya extrajo o generó una tabla intermedia (ej: OrderProduct)', () => {
      const nodes = [
        { id: 'node_order', name: 'Order', position: { x: 100, y: 100 }, attributes: [{ name: 'order_id', type: 'UUID' }], methods: [] },
        { id: 'node_product', name: 'Products', position: { x: 600, y: 100 }, attributes: [{ name: 'product_id', type: 'UUID' }], methods: [] },
        {
          id: 'node_order_product',
          name: 'OrderProduct',
          position: { x: 350, y: 300 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'orderId', type: 'UUID' },
            { name: 'productId', type: 'UUID' },
            { name: 'quantity', type: 'Integer' },
          ],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_product',
          sourceId: 'node_order_right',
          targetId: 'node_product_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = service.resolveManyToManyRelationships(nodes, connections);

      // No debe haber creado 'Order_Products', debe haber reutilizado 'OrderProduct'
      const intermediateTables = res.nodes.filter(n => !n.isAnchor && n.name.toLowerCase().includes('order') && n.name.toLowerCase().includes('product'));
      expect(intermediateTables).toHaveLength(1);
      expect(intermediateTables[0].name).toBe('OrderProduct');
      expect(intermediateTables[0].assocMainConnId).toBe('conn_m_n');
      // Debe contener ÚNICAMENTE los 2 IDs foráneos, sin atributo 'id' artificial ni 'quantity'
      expect(intermediateTables[0].attributes).toEqual([
        { name: 'orderId', type: 'UUID' },
        { name: 'productId', type: 'UUID' },
      ]);
      expect(intermediateTables[0].methods).toEqual([]);

      // Debe haber generado el ancla virtual y el conector «link» hacia OrderProduct
      const anchor = res.nodes.find(n => n.isAnchor);
      expect(anchor).toBeDefined();

      const linkConn = res.connections.find(c => c.type === 'association_class');
      expect(linkConn).toBeDefined();
      expect(linkConn?.sourceNodeId).toBe(anchor?.id);
      expect(linkConn?.targetNodeId).toBe('node_order_product');
      expect(linkConn?.name).toBe('«link»');
    });

    it('debe generar en la tabla intermedia sintetizada ÚNICAMENTE los 2 IDs foráneos y nunca id artificial ni fechaRegistro', () => {
      const nodes = [
        { id: 'node_estudiante', name: 'Estudiante', position: { x: 100, y: 100 }, attributes: [{ name: 'codigo', type: 'String' }], methods: [] },
        { id: 'node_curso', name: 'Curso', position: { x: 600, y: 100 }, attributes: [{ name: 'id', type: 'UUID' }], methods: [] },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_estudiante',
          targetNodeId: 'node_curso',
          sourceId: 'node_estudiante_right',
          targetId: 'node_curso_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = service.resolveManyToManyRelationships(nodes, connections);

      const intermediate = res.nodes.find(n => n.assocMainConnId === 'conn_m_n');
      expect(intermediate).toBeDefined();
      // Debe tener exactamente 2 atributos correspondientes a las FKs
      expect(intermediate?.attributes).toEqual([
        { name: 'estudianteId', type: 'String' },
        { name: 'cursoId', type: 'UUID' },
      ]);
      expect(intermediate?.attributes.some(a => a.name.toLowerCase() === 'id')).toBe(false);
      expect(intermediate?.attributes.some(a => a.name === 'fechaRegistro')).toBe(false);
      expect(intermediate?.methods).toEqual([]);
    });

    it('debe podar tablas intermedias duplicadas redundantes manteniendo la entidad con más atributos de dominio', () => {
      const nodes = [
        { id: 'node_order', name: 'Order', position: { x: 100, y: 100 }, attributes: [], methods: [] },
        { id: 'node_product', name: 'Products', position: { x: 600, y: 100 }, attributes: [], methods: [] },
        // Tabla real con atributos de dominio
        {
          id: 'node_order_product_real',
          name: 'OrderProduct',
          position: { x: 350, y: 50 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'orderId', type: 'UUID' },
            { name: 'productId', type: 'UUID' },
            { name: 'quantity', type: 'Integer' },
          ],
          methods: [],
        },
        // Stub autogenerado duplicado
        {
          id: 'node_order_products_stub',
          name: 'Order_Products',
          position: { x: 350, y: 350 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'fechaRegistro', type: 'LocalDateTime' },
          ],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_product',
          sourceId: 'node_order_right',
          targetId: 'node_product_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = service.resolveManyToManyRelationships(nodes, connections);

      // Debe conservar únicamente OrderProduct y eliminar Order_Products
      const remainingAssoc = res.nodes.filter(n => !n.isAnchor && (n.name === 'OrderProduct' || n.name === 'Order_Products'));
      expect(remainingAssoc).toHaveLength(1);
      expect(remainingAssoc[0].id).toBe('node_order_product_real');
      expect(res.nodes.find(n => n.id === 'node_order_products_stub')).toBeUndefined();
    });

    it('debe preservar intactas todas las demás tablas y relaciones (Customer, Delivery, Categories) al resolver la relación M:N', () => {
      const nodes = [
        { id: 'node_customer', name: 'Customer', position: { x: 50, y: 50 }, attributes: [{ name: 'customer_ID', type: 'UUID' }], methods: [] },
        { id: 'node_order', name: 'Order', position: { x: 300, y: 50 }, attributes: [{ name: 'order_ID', type: 'UUID' }], methods: [] },
        { id: 'node_delivery', name: 'Delivery', position: { x: 300, y: 350 }, attributes: [{ name: 'delivery_ID', type: 'UUID' }], methods: [] },
        { id: 'node_products', name: 'Products', position: { x: 600, y: 50 }, attributes: [{ name: 'product_ID', type: 'UUID' }], methods: [] },
        { id: 'node_categories', name: 'Categories', position: { x: 850, y: 50 }, attributes: [{ name: 'category_ID', type: 'UUID' }], methods: [] },
        { id: 'node_order_product', name: 'OrderProduct', position: { x: 450, y: 200 }, attributes: [{ name: 'id', type: 'UUID' }], methods: [] },
      ];

      const connections = [
        {
          id: 'conn_cust_order',
          sourceNodeId: 'node_customer',
          targetNodeId: 'node_order',
          type: 'association',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'conn_order_deliv',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_delivery',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1',
        },
        {
          id: 'conn_order_prod_mn',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_products',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
        {
          id: 'conn_prod_cat',
          sourceNodeId: 'node_products',
          targetNodeId: 'node_categories',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1',
        },
      ];

      const res = service.resolveManyToManyRelationships(nodes, connections);

      // Todas las 5 tablas de dominio originales deben estar presentes
      expect(res.nodes.find(n => n.id === 'node_customer')).toBeDefined();
      expect(res.nodes.find(n => n.id === 'node_order')).toBeDefined();
      expect(res.nodes.find(n => n.id === 'node_delivery')).toBeDefined();
      expect(res.nodes.find(n => n.id === 'node_products')).toBeDefined();
      expect(res.nodes.find(n => n.id === 'node_categories')).toBeDefined();
      expect(res.nodes.find(n => n.id === 'node_order_product')).toBeDefined();

      // Todas las conexiones 1:N originales deben seguir intactas
      expect(res.connections.find(c => c.id === 'conn_cust_order')).toBeDefined();
      expect(res.connections.find(c => c.id === 'conn_order_deliv')).toBeDefined();
      expect(res.connections.find(c => c.id === 'conn_prod_cat')).toBeDefined();

      // La relación M:N debe tener su ancla y enlace «link»
      const mainMn = res.connections.find(c => c.id === 'conn_order_prod_mn');
      expect(mainMn?.assocAnchorNodeId).toBeDefined();

      const linkConn = res.connections.find(c => c.type === 'association_class');
      expect(linkConn).toBeDefined();
      expect(linkConn?.targetNodeId).toBe('node_order_product');
    });
  });

  describe('getAvailableModels', () => {
    it('debe listar modelos de Ollama si está disponible junto a Vertex AI', async () => {
      const mockOllama = (service as any).ollamaAiService;
      mockOllama.isAvailable = jest.fn().mockResolvedValue(true);
      mockOllama.listDetailedModels = jest.fn().mockResolvedValue([
        { name: 'qwen2.5:3b', size: 1929912432, details: { parameter_size: '3.1B' } },
        { name: 'qwen2.5-coder:7b', size: 4683087561, details: { parameter_size: '7.6B' } },
      ]);

      const res = await service.getAvailableModels();
      expect(res.isOllamaAvailable).toBe(true);
      expect(res.models.length).toBe(3);
      expect(res.models.some(m => m.id === 'qwen2.5:3b' && m.isLocal)).toBe(true);
      expect(res.models.some(m => m.id === 'qwen2.5-coder:7b' && m.isLocal)).toBe(true);
      expect(res.models.some(m => m.id === 'gemini-2.5-flash' && !m.isLocal)).toBe(true);
    });

    it('debe devolver solo Vertex AI si Ollama no está disponible', async () => {
      const mockOllama = (service as any).ollamaAiService;
      mockOllama.isAvailable = jest.fn().mockResolvedValue(false);

      const res = await service.getAvailableModels();
      expect(res.isOllamaAvailable).toBe(false);
      expect(res.models.length).toBe(1);
      expect(res.models[0].id).toBe('gemini-2.5-flash');
      expect(res.defaultProvider).toBe('vertex');
    });
  });
});
