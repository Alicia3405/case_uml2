import { describe, it, expect, beforeEach } from 'vitest';
import { XmiClientSerializer } from './xmi-client-serializer';
import { XmiClientParser } from './xmi-client-parser';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';

describe('XmiClientSerializer & XmiClientParser Round-Trip', () => {
  let serializer: XmiClientSerializer;

  beforeEach(() => {
    serializer = new XmiClientSerializer();
  });

  it('debe serializar y re-importar CLASS (PK/visibility/nullable), INTERFACE, ENUM, NOTE y relaciones sin pérdida', () => {
    const nodes: UmlClassNode[] = [
      {
        id: 'node_enum_1',
        name: 'EstadoOrden',
        elementType: 'ENUM',
        stereotype: 'enumeration',
        position: { x: 60, y: 60 },
        width: 220,
        attributes: [
          { name: 'CREADA', type: 'EnumLiteral', visibility: '+' },
          { name: 'ENVIADA', type: 'EnumLiteral', visibility: '+' },
        ],
        methods: [],
      },
      {
        id: 'node_class_1',
        name: 'OrdenCompra',
        elementType: 'CLASS',
        position: { x: 350, y: 60 },
        width: 240,
        attributes: [
          { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false },
          { name: 'estado', type: 'EstadoOrden', visibility: '#', isPrimaryKey: false, isNullable: false },
        ],
        methods: [
          { name: 'confirmar', parameters: 'usuarioId: UUID', returnType: 'Boolean', visibility: '+' },
        ],
      },
      {
        id: 'node_if_1',
        name: 'IFacturable',
        elementType: 'INTERFACE',
        stereotype: 'interface',
        position: { x: 650, y: 60 },
        width: 220,
        attributes: [],
        methods: [{ name: 'calcularTotal', parameters: '', returnType: 'BigDecimal', visibility: '+' }],
      },
      {
        id: 'node_note_1',
        name: 'Nota_1',
        elementType: 'NOTE',
        noteContent: 'Validar stock antes de confirmar',
        position: { x: 350, y: 300 },
        width: 220,
        attributes: [],
        methods: [],
      },
    ];

    const connections: UmlConnection[] = [
      {
        id: 'conn_real_1',
        sourceNodeId: 'node_class_1',
        targetNodeId: 'node_if_1',
        sourceId: 'node_class_1_right',
        targetId: 'node_if_1_left',
        type: 'realization',
        lineStyle: 'segment',
      },
    ];

    const xmi = serializer.serialize(nodes, connections, 'ModeloOrdenes', 'segment');
    const report = serializer.validateXmi(xmi);

    expect(report.isValid).toBe(true);
    expect(report.roundTripVerified).toBe(true);
    expect(report.totalClasses).toBe(1);
    expect(report.totalInterfaces).toBe(1);
    expect(report.totalEnums).toBe(1);
    expect(report.totalNotes).toBe(1);
    expect(report.totalRelations).toBe(1);

    const parsed = XmiClientParser.parse(xmi);
    const orden = parsed.nodes.find((n) => n.name === 'OrdenCompra')!;
    expect(orden).toBeTruthy();
    expect(orden.attributes[0].isPrimaryKey).toBe(true);
    expect(orden.attributes[0].isNullable).toBe(false);
    expect(orden.attributes[0].visibility).toBe('-');
    expect(orden.attributes[1].visibility).toBe('#');
    expect(orden.attributes[1].type).toBe('EstadoOrden');
    expect(orden.attributes[1].isNullable).toBe(false);

    const enumNode = parsed.nodes.find((n) => n.name === 'EstadoOrden')!;
    expect(enumNode.elementType).toBe('ENUM');
    expect(enumNode.attributes.map((a) => a.name)).toEqual(['CREADA', 'ENVIADA']);

    const noteNode = parsed.nodes.find((n) => n.elementType === 'NOTE')!;
    expect(noteNode.noteContent).toBe('Validar stock antes de confirmar');
  });

  it('debe marcar reporte inválido si el XML está vacío o malformado', () => {
    const emptyReport = serializer.validateXmi('');
    expect(emptyReport.isValid).toBe(false);

    const brokenReport = serializer.validateXmi('<xmi:XMI><sinCerrar></xmi:XMI>');
    expect(brokenReport.isValid).toBe(false);
  });
});

