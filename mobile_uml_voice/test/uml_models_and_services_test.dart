import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_uml_voice/models/uml_models.dart';
import 'package:mobile_uml_voice/services/api_client.dart';
import 'package:mobile_uml_voice/services/uml_audit_helper.dart';
import 'package:mobile_uml_voice/services/uml_voice_commander.dart';

void main() {
  group('ApiClient envelope & error parsing', () {
    test('unwrapEnvelope extrae data cuando existe envelope NestJS', () {
      final wrapped = {
        'statusCode': 200,
        'data': {'id': 'abc', 'name': 'Proyecto X'},
        'timestamp': '2026-11-11T00:00:00Z',
      };
      final unwrapped = ApiClient.unwrapEnvelope(wrapped);
      expect(unwrapped, {'id': 'abc', 'name': 'Proyecto X'});
    });

    test('extractErrorMessage interpreta errores anidados de HttpExceptionFilter', () {
      final res = http.Response(
        jsonEncode({
          'statusCode': 403,
          'error': {
            'code': 'FORBIDDEN',
            'message': ['No tienes permiso canDownloadCode', 'Contacta al OWNER'],
          },
        }),
        403,
      );
      expect(
        ApiClient.extractErrorMessage(res),
        'No tienes permiso canDownloadCode, Contacta al OWNER',
      );
    });
  });

  group('UmlDiagram AST contract & compatibility', () {
    test('toSaveAstPayload cumple SaveDiagramAstDto estricto (sin position ni List en parameters)', () {
      final diagram = UmlDiagram(
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ecommerce Core',
        nodes: [
          UmlNode(
            id: 'mob_1234567890ab',
            name: 'Pedido',
            elementType: UmlElementType.umlClass,
            position: const Offset(120, 240),
            attributes: [
              UmlAttribute(name: 'id', type: 'UUID', isPrimaryKey: true),
            ],
            methods: [
              UmlMethod(
                name: 'aplicarDescuento',
                parameters: 'porcentaje: Double',
                returnType: 'BigDecimal',
              ),
            ],
          ),
        ],
        connections: [
          UmlConnection(
            id: 'conn_1234567890ab',
            sourceNodeId: 'mob_1234567890ab',
            targetNodeId: 'mob_other',
            type: UmlRelationType.generalization,
          ),
        ],
      );

      final payload = diagram.toSaveAstPayload();
      final nodeMap = (payload['nodes'] as List).first as Map<String, dynamic>;
      final methodMap = (nodeMap['methods'] as List).first as Map<String, dynamic>;
      final connMap = (payload['connections'] as List).first as Map<String, dynamic>;

      expect(nodeMap.containsKey('position'), isFalse);
      expect(nodeMap['positionX'], 120.0);
      expect(nodeMap['positionY'], 240.0);
      expect(methodMap['parameters'], isA<String>());
      expect(connMap['type'], 'generalization');
    });

    test('ProjectSummary y UmlRelationType normalizan permisos y herencia', () {
      final project = ProjectSummary.fromJson({
        'id': 'p1',
        'name': 'Ecommerce Demo',
        'createdBy': 'u-cesar',
        'userRole': 'EDITOR',
        'userCanDownloadCode': false,
        'memberCount': 4,
      });

      expect(project.isOwner, isFalse);
      expect(project.isViewer, isFalse);
      expect(project.canDownload, isFalse);
      expect(UmlRelationType.fromString('inheritance'), UmlRelationType.generalization);
    });
  });

  group('UmlVoiceCommander & UmlAuditHelper', () {
    test('Crea clase, interfaz, agrega atributo tipado, conecta herencia y soporta Undo', () {
      final diagram = UmlDiagram(id: 'd1', name: 'Test');

      final r1 = UmlVoiceCommander.executeCommand('Crear clase Persona', diagram);
      expect(r1.success, isTrue);
      expect(diagram.nodes.length, 1);
      expect(diagram.nodes.first.id.length, lessThan(40));

      final r2 = UmlVoiceCommander.executeCommand('Crear clase Paciente', diagram);
      expect(r2.success, isTrue);
      expect(diagram.nodes.length, 2);

      final r3 = UmlVoiceCommander.executeCommand(
        'Agregar atributo saldo tipo decimal a Paciente',
        diagram,
      );
      expect(r3.success, isTrue);
      expect(
        diagram.nodes[1].attributes.any((a) => a.name == 'saldo' && a.type == 'BigDecimal'),
        isTrue,
      );

      final r4 = UmlVoiceCommander.executeCommand(
        'Conectar herencia Paciente con Persona',
        diagram,
      );
      expect(r4.success, isTrue);
      expect(diagram.connections.length, 1);
      expect(diagram.connections.first.type, UmlRelationType.generalization);

      final rUndo = UmlVoiceCommander.executeCommand('Deshacer', diagram);
      expect(rUndo.isUndo, isTrue);
    });

    test('UmlAuditHelper detecta duplicados y ausencia de clave primaria PK', () {
      final diagram = UmlDiagram(
        id: 'd2',
        name: 'Audit',
        nodes: [
          UmlNode(
            id: 'n1',
            name: 'Cliente',
            attributes: [UmlAttribute(name: 'nombre', type: 'String', isPrimaryKey: false)],
          ),
          UmlNode(
            id: 'n2',
            name: 'Cliente',
            attributes: [UmlAttribute(name: 'id', type: 'UUID', isPrimaryKey: true)],
          ),
        ],
      );

      final issues = UmlAuditHelper.auditDiagram(diagram);
      expect(issues.any((i) => i.severity == 'error'), isTrue);
      expect(issues.any((i) => i.title.contains('sin clave primaria')), isTrue);
    });
  });
}

