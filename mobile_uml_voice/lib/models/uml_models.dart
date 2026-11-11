import 'dart:convert';
import 'dart:ui';
import 'auth_models.dart';

/// Tipos polimórficos de elementos UML soportados por backend, web y móvil.
enum UmlElementType {
  umlClass('CLASS', 'Clase'),
  umlInterface('INTERFACE', 'Interfaz'),
  umlEnum('ENUM', 'Enum'),
  note('NOTE', 'Nota'),
  associationClass('ASSOCIATION_CLASS', 'Clase Asociación');

  final String code;
  final String label;
  const UmlElementType(this.code, this.label);

  static UmlElementType fromString(String? raw, {bool hasAssocMainConn = false}) {
    final upper = (raw ?? '').trim().toUpperCase();
    for (final v in UmlElementType.values) {
      if (v.code == upper) return v;
    }
    return hasAssocMainConn ? UmlElementType.associationClass : UmlElementType.umlClass;
  }
}

/// Visibilidad UML estándar.
enum UmlVisibility {
  public('+', 'public'),
  private('-', 'private'),
  protected('#', 'protected'),
  package('~', 'package');

  final String symbol;
  final String xmiWord;
  const UmlVisibility(this.symbol, this.xmiWord);

  static UmlVisibility fromString(String? raw, {UmlVisibility fallback = UmlVisibility.private}) {
    final val = (raw ?? '').trim().toLowerCase();
    switch (val) {
      case '+':
      case 'public':
        return UmlVisibility.public;
      case '-':
      case 'private':
        return UmlVisibility.private;
      case '#':
      case 'protected':
        return UmlVisibility.protected;
      case '~':
      case 'package':
        return UmlVisibility.package;
      default:
        return fallback;
    }
  }
}

/// Tipos de relaciones UML alineados 100% con el backend (`association`, `generalization`, `composition`, etc.).
enum UmlRelationType {
  association('association', 'Asociación'),
  generalization('generalization', 'Herencia'),
  realization('realization', 'Realización'),
  composition('composition', 'Composición'),
  aggregation('aggregation', 'Agregación'),
  dependency('dependency', 'Dependencia'),
  associationClass('association_class', 'Clase Asociación');

  final String code;
  final String label;
  const UmlRelationType(this.code, this.label);

  static UmlRelationType fromString(String? raw) {
    final lower = (raw ?? '').trim().toLowerCase();
    if (lower == 'inheritance' || lower == 'generalization' || lower == 'herencia') {
      return UmlRelationType.generalization;
    }
    for (final v in UmlRelationType.values) {
      if (v.code == lower) return v;
    }
    if (lower.contains('comp')) return UmlRelationType.composition;
    if (lower.contains('agreg')) return UmlRelationType.aggregation;
    if (lower.contains('real')) return UmlRelationType.realization;
    if (lower.contains('dep')) return UmlRelationType.dependency;
    if (lower.contains('assoc_class') || lower.contains('association_class')) {
      return UmlRelationType.associationClass;
    }
    return UmlRelationType.association;
  }
}

/// Atributo UML (`UmlAttributeDto`).
class UmlAttribute {
  String name;
  String type;
  UmlVisibility visibility;
  bool isPrimaryKey;
  bool isNullable;
  int orderIndex;

  UmlAttribute({
    required this.name,
    this.type = 'String',
    this.visibility = UmlVisibility.private,
    this.isPrimaryKey = false,
    this.isNullable = true,
    this.orderIndex = 0,
  });

  UmlAttribute copyWith({
    String? name,
    String? type,
    UmlVisibility? visibility,
    bool? isPrimaryKey,
    bool? isNullable,
    int? orderIndex,
  }) {
    return UmlAttribute(
      name: name ?? this.name,
      type: type ?? this.type,
      visibility: visibility ?? this.visibility,
      isPrimaryKey: isPrimaryKey ?? this.isPrimaryKey,
      isNullable: isNullable ?? this.isNullable,
      orderIndex: orderIndex ?? this.orderIndex,
    );
  }

  factory UmlAttribute.fromJson(Map<String, dynamic> json, [int index = 0]) {
    final pk = json['isPrimaryKey'] == true;
    return UmlAttribute(
      name: (json['name'] ?? 'campo').toString(),
      type: (json['type'] ?? 'String').toString(),
      visibility: UmlVisibility.fromString(json['visibility']?.toString()),
      isPrimaryKey: pk,
      isNullable: pk ? false : (json['isNullable'] is bool ? json['isNullable'] as bool : true),
      orderIndex: json['orderIndex'] is num ? (json['orderIndex'] as num).toInt() : index,
    );
  }

  Map<String, dynamic> toSaveAstJson(int index) => {
        'name': name.trim().isEmpty ? 'campo' : name.trim(),
        'type': type.trim().isEmpty ? 'String' : type.trim(),
        'visibility': visibility.symbol,
        'isPrimaryKey': isPrimaryKey,
        'isNullable': isPrimaryKey ? false : isNullable,
        'orderIndex': index,
      };
}

/// Operación o método UML (`UmlMethodDto`).
class UmlMethod {
  String name;
  String parameters;
  String returnType;
  UmlVisibility visibility;
  int orderIndex;

  UmlMethod({
    required this.name,
    this.parameters = '',
    this.returnType = 'void',
    this.visibility = UmlVisibility.public,
    this.orderIndex = 0,
  });

  UmlMethod copyWith({
    String? name,
    String? parameters,
    String? returnType,
    UmlVisibility? visibility,
    int? orderIndex,
  }) {
    return UmlMethod(
      name: name ?? this.name,
      parameters: parameters ?? this.parameters,
      returnType: returnType ?? this.returnType,
      visibility: visibility ?? this.visibility,
      orderIndex: orderIndex ?? this.orderIndex,
    );
  }

  factory UmlMethod.fromJson(Map<String, dynamic> json, [int index = 0]) {
    final rawParams = json['parameters'];
    var paramString = '';
    if (rawParams is String) {
      paramString = rawParams;
    } else if (rawParams is List) {
      paramString = rawParams
          .map((p) {
            if (p is Map) {
              final pName = p['name'] ?? '';
              final pType = p['type'] ?? 'String';
              return '$pName: $pType';
            }
            return p.toString();
          })
          .join(', ');
    }

    return UmlMethod(
      name: (json['name'] ?? 'operacion').toString(),
      parameters: paramString,
      returnType: (json['returnType'] ?? 'void').toString(),
      visibility: UmlVisibility.fromString(
        json['visibility']?.toString(),
        fallback: UmlVisibility.public,
      ),
      orderIndex: json['orderIndex'] is num ? (json['orderIndex'] as num).toInt() : index,
    );
  }

  Map<String, dynamic> toSaveAstJson(int index) => {
        'name': name.trim().isEmpty ? 'operacion' : name.trim(),
        'parameters': parameters,
        'returnType': returnType.trim().isEmpty ? 'void' : returnType.trim(),
        'visibility': visibility.symbol,
        'orderIndex': index,
      };
}

/// Nodo del diagrama UML (`UmlNodeDto` / `UmlClassNode`).
class UmlNode {
  final String id;
  String name;
  UmlElementType elementType;
  String? stereotype;
  String? noteContent;
  Offset position;
  double width;
  double? height;
  bool isAnchor;
  String? assocMainConnId;
  List<UmlAttribute> attributes;
  List<UmlMethod> methods;

  UmlNode({
    required this.id,
    required this.name,
    this.elementType = UmlElementType.umlClass,
    this.stereotype,
    this.noteContent,
    this.position = const Offset(80, 80),
    this.width = 220,
    this.height,
    this.isAnchor = false,
    this.assocMainConnId,
    List<UmlAttribute>? attributes,
    List<UmlMethod>? methods,
  })  : attributes = attributes ?? [],
        methods = methods ?? [];

  String get displayStereotype {
    if (stereotype != null && stereotype!.trim().isNotEmpty) {
      return stereotype!.trim();
    }
    switch (elementType) {
      case UmlElementType.umlInterface:
        return '«interface»';
      case UmlElementType.umlEnum:
        return '«enumeration»';
      case UmlElementType.note:
        return '«note»';
      case UmlElementType.associationClass:
        return '«association»';
      case UmlElementType.umlClass:
        return '«entity»';
    }
  }

  UmlNode deepCopy() => UmlNode(
        id: id,
        name: name,
        elementType: elementType,
        stereotype: stereotype,
        noteContent: noteContent,
        position: position,
        width: width,
        height: height,
        isAnchor: isAnchor,
        assocMainConnId: assocMainConnId,
        attributes: attributes.map((a) => a.copyWith()).toList(),
        methods: methods.map((m) => m.copyWith()).toList(),
      );

  factory UmlNode.fromJson(Map<String, dynamic> json) {
    final posObj = json['position'];
    final posX = json['positionX'] is num
        ? (json['positionX'] as num).toDouble()
        : (posObj is Map && posObj['x'] is num ? (posObj['x'] as num).toDouble() : 80.0);
    final posY = json['positionY'] is num
        ? (json['positionY'] as num).toDouble()
        : (posObj is Map && posObj['y'] is num ? (posObj['y'] as num).toDouble() : 80.0);

    final rawAttrs = (json['attributes'] as List?) ?? const [];
    final rawMethods = (json['methods'] as List?) ?? const [];

    return UmlNode(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      elementType: UmlElementType.fromString(
        json['elementType']?.toString(),
        hasAssocMainConn: json['assocMainConnId'] != null,
      ),
      stereotype: json['stereotype']?.toString(),
      noteContent: json['noteContent']?.toString(),
      position: Offset(posX, posY),
      width: json['width'] is num ? (json['width'] as num).toDouble() : 220.0,
      height: json['height'] is num ? (json['height'] as num).toDouble() : null,
      isAnchor: json['isAnchor'] == true,
      assocMainConnId: json['assocMainConnId']?.toString(),
      attributes: rawAttrs
          .asMap()
          .entries
          .map((e) => UmlAttribute.fromJson(Map<String, dynamic>.from(e.value as Map), e.key))
          .toList(),
      methods: rawMethods
          .asMap()
          .entries
          .map((e) => UmlMethod.fromJson(Map<String, dynamic>.from(e.value as Map), e.key))
          .toList(),
    );
  }

  /// Payload estricto compatible con `SaveDiagramAstDto` (`forbidNonWhitelisted: true`).
  Map<String, dynamic> toSaveAstJson() {
    final cleanName = name.trim().isEmpty
        ? (elementType == UmlElementType.note ? 'Nota' : 'ClassName')
        : name.trim();

    return {
      'id': id,
      'name': isAnchor ? '' : cleanName,
      'elementType': elementType.code,
      if (stereotype != null && stereotype!.trim().isNotEmpty) 'stereotype': stereotype,
      if (noteContent != null) 'noteContent': noteContent,
      'positionX': position.dx,
      'positionY': position.dy,
      'width': width.round(),
      if (height != null) 'height': height!.round(),
      'isAnchor': isAnchor,
      if (assocMainConnId != null) 'assocMainConnId': assocMainConnId,
      'attributes': [
        for (var i = 0; i < attributes.length; i++) attributes[i].toSaveAstJson(i),
      ],
      'methods': [
        for (var i = 0; i < methods.length; i++) methods[i].toSaveAstJson(i),
      ],
    };
  }

  /// Payload compatible con Socket.IO (`diagram_sync`) y endpoints AI (`/api/ai/prompt`).
  Map<String, dynamic> toCollaborativeJson() {
    final map = toSaveAstJson();
    map['position'] = {'x': position.dx, 'y': position.dy};
    return map;
  }
}

/// Conexión UML (`UmlConnectionDto` / `UmlConnection`).
class UmlConnection {
  final String id;
  String sourceNodeId;
  String targetNodeId;
  String sourceId;
  String targetId;
  UmlRelationType type;
  String lineStyle;
  String? name;
  String sourceMultiplicity;
  String targetMultiplicity;
  String? assocAnchorNodeId;

  UmlConnection({
    required this.id,
    required this.sourceNodeId,
    required this.targetNodeId,
    String? sourceId,
    String? targetId,
    this.type = UmlRelationType.association,
    this.lineStyle = 'segment',
    this.name,
    this.sourceMultiplicity = '1',
    this.targetMultiplicity = '0..*',
    this.assocAnchorNodeId,
  })  : sourceId = sourceId ?? '${sourceNodeId}_right',
        targetId = targetId ?? '${targetNodeId}_left';

  UmlConnection deepCopy() => UmlConnection(
        id: id,
        sourceNodeId: sourceNodeId,
        targetNodeId: targetNodeId,
        sourceId: sourceId,
        targetId: targetId,
        type: type,
        lineStyle: lineStyle,
        name: name,
        sourceMultiplicity: sourceMultiplicity,
        targetMultiplicity: targetMultiplicity,
        assocAnchorNodeId: assocAnchorNodeId,
      );

  static String _extractNodeId(String rawId) {
    return rawId.replaceFirst(RegExp(r'_(top|right|bottom|left)$'), '');
  }

  factory UmlConnection.fromJson(Map<String, dynamic> json) {
    final rawSrcId = (json['sourceId'] ?? json['from'] ?? json['sourceNodeId'] ?? '').toString();
    final rawTgtId = (json['targetId'] ?? json['to'] ?? json['targetNodeId'] ?? '').toString();
    final srcNodeId = (json['sourceNodeId'] ?? _extractNodeId(rawSrcId)).toString();
    final tgtNodeId = (json['targetNodeId'] ?? _extractNodeId(rawTgtId)).toString();

    return UmlConnection(
      id: (json['id'] ?? '').toString(),
      sourceNodeId: srcNodeId,
      targetNodeId: tgtNodeId,
      sourceId: rawSrcId.isNotEmpty ? rawSrcId : '${srcNodeId}_right',
      targetId: rawTgtId.isNotEmpty ? rawTgtId : '${tgtNodeId}_left',
      type: UmlRelationType.fromString(json['type']?.toString()),
      lineStyle: (json['lineStyle'] ?? 'segment').toString(),
      name: json['name']?.toString(),
      sourceMultiplicity: (json['sourceMultiplicity'] ?? '1').toString(),
      targetMultiplicity: (json['targetMultiplicity'] ?? '0..*').toString(),
      assocAnchorNodeId: json['assocAnchorNodeId']?.toString(),
    );
  }

  Map<String, dynamic> toSaveAstJson() => {
        'id': id,
        'sourceNodeId': sourceNodeId,
        'targetNodeId': targetNodeId,
        'sourceId': sourceId,
        'targetId': targetId,
        'type': type.code,
        'lineStyle': lineStyle,
        if (name != null && name!.trim().isNotEmpty) 'name': name!.trim(),
        'sourceMultiplicity': sourceMultiplicity,
        'targetMultiplicity': targetMultiplicity,
        if (assocAnchorNodeId != null) 'assocAnchorNodeId': assocAnchorNodeId,
      };
}

/// Diagrama UML completo (`DiagramResponseDto`).
class UmlDiagram {
  String id;
  String? projectId;
  String name;
  String version;
  String defaultLineStyle;
  List<UmlNode> nodes;
  List<UmlConnection> connections;
  DateTime updatedAt;
  DateTime createdAt;

  UmlDiagram({
    required this.id,
    this.projectId,
    required this.name,
    this.version = '1.0.0',
    this.defaultLineStyle = 'segment',
    List<UmlNode>? nodes,
    List<UmlConnection>? connections,
    DateTime? updatedAt,
    DateTime? createdAt,
  })  : nodes = nodes ?? [],
        connections = connections ?? [],
        updatedAt = updatedAt ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now();

  List<UmlNode> get visibleNodes => nodes.where((n) => !n.isAnchor).toList();

  UmlDiagram deepCopy() => UmlDiagram(
        id: id,
        projectId: projectId,
        name: name,
        version: version,
        defaultLineStyle: defaultLineStyle,
        nodes: nodes.map((n) => n.deepCopy()).toList(),
        connections: connections.map((c) => c.deepCopy()).toList(),
        updatedAt: updatedAt,
        createdAt: createdAt,
      );

  factory UmlDiagram.fromJson(Map<String, dynamic> json) {
    final rawNodes = (json['nodes'] as List?) ?? const [];
    final rawConns = (json['connections'] as List?) ?? const [];
    return UmlDiagram(
      id: (json['id'] ?? '').toString(),
      projectId: json['projectId']?.toString(),
      name: (json['name'] ?? 'Diagrama Principal').toString(),
      version: (json['version'] ?? '1.0.0').toString(),
      defaultLineStyle: (json['defaultLineStyle'] ?? 'segment').toString(),
      nodes: rawNodes
          .map((n) => UmlNode.fromJson(Map<String, dynamic>.from(n as Map)))
          .toList(),
      connections: rawConns
          .map((c) => UmlConnection.fromJson(Map<String, dynamic>.from(c as Map)))
          .toList(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toSaveAstPayload() => {
        'defaultLineStyle': defaultLineStyle,
        'nodes': nodes.map((n) => n.toSaveAstJson()).toList(),
        'connections': connections.map((c) => c.toSaveAstJson()).toList(),
      };

  Map<String, dynamic> toJson() => {
        'id': id,
        'projectId': projectId,
        'name': name,
        'version': version,
        'defaultLineStyle': defaultLineStyle,
        'nodes': nodes.map((n) => n.toCollaborativeJson()).toList(),
        'connections': connections.map((c) => c.toSaveAstJson()).toList(),
        'updatedAt': updatedAt.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
      };

  String toFormattedJson() => const JsonEncoder.withIndent('  ').convert(toJson());
}

/// Proyecto del workspace (`ProjectResponseDto`).
class ProjectSummary {
  final String id;
  final String name;
  final String description;
  final String basePackage;
  final int javaVersion;
  final String springBootVersion;
  final String createdBy;
  final String creatorName;
  String? userRole;
  bool? userCanDownloadCode;
  int memberCount;
  int diagramCount;
  final DateTime createdAt;
  List<ProjectMember> members;

  ProjectSummary({
    required this.id,
    required this.name,
    this.description = '',
    this.basePackage = 'com.casestudio',
    this.javaVersion = 21,
    this.springBootVersion = '3.4.0',
    required this.createdBy,
    this.creatorName = '',
    this.userRole,
    this.userCanDownloadCode,
    this.memberCount = 1,
    this.diagramCount = 1,
    DateTime? createdAt,
    List<ProjectMember>? members,
  })  : createdAt = createdAt ?? DateTime.now(),
        members = members ?? [];

  bool get isViewer => userRole?.toUpperCase() == 'VIEWER';
  bool get isOwner => userRole?.toUpperCase() == 'OWNER';
  bool get canDownload => isOwner || (userCanDownloadCode ?? true);

  factory ProjectSummary.fromJson(Map<String, dynamic> json) {
    final rawMembers = (json['members'] as List?) ?? const [];
    return ProjectSummary(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? 'Proyecto UML').toString(),
      description: (json['description'] ?? '').toString(),
      basePackage: (json['basePackage'] ?? 'com.casestudio').toString(),
      javaVersion: json['javaVersion'] is num ? (json['javaVersion'] as num).toInt() : 21,
      springBootVersion: (json['springBootVersion'] ?? '3.4.0').toString(),
      createdBy: (json['createdBy'] ?? '').toString(),
      creatorName: (json['creatorName'] ?? '').toString(),
      userRole: json['userRole']?.toString().toUpperCase(),
      userCanDownloadCode: json['userCanDownloadCode'] is bool
          ? json['userCanDownloadCode'] as bool
          : null,
      memberCount: json['memberCount'] is num ? (json['memberCount'] as num).toInt() : rawMembers.length,
      diagramCount: json['diagramCount'] is num ? (json['diagramCount'] as num).toInt() : 1,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      members: rawMembers
          .map((m) => ProjectMember.fromJson(Map<String, dynamic>.from(m as Map)))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'basePackage': basePackage,
        'javaVersion': javaVersion,
        'springBootVersion': springBootVersion,
        'createdBy': createdBy,
        'creatorName': creatorName,
        'userRole': userRole,
        'userCanDownloadCode': userCanDownloadCode,
        'memberCount': memberCount,
        'diagramCount': diagramCount,
        'createdAt': createdAt.toIso8601String(),
        'members': members.map((m) => m.toJson()).toList(),
      };
}

/// Opción de modelo de IA devuelta por `GET /api/ai/models`.
class AiModelOption {
  final String id;
  final String name;
  final String provider;
  final bool isLocal;
  final String? parameterSize;
  final String? description;

  AiModelOption({
    required this.id,
    required this.name,
    required this.provider,
    this.isLocal = false,
    this.parameterSize,
    this.description,
  });

  factory AiModelOption.fromJson(Map<String, dynamic> json) {
    return AiModelOption(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? json['id'] ?? '').toString(),
      provider: (json['provider'] ?? 'vertex').toString(),
      isLocal: json['isLocal'] == true,
      parameterSize: json['parameterSize']?.toString(),
      description: json['description']?.toString(),
    );
  }
}

/// Bloqueo mutuo de nodo en WebSocket.
class CollabNodeLock {
  final String nodeId;
  final String userId;
  final String userName;
  final String color;

  CollabNodeLock({
    required this.nodeId,
    required this.userId,
    required this.userName,
    this.color = '#F59E0B',
  });

  factory CollabNodeLock.fromJson(Map<String, dynamic> json) => CollabNodeLock(
        nodeId: (json['nodeId'] ?? '').toString(),
        userId: (json['userId'] ?? '').toString(),
        userName: (json['userName'] ?? 'Colaborador').toString(),
        color: (json['color'] ?? '#F59E0B').toString(),
      );
}

/// Participante conectado en la sala WebSocket `/collaboration`.
class CollabParticipant {
  final String userId;
  final String userName;
  final String color;
  final bool isConnected;

  CollabParticipant({
    required this.userId,
    required this.userName,
    this.color = '#38BDF8',
    this.isConnected = true,
  });

  factory CollabParticipant.fromJson(Map<String, dynamic> json) => CollabParticipant(
        userId: (json['userId'] ?? '').toString(),
        userName: (json['userName'] ?? 'Colaborador').toString(),
        color: (json['color'] ?? '#38BDF8').toString(),
        isConnected: json['isConnected'] is bool ? json['isConnected'] as bool : true,
      );
}

/// Mensaje del chat de sala (`chat_message_received`).
class CollabChatMessage {
  final String id;
  final String userId;
  final String userName;
  final String message;
  final String color;
  final DateTime timestamp;

  CollabChatMessage({
    required this.id,
    required this.userId,
    required this.userName,
    required this.message,
    this.color = '#38BDF8',
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory CollabChatMessage.fromJson(Map<String, dynamic> json) => CollabChatMessage(
        id: (json['id'] ?? 'chat_${DateTime.now().millisecondsSinceEpoch}').toString(),
        userId: (json['userId'] ?? '').toString(),
        userName: (json['userName'] ?? 'Usuario').toString(),
        message: (json['message'] ?? '').toString(),
        color: (json['color'] ?? '#38BDF8').toString(),
        timestamp: json['timestamp'] != null
            ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
            : DateTime.now(),
      );
}

/// Registro de auditoría/actividad en vivo (`activity_logged`).
class CollabActivityLog {
  final String id;
  final String userId;
  final String userName;
  final String action;
  final String? detail;
  final String category; // uml | ai | voice | permission | system
  final String color;
  final DateTime timestamp;

  CollabActivityLog({
    required this.id,
    required this.userId,
    required this.userName,
    required this.action,
    this.detail,
    this.category = 'uml',
    this.color = '#38BDF8',
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory CollabActivityLog.fromJson(Map<String, dynamic> json) => CollabActivityLog(
        id: (json['id'] ?? 'act_${DateTime.now().millisecondsSinceEpoch}').toString(),
        userId: (json['userId'] ?? '').toString(),
        userName: (json['userName'] ?? 'Usuario').toString(),
        action: (json['action'] ?? '').toString(),
        detail: json['detail']?.toString(),
        category: (json['category'] ?? 'uml').toString(),
        color: (json['color'] ?? '#38BDF8').toString(),
        timestamp: json['timestamp'] != null
            ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
            : DateTime.now(),
      );
}

