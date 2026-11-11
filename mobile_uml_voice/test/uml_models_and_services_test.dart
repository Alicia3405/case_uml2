import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_uml_voice/models/uml_models.dart';
import 'package:mobile_uml_voice/services/ai_api_service.dart';
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

  group('2do Parcial: Continuidad Multi-Día, Copiloto IA & Pizarra', () {
    test('UmlNode preserva autoría en colaborativo/deepCopy pero la omite en toSaveAstJson', () {
      final node = UmlNode.fromJson({
        'id': 'n_author',
        'name': 'Factura',
        'elementType': 'class',
        'positionX': 100,
        'positionY': 200,
        'createdByUserId': 'u-cesar',
        'createdByName': 'Cesar Quispe',
        'lastModifiedByUserId': 'u-ana',
        'lastModifiedByName': 'Ana Gómez',
        'lastModifiedAt': '2026-11-11T10:00:00Z',
        'attributes': [],
        'methods': [],
      });

      expect(node.authorBadgeName, 'Ana Gómez');
      expect(node.deepCopy().lastModifiedByName, 'Ana Gómez');

      final collabJson = node.toCollaborativeJson();
      expect(collabJson['createdByUserId'], 'u-cesar');
      expect(collabJson['lastModifiedByName'], 'Ana Gómez');

      final astJson = node.toSaveAstJson();
      expect(astJson.containsKey('createdByUserId'), isFalse);
      expect(astJson.containsKey('createdByName'), isFalse);
      expect(astJson.containsKey('lastModifiedByUserId'), isFalse);
      expect(astJson.containsKey('lastModifiedByName'), isFalse);
      expect(astJson.containsKey('lastModifiedAt'), isFalse);
    });

    test('UmlDiagram.openAnnotationsForNode filtra por nodo/clase solo en estado open', () {
      final diagram = UmlDiagram.fromJson({
        'id': 'd-notes',
        'name': 'Notas',
        'nodes': [
          {'id': 'n1', 'name': 'Pedido', 'elementType': 'class', 'positionX': 0, 'positionY': 0},
        ],
        'aiAnnotations': [
          {
            'id': 'a1',
            'targetNodeId': 'n1',
            'severity': 'warning',
            'title': 'Falta FK cliente',
            'message': 'Relaciona Pedido con Cliente',
            'status': 'open',
          },
          {
            'id': 'a2',
            'targetClassName': 'pedido',
            'severity': 'idea',
            'title': 'Índice sugerido',
            'message': 'Agrega fecha',
            'status': 'open',
          },
          {
            'id': 'a3',
            'targetNodeId': 'n1',
            'severity': 'discipline',
            'title': 'Resuelta',
            'message': 'Ya aplicada',
            'status': 'applied',
          },
        ],
      });

      expect(diagram.openAiAnnotations.length, 2);
      final forPedido = diagram.openAnnotationsForNode('n1', 'Pedido');
      expect(forPedido.map((e) => e.id).toList(), ['a1', 'a2']);
      expect(diagram.toSaveAstPayload().containsKey('aiAnnotations'), isFalse);
    });

    test('AiMutationResult.fromJson parsea respuesta consultiva sin mutar diagrama', () {
      final res = AiMutationResult.fromJson({
        'success': true,
        'action': 'review',
        'intentMode': 'REVIEW',
        'mutatedDiagram': false,
        'broadcastedToRoom': true,
        'message': 'Conviene separar Pago de Pedido.',
        'providerUsed': 'ollama',
        'modelUsed': 'qwen2.5:3b',
        'suggestions': [
          {
            'id': 'sug_1',
            'severity': 'idea',
            'targetClassName': 'Pedido',
            'title': 'Crear entidad Pago',
            'message': 'Desacopla cobros.',
            'suggestedPrompt': 'Agrega clase Pago relacionada 1..1 con Pedido',
          },
        ],
        'disciplineAlerts': [
          {
            'code': 'OMT_NO_PK',
            'severity': 'discipline',
            'className': 'Detalle',
            'message': 'Falta PK UUID',
          },
        ],
        'annotationsAdded': [
          {
            'id': 'note_1',
            'targetClassName': 'Pedido',
            'severity': 'warning',
            'title': 'Revisar FK',
            'message': 'Agrega relación explícita',
            'status': 'open',
          },
        ],
      });

      expect(res.mutatedDiagram, isFalse);
      expect(res.intentMode, 'REVIEW');
      expect(res.broadcastedToRoom, isTrue);
      expect(res.suggestions.length, 1);
      expect(res.disciplineAlerts.first.code, 'OMT_NO_PK');
      expect(res.annotationsAdded.first.isOpen, isTrue);
      expect(AiPromptMode.fromString('discipline').isConsultative, isTrue);
      expect(AiPromptMode.mutate.isConsultative, isFalse);
    });

    test('ResumeBundleDto y mensajes/bitácora parsean createdAt y metadatos multi-día', () {
      final bundle = ResumeBundleDto.fromJson({
        'diagram': {
          'id': 'd1',
          'name': 'E-Commerce',
          'revisionCount': 7,
          'openAiAnnotationsCount': 2,
        },
        'session': {
          'id': 's1',
          'diagramId': 'd1',
          'roomCode': 'ROOM-EC1',
          'sessionNumber': 3,
          'hostUserId': 'u-ana',
          'hostUserName': 'Ana Gómez',
          'activeDateKeys': ['2026-11-10', '2026-11-11'],
        },
        'sinceLastVisit': {
          'changesCount': 5,
          'contributors': ['Ana Gómez'],
          'touchedClasses': ['Pedido', 'Pago'],
          'highlights': ['Se añadió Pago'],
        },
        'contributorStats': [
          {
            'userId': 'ai_copilot',
            'userName': 'Copiloto IA',
            'actorType': 'ai',
            'totalEvents': 3,
            'aiInteractions': 3,
          },
        ],
        'snapshots': [
          {
            'id': 'snap-1',
            'diagramId': 'd1',
            'sessionNumber': 2,
            'label': 'Fin Día 2',
            'savedByName': 'Cesar Quispe',
            'nodeCount': 4,
            'connectionCount': 3,
          },
        ],
        'unreadNotifications': [
          {
            'id': 'notif-1',
            'diagramId': 'd1',
            'severity': 'mention',
            'title': 'Ana te mencionó',
            'body': '@cesar revisa Pago',
            'readByUserIds': ['u-ana'],
          },
        ],
        'recentMessages': [
          {
            'id': 'msg-1',
            'userId': 'ai_copilot',
            'userName': 'Copiloto IA',
            'senderType': 'ai',
            'aiMode': 'ADVISE',
            'message': 'Sugiero agregar Enum EstadoPago',
            'createdAt': '2026-11-11T09:30:00Z',
          },
        ],
        'recentEvents': [
          {
            'id': 'ev-1',
            'userId': 'u-ana',
            'userName': 'Ana Gómez',
            'action': 'Editó Pago',
            'affectedClasses': ['Pago'],
            'sessionNumber': 3,
            'createdAt': '2026-11-11T09:35:00Z',
          },
        ],
      });

      expect(bundle.session?.sessionNumber, 3);
      expect(bundle.session?.hostUserName, 'Ana Gómez');
      expect(bundle.sinceLastVisit.changesCount, 5);
      expect(bundle.snapshots.first.label, 'Fin Día 2');
      expect(bundle.recentMessages.first.isAi, isTrue);
      expect(bundle.recentMessages.first.aiMode, 'ADVISE');
      expect(bundle.recentEvents.first.affectedClasses, ['Pago']);

      final notif = bundle.unreadNotifications.first;
      expect(notif.isReadBy('u-cesar'), isFalse);
      expect(notif.copyWithReadBy('u-cesar').isReadBy('u-cesar'), isTrue);
    });
  });
}

