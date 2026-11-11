import { describe, it, expect, beforeEach } from 'vitest';
import { UmlAuditService } from './uml-audit.service';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';

describe('UmlAuditService', () => {
  let service: UmlAuditService;

  beforeEach(() => {
    service = new UmlAuditService();
  });

  it('debe detectar clase sin PK explícita y promover candidato o insertar UUID [PK]', () => {
    const nodes: UmlClassNode[] = [
      {
        id: 'n1',
        name: 'Cliente',
        elementType: 'CLASS',
        position: { x: 100, y: 100 },
        width: 220,
        attributes: [
          { name: 'id', type: 'UUID', visibility: '-' },
          { name: 'nombre', type: 'String', visibility: '-' },
        ],
        methods: [],
      },
      {
        id: 'n2',
        name: 'Producto',
        elementType: 'CLASS',
        position: { x: 400, y: 100 },
        width: 220,
        attributes: [{ name: 'precio', type: 'BigDecimal', visibility: '-' }],
        methods: [],
      },
    ];

    const connections: UmlConnection[] = [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        targetNodeId: 'n2',
        sourceId: 'n1_right',
        targetId: 'n2_left',
        type: 'association',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ];

    const report = service.auditDiagram(nodes, connections);
    expect(report.stats.classesMissingPk).toBe(2);
    expect(report.score).toBeLessThan(100);

    const ids = new Set(report.recommendations.map((r) => r.id));
    const fixed = service.applyFixes(nodes, connections, ids);

    expect(fixed.appliedCount).toBe(2);
    // Original inmutado
    expect(nodes[0].attributes[0].isPrimaryKey).toBeUndefined();
    // Nuevo AST corregido
    const clienteFixed = fixed.nodes.find((n) => n.id === 'n1')!;
    expect(clienteFixed.attributes[0].isPrimaryKey).toBe(true);
    expect(clienteFixed.attributes[0].isNullable).toBe(false);

    const prodFixed = fixed.nodes.find((n) => n.id === 'n2')!;
    expect(prodFixed.attributes[0].name).toBe('id');
    expect(prodFixed.attributes[0].isPrimaryKey).toBe(true);
    expect(prodFixed.attributes[0].type).toBe('UUID');
  });

  it('debe descomponer relación M:N directa en tabla intermedia pero ignorar Association Class existente', () => {
    const nodes: UmlClassNode[] = [
      {
        id: 'c1',
        name: 'Estudiante',
        elementType: 'CLASS',
        position: { x: 100, y: 100 },
        width: 220,
        attributes: [{ name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false }],
        methods: [],
      },
      {
        id: 'c2',
        name: 'Curso',
        elementType: 'CLASS',
        position: { x: 500, y: 100 },
        width: 220,
        attributes: [{ name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false }],
        methods: [],
      },
      {
        id: 'anchor_1',
        name: '',
        position: { x: 300, y: 100 },
        width: 0,
        height: 0,
        isAnchor: true,
        attributes: [],
        methods: [],
      },
    ];

    const rawNmConn: UmlConnection = {
      id: 'conn_nm',
      sourceNodeId: 'c1',
      targetNodeId: 'c2',
      sourceId: 'c1_right',
      targetId: 'c2_left',
      type: 'association',
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
    };

    const assocClassConn: UmlConnection = {
      id: 'conn_assoc',
      sourceNodeId: 'c1',
      targetNodeId: 'c2',
      sourceId: 'c1_right',
      targetId: 'c2_left',
      type: 'association',
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
      assocAnchorNodeId: 'anchor_1',
    };

    // 1. Con assocAnchorNodeId NO reporta falso positivo N:M
    const reportClean = service.auditDiagram(nodes, [assocClassConn]);
    expect(reportClean.stats.directManyToManys).toBe(0);

    // 2. Sin assocAnchorNodeId reporta M:N directo y crea tabla intermedia con dos 1:N
    const reportNm = service.auditDiagram(nodes.slice(0, 2), [rawNmConn]);
    expect(reportNm.stats.directManyToManys).toBe(1);

    const nmRec = reportNm.recommendations.find((r) => r.suggestedAction === 'CREATE_JUNCTION_TABLE')!;
    const applied = service.applyFixes(nodes.slice(0, 2), [rawNmConn], new Set([nmRec.id]));

    expect(applied.nodes.length).toBe(3);
    expect(applied.nodes.some((n) => n.name === 'Estudiante_Curso')).toBe(true);
    expect(applied.connections.length).toBe(2);
    expect(applied.connections.every((c) => c.sourceMultiplicity === '1' && c.targetMultiplicity === '1..*')).toBe(true);
  });

  it('debe detectar atributos multivaluados 1FN, dependencias transitivas 3FN y excluir INTERFACE/NOTE/ENUM de missing PK', () => {
    const nodes: UmlClassNode[] = [
      {
        id: 'n_user',
        name: 'Persona',
        elementType: 'CLASS',
        position: { x: 100, y: 100 },
        width: 220,
        attributes: [
          { name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false },
          { name: 'telefonos', type: 'String' },
          { name: 'ciudad', type: 'String' },
          { name: 'pais', type: 'String' },
        ],
        methods: [],
      },
      {
        id: 'n_if',
        name: 'IPagoService',
        elementType: 'INTERFACE',
        position: { x: 400, y: 100 },
        width: 220,
        attributes: [],
        methods: [{ name: 'pagar', parameters: 'monto: BigDecimal', returnType: 'Boolean', visibility: '+' }],
      },
      {
        id: 'n_enum',
        name: 'EstadoPago',
        elementType: 'ENUM',
        position: { x: 400, y: 300 },
        width: 220,
        attributes: [],
        methods: [],
      },
      {
        id: 'n_note',
        name: 'Nota_1',
        elementType: 'NOTE',
        noteContent: 'Regla tributaria vigente',
        position: { x: 100, y: 320 },
        width: 220,
        attributes: [],
        methods: [],
      },
    ];

    const report = service.auditDiagram(nodes, []);
    expect(report.stats.totalClasses).toBe(1);
    expect(report.stats.totalInterfaces).toBe(1);
    expect(report.stats.totalEnums).toBe(1);
    expect(report.stats.totalNotes).toBe(1);
    expect(report.stats.classesMissingPk).toBe(0);
    expect(report.stats.multivaluedAttributes).toBe(1);
    expect(report.stats.transitiveDependencies).toBe(1);
    expect(report.recommendations.some((r) => r.suggestedAction === 'ADD_ENUM_LITERAL')).toBe(true);

    const allIds = new Set(report.recommendations.map((r) => r.id));
    const fixed = service.applyFixes(nodes, [], allIds);

    expect(fixed.nodes.some((n) => n.name === 'PersonaTelefono')).toBe(true);
    expect(fixed.nodes.some((n) => n.name === 'Ubicacion')).toBe(true);
    const enumFixed = fixed.nodes.find((n) => n.id === 'n_enum')!;
    expect(enumFixed.attributes.length).toBe(2);
  });
});

