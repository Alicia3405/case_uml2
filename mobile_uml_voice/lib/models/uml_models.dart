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

/// Modo explícito del Copilot IA colaborativo (`AiPromptDto.mode`).
enum AiPromptMode {
  auto('auto', 'Auto'),
  advise('advise', 'Opinar'),
  review('review', 'Revisar'),
  discipline('discipline', 'OMT'),
  mutate('mutate', 'Editar'),
  recap('recap', 'Resumen');

  final String code;
  final String label;
  const AiPromptMode(this.code, this.label);

  bool get isConsultative =>
      this == AiPromptMode.advise ||
      this == AiPromptMode.review ||
      this == AiPromptMode.discipline ||
      this == AiPromptMode.recap;

  static AiPromptMode fromString(String? raw) {
    final lower = (raw ?? '').trim().toLowerCase();
    for (final m in AiPromptMode.values) {
      if (m.code == lower) return m;
    }
    return AiPromptMode.auto;
  }
}

/// Anotación persistente de IA en la pizarra colaborativa (`AiAnnotationItem`).
class AiAnnotationItem {
  final String id;
  final String? targetNodeId;
  final String? targetClassName;
  final String severity; // idea | warning | discipline | resolved
  final String title;
  final String message;
  final String authorName;
  final String? requestedByUserName;
  final Map<String, dynamic>? suggestedAction;
  String status; // open | applied | dismissed
  final DateTime createdAt;
  DateTime? resolvedAt;
  String? resolvedByUserName;

  AiAnnotationItem({
    required this.id,
    this.targetNodeId,
    this.targetClassName,
    this.severity = 'idea',
    required this.title,
    required this.message,
    this.authorName = 'Copilot IA',
    this.requestedByUserName,
    this.suggestedAction,
    this.status = 'open',
    DateTime? createdAt,
    this.resolvedAt,
    this.resolvedByUserName,
  }) : createdAt = createdAt ?? DateTime.now();

  String? get suggestedPrompt =>
      suggestedAction?['suggestedPrompt']?.toString() ??
      suggestedAction?['prompt']?.toString();

  bool get isOpen => status == 'open';

  AiAnnotationItem copyWith({
    String? status,
    DateTime? resolvedAt,
    String? resolvedByUserName,
  }) =>
      AiAnnotationItem(
        id: id,
        targetNodeId: targetNodeId,
        targetClassName: targetClassName,
        severity: severity,
        title: title,
        message: message,
        authorName: authorName,
        requestedByUserName: requestedByUserName,
        suggestedAction: suggestedAction != null
            ? Map<String, dynamic>.from(suggestedAction!)
            : null,
        status: status ?? this.status,
        createdAt: createdAt,
        resolvedAt: resolvedAt ?? this.resolvedAt,
        resolvedByUserName: resolvedByUserName ?? this.resolvedByUserName,
      );

  factory AiAnnotationItem.fromJson(Map<String, dynamic> json) {
    final rawAction = json['suggestedAction'];
    return AiAnnotationItem(
      id: (json['id'] ?? 'ai_note_${DateTime.now().millisecondsSinceEpoch}')
          .toString(),
      targetNodeId: json['targetNodeId']?.toString(),
      targetClassName: json['targetClassName']?.toString(),
      severity: (json['severity'] ?? 'idea').toString(),
      title: (json['title'] ?? 'Observación IA').toString(),
      message: (json['message'] ?? '').toString(),
      authorName: (json['authorName'] ?? 'Copilot IA').toString(),
      requestedByUserName: json['requestedByUserName']?.toString(),
      suggestedAction:
          rawAction is Map ? Map<String, dynamic>.from(rawAction) : null,
      status: (json['status'] ?? 'open').toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      resolvedAt: json['resolvedAt'] != null
          ? DateTime.tryParse(json['resolvedAt'].toString())
          : null,
      resolvedByUserName: json['resolvedByUserName']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        if (targetNodeId != null) 'targetNodeId': targetNodeId,
        if (targetClassName != null) 'targetClassName': targetClassName,
        'severity': severity,
        'title': title,
        'message': message,
        'authorName': authorName,
        if (requestedByUserName != null)
          'requestedByUserName': requestedByUserName,
        if (suggestedAction != null) 'suggestedAction': suggestedAction,
        'status': status,
        'createdAt': createdAt.toIso8601String(),
        if (resolvedAt != null) 'resolvedAt': resolvedAt!.toIso8601String(),
        if (resolvedByUserName != null)
          'resolvedByUserName': resolvedByUserName,
      };
}

/// Checkpoint / Snapshot histórico del diagrama (`DiagramSnapshot`).
class DiagramSnapshotItem {
  final String id;
  final String diagramId;
  final String? sessionId;
  final int sessionNumber;
  final String sessionDate;
  final String label;
  final String summary;
  final String savedByUserId;
  final String savedByName;
  final int nodeCount;
  final int connectionCount;
  final DateTime createdAt;

  DiagramSnapshotItem({
    required this.id,
    required this.diagramId,
    this.sessionId,
    this.sessionNumber = 1,
    this.sessionDate = '',
    required this.label,
    this.summary = '',
    this.savedByUserId = '',
    this.savedByName = 'Equipo',
    this.nodeCount = 0,
    this.connectionCount = 0,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  factory DiagramSnapshotItem.fromJson(Map<String, dynamic> json) {
    final rawNodes = json['nodes'];
    final rawConns = json['connections'];
    return DiagramSnapshotItem(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      diagramId: (json['diagramId'] ?? '').toString(),
      sessionId: json['sessionId']?.toString(),
      sessionNumber: json['sessionNumber'] is num
          ? (json['sessionNumber'] as num).toInt()
          : 1,
      sessionDate: (json['sessionDate'] ?? '').toString(),
      label: (json['label'] ?? 'Checkpoint').toString(),
      summary: (json['summary'] ?? '').toString(),
      savedByUserId: (json['savedByUserId'] ?? '').toString(),
      savedByName: (json['savedByName'] ?? 'Colaborador').toString(),
      nodeCount: rawNodes is List
          ? rawNodes.where((n) => n is Map && n['isAnchor'] != true).length
          : (json['nodeCount'] is num ? (json['nodeCount'] as num).toInt() : 0),
      connectionCount: rawConns is List
          ? rawConns.length
          : (json['connectionCount'] is num
              ? (json['connectionCount'] as num).toInt()
              : 0),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// Metadatos de sesión colaborativa multi-día (`SessionResponseDto`).
class CollabSessionMeta {
  final String id;
  final String diagramId;
  final String? projectId;
  final String roomCode;
  final bool isActive;
  final String? hostUserId;
  final String? hostUserName;
  final int sessionNumber;
  final List<String> activeDateKeys;
  final String? lastActiveDay;
  final String resumeSummary;
  final DateTime? startedAt;
  final DateTime? lastActivityAt;

  CollabSessionMeta({
    required this.id,
    required this.diagramId,
    this.projectId,
    required this.roomCode,
    this.isActive = true,
    this.hostUserId,
    this.hostUserName,
    this.sessionNumber = 1,
    List<String>? activeDateKeys,
    this.lastActiveDay,
    this.resumeSummary = '',
    this.startedAt,
    this.lastActivityAt,
  }) : activeDateKeys = activeDateKeys ?? [];

  CollabSessionMeta copyWith({
    String? hostUserId,
    String? hostUserName,
    int? sessionNumber,
    List<String>? activeDateKeys,
    String? lastActiveDay,
    String? resumeSummary,
  }) =>
      CollabSessionMeta(
        id: id,
        diagramId: diagramId,
        projectId: projectId,
        roomCode: roomCode,
        isActive: isActive,
        hostUserId: hostUserId ?? this.hostUserId,
        hostUserName: hostUserName ?? this.hostUserName,
        sessionNumber: sessionNumber ?? this.sessionNumber,
        activeDateKeys: activeDateKeys ?? List.from(this.activeDateKeys),
        lastActiveDay: lastActiveDay ?? this.lastActiveDay,
        resumeSummary: resumeSummary ?? this.resumeSummary,
        startedAt: startedAt,
        lastActivityAt: lastActivityAt,
      );

  factory CollabSessionMeta.fromJson(Map<String, dynamic> json) {
    final rawDates = (json['activeDateKeys'] as List?) ?? const [];
    return CollabSessionMeta(
      id: (json['id'] ?? '').toString(),
      diagramId: (json['diagramId'] ?? '').toString(),
      projectId: json['projectId']?.toString(),
      roomCode: (json['roomCode'] ?? '').toString(),
      isActive: json['isActive'] is bool ? json['isActive'] as bool : true,
      hostUserId: json['hostUserId']?.toString(),
      hostUserName: json['hostUserName']?.toString(),
      sessionNumber: json['sessionNumber'] is num
          ? (json['sessionNumber'] as num).toInt()
          : 1,
      activeDateKeys: rawDates.map((d) => d.toString()).toList(),
      lastActiveDay: json['lastActiveDay']?.toString(),
      resumeSummary: (json['resumeSummary'] ?? '').toString(),
      startedAt: json['startedAt'] != null
          ? DateTime.tryParse(json['startedAt'].toString())
          : null,
      lastActivityAt: json['lastActivityAt'] != null
          ? DateTime.tryParse(json['lastActivityAt'].toString())
          : null,
    );
  }
}

/// Notificación colaborativa persistente (`NotificationRecord`).
class CollabNotificationItem {
  final String id;
  final String? projectId;
  final String diagramId;
  final String? roomCode;
  final String recipientUserId;
  final String severity; // info | warning | discipline | mention
  final String title;
  final String body;
  final String? actorUserId;
  final String actorName;
  final List<String> targetNodeIds;
  final List<String> readByUserIds;
  final DateTime createdAt;

  CollabNotificationItem({
    required this.id,
    this.projectId,
    required this.diagramId,
    this.roomCode,
    this.recipientUserId = 'ROOM',
    this.severity = 'info',
    required this.title,
    required this.body,
    this.actorUserId,
    this.actorName = 'Sistema',
    List<String>? targetNodeIds,
    List<String>? readByUserIds,
    DateTime? createdAt,
  })  : targetNodeIds = targetNodeIds ?? [],
        readByUserIds = readByUserIds ?? [],
        createdAt = createdAt ?? DateTime.now();

  bool isReadBy(String? userId) =>
      userId != null && readByUserIds.contains(userId);

  CollabNotificationItem copyWithReadBy(String userId) {
    if (readByUserIds.contains(userId)) return this;
    return CollabNotificationItem(
      id: id,
      projectId: projectId,
      diagramId: diagramId,
      roomCode: roomCode,
      recipientUserId: recipientUserId,
      severity: severity,
      title: title,
      body: body,
      actorUserId: actorUserId,
      actorName: actorName,
      targetNodeIds: targetNodeIds,
      readByUserIds: [...readByUserIds, userId],
      createdAt: createdAt,
    );
  }

  factory CollabNotificationItem.fromJson(Map<String, dynamic> json) {
    final rawTargets = (json['targetNodeIds'] as List?) ?? const [];
    final rawReadBy = (json['readByUserIds'] as List?) ?? const [];
    return CollabNotificationItem(
      id: (json['id'] ?? json['_id'] ?? 'notif_${DateTime.now().millisecondsSinceEpoch}')
          .toString(),
      projectId: json['projectId']?.toString(),
      diagramId: (json['diagramId'] ?? '').toString(),
      roomCode: json['roomCode']?.toString(),
      recipientUserId: (json['recipientUserId'] ?? 'ROOM').toString(),
      severity: (json['severity'] ?? 'info').toString(),
      title: (json['title'] ?? 'Notificación').toString(),
      body: (json['body'] ?? '').toString(),
      actorUserId: json['actorUserId']?.toString(),
      actorName: (json['actorName'] ?? 'Sistema').toString(),
      targetNodeIds: rawTargets.map((e) => e.toString()).toList(),
      readByUserIds: rawReadBy.map((e) => e.toString()).toList(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// Métrica de contribución por colaborador (`ContributorStatsItem`).
class ContributorStatsItem {
  final String userId;
  final String userName;
  final String actorType; // human | ai
  final int totalEvents;
  final int umlEdits;
  final int aiInteractions;
  final int voiceCommands;
  final String lastActionAt;
  final List<String> touchedClasses;

  ContributorStatsItem({
    required this.userId,
    required this.userName,
    this.actorType = 'human',
    this.totalEvents = 0,
    this.umlEdits = 0,
    this.aiInteractions = 0,
    this.voiceCommands = 0,
    this.lastActionAt = '',
    List<String>? touchedClasses,
  }) : touchedClasses = touchedClasses ?? [];

  factory ContributorStatsItem.fromJson(Map<String, dynamic> json) {
    final rawClasses = (json['touchedClasses'] as List?) ?? const [];
    return ContributorStatsItem(
      userId: (json['userId'] ?? '').toString(),
      userName: (json['userName'] ?? 'Colaborador').toString(),
      actorType: (json['actorType'] ?? 'human').toString(),
      totalEvents: json['totalEvents'] is num ? (json['totalEvents'] as num).toInt() : 0,
      umlEdits: json['umlEdits'] is num ? (json['umlEdits'] as num).toInt() : 0,
      aiInteractions:
          json['aiInteractions'] is num ? (json['aiInteractions'] as num).toInt() : 0,
      voiceCommands:
          json['voiceCommands'] is num ? (json['voiceCommands'] as num).toInt() : 0,
      lastActionAt: (json['lastActionAt'] ?? '').toString(),
      touchedClasses: rawClasses.map((e) => e.toString()).toList(),
    );
  }
}

/// Resumen "Desde tu última visita" para retomar trabajo multi-día.
class SinceLastVisitSummary {
  final String? lastContributedAt;
  final int changesCount;
  final List<String> contributors;
  final List<String> touchedClasses;
  final List<String> highlights;

  SinceLastVisitSummary({
    this.lastContributedAt,
    this.changesCount = 0,
    List<String>? contributors,
    List<String>? touchedClasses,
    List<String>? highlights,
  })  : contributors = contributors ?? [],
        touchedClasses = touchedClasses ?? [],
        highlights = highlights ?? [];

  factory SinceLastVisitSummary.fromJson(Map<String, dynamic> json) {
    return SinceLastVisitSummary(
      lastContributedAt: json['lastContributedAt']?.toString(),
      changesCount:
          json['changesCount'] is num ? (json['changesCount'] as num).toInt() : 0,
      contributors: ((json['contributors'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      touchedClasses: ((json['touchedClasses'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      highlights: ((json['highlights'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class ResumeDiagramOverview {
  final String id;
  final String? projectId;
  final String name;
  final int revisionCount;
  final String? lastModifiedByName;
  final DateTime? lastModifiedAt;
  final int classCount;
  final int connectionCount;
  final int openAiAnnotationsCount;

  ResumeDiagramOverview({
    required this.id,
    this.projectId,
    required this.name,
    this.revisionCount = 0,
    this.lastModifiedByName,
    this.lastModifiedAt,
    this.classCount = 0,
    this.connectionCount = 0,
    this.openAiAnnotationsCount = 0,
  });

  factory ResumeDiagramOverview.fromJson(Map<String, dynamic> json) =>
      ResumeDiagramOverview(
        id: (json['id'] ?? '').toString(),
        projectId: json['projectId']?.toString(),
        name: (json['name'] ?? 'Diagrama').toString(),
        revisionCount: json['revisionCount'] is num
            ? (json['revisionCount'] as num).toInt()
            : 0,
        lastModifiedByName: json['lastModifiedByName']?.toString(),
        lastModifiedAt: json['lastModifiedAt'] != null
            ? DateTime.tryParse(json['lastModifiedAt'].toString())
            : null,
        classCount:
            json['classCount'] is num ? (json['classCount'] as num).toInt() : 0,
        connectionCount: json['connectionCount'] is num
            ? (json['connectionCount'] as num).toInt()
            : 0,
        openAiAnnotationsCount: json['openAiAnnotationsCount'] is num
            ? (json['openAiAnnotationsCount'] as num).toInt()
            : 0,
      );
}

/// Paquete completo de continuidad multi-sesión (`GET /collaboration/diagrams/:diagramId/resume`).
class ResumeBundleDto {
  final ResumeDiagramOverview diagram;
  final CollabSessionMeta? session;
  final SinceLastVisitSummary sinceLastVisit;
  final List<ContributorStatsItem> contributorStats;
  final List<DiagramSnapshotItem> snapshots;
  final List<CollabNotificationItem> unreadNotifications;
  final List<CollabChatMessage> recentMessages;
  final List<CollabActivityLog> recentEvents;

  ResumeBundleDto({
    required this.diagram,
    this.session,
    required this.sinceLastVisit,
    List<ContributorStatsItem>? contributorStats,
    List<DiagramSnapshotItem>? snapshots,
    List<CollabNotificationItem>? unreadNotifications,
    List<CollabChatMessage>? recentMessages,
    List<CollabActivityLog>? recentEvents,
  })  : contributorStats = contributorStats ?? [],
        snapshots = snapshots ?? [],
        unreadNotifications = unreadNotifications ?? [],
        recentMessages = recentMessages ?? [],
        recentEvents = recentEvents ?? [];

  factory ResumeBundleDto.fromJson(Map<String, dynamic> json) {
    final diagRaw = json['diagram'];
    final sessRaw = json['session'];
    final slvRaw = json['sinceLastVisit'];
    return ResumeBundleDto(
      diagram: diagRaw is Map
          ? ResumeDiagramOverview.fromJson(Map<String, dynamic>.from(diagRaw))
          : ResumeDiagramOverview(id: '', name: 'Diagrama'),
      session: sessRaw is Map
          ? CollabSessionMeta.fromJson(Map<String, dynamic>.from(sessRaw))
          : null,
      sinceLastVisit: slvRaw is Map
          ? SinceLastVisitSummary.fromJson(Map<String, dynamic>.from(slvRaw))
          : SinceLastVisitSummary(),
      contributorStats: ((json['contributorStats'] as List?) ?? const [])
          .map((e) =>
              ContributorStatsItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      snapshots: ((json['snapshots'] as List?) ?? const [])
          .map((e) =>
              DiagramSnapshotItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      unreadNotifications: ((json['unreadNotifications'] as List?) ?? const [])
          .map((e) => CollabNotificationItem.fromJson(
              Map<String, dynamic>.from(e as Map)))
          .toList(),
      recentMessages: ((json['recentMessages'] as List?) ?? const [])
          .map((e) =>
              CollabChatMessage.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      recentEvents: ((json['recentEvents'] as List?) ?? const [])
          .map((e) =>
              CollabActivityLog.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }
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
  String? createdByUserId;
  String? createdByName;
  String? lastModifiedByUserId;
  String? lastModifiedByName;
  DateTime? lastModifiedAt;
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
    this.createdByUserId,
    this.createdByName,
    this.lastModifiedByUserId,
    this.lastModifiedByName,
    this.lastModifiedAt,
    List<UmlAttribute>? attributes,
    List<UmlMethod>? methods,
  })  : attributes = attributes ?? [],
        methods = methods ?? [];

  String? get authorBadgeName {
    final raw = (lastModifiedByName ?? createdByName ?? '').trim();
    return raw.isEmpty ? null : raw;
  }

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
        createdByUserId: createdByUserId,
        createdByName: createdByName,
        lastModifiedByUserId: lastModifiedByUserId,
        lastModifiedByName: lastModifiedByName,
        lastModifiedAt: lastModifiedAt,
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
      createdByUserId: json['createdByUserId']?.toString(),
      createdByName: json['createdByName']?.toString(),
      lastModifiedByUserId: json['lastModifiedByUserId']?.toString(),
      lastModifiedByName: json['lastModifiedByName']?.toString(),
      lastModifiedAt: json['lastModifiedAt'] != null
          ? DateTime.tryParse(json['lastModifiedAt'].toString())
          : null,
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
    if (createdByUserId != null) map['createdByUserId'] = createdByUserId;
    if (createdByName != null) map['createdByName'] = createdByName;
    if (lastModifiedByUserId != null) map['lastModifiedByUserId'] = lastModifiedByUserId;
    if (lastModifiedByName != null) map['lastModifiedByName'] = lastModifiedByName;
    if (lastModifiedAt != null) map['lastModifiedAt'] = lastModifiedAt!.toIso8601String();
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
  List<AiAnnotationItem> aiAnnotations;
  int revisionCount;
  String? lastModifiedByUserId;
  String? lastModifiedByName;
  DateTime? lastModifiedAt;
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
    List<AiAnnotationItem>? aiAnnotations,
    this.revisionCount = 0,
    this.lastModifiedByUserId,
    this.lastModifiedByName,
    this.lastModifiedAt,
    DateTime? updatedAt,
    DateTime? createdAt,
  })  : nodes = nodes ?? [],
        connections = connections ?? [],
        aiAnnotations = aiAnnotations ?? [],
        updatedAt = updatedAt ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now();

  List<UmlNode> get visibleNodes => nodes.where((n) => !n.isAnchor).toList();

  List<AiAnnotationItem> get openAiAnnotations =>
      aiAnnotations.where((a) => a.status == 'open').toList();

  List<AiAnnotationItem> openAnnotationsForNode(String nodeId, String nodeName) {
    final lowerName = nodeName.trim().toLowerCase();
    return aiAnnotations.where((a) {
      if (!a.isOpen) return false;
      if (a.targetNodeId != null && a.targetNodeId == nodeId) return true;
      if (a.targetClassName != null &&
          lowerName.isNotEmpty &&
          a.targetClassName!.trim().toLowerCase() == lowerName) {
        return true;
      }
      return false;
    }).toList();
  }

  UmlDiagram deepCopy() => UmlDiagram(
        id: id,
        projectId: projectId,
        name: name,
        version: version,
        defaultLineStyle: defaultLineStyle,
        nodes: nodes.map((n) => n.deepCopy()).toList(),
        connections: connections.map((c) => c.deepCopy()).toList(),
        aiAnnotations: aiAnnotations.map((a) => a.copyWith()).toList(),
        revisionCount: revisionCount,
        lastModifiedByUserId: lastModifiedByUserId,
        lastModifiedByName: lastModifiedByName,
        lastModifiedAt: lastModifiedAt,
        updatedAt: updatedAt,
        createdAt: createdAt,
      );

  factory UmlDiagram.fromJson(Map<String, dynamic> json) {
    final rawNodes = (json['nodes'] as List?) ?? const [];
    final rawConns = (json['connections'] as List?) ?? const [];
    final rawAnnots = (json['aiAnnotations'] as List?) ?? const [];
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
      aiAnnotations: rawAnnots
          .map((a) => AiAnnotationItem.fromJson(Map<String, dynamic>.from(a as Map)))
          .toList(),
      revisionCount:
          json['revisionCount'] is num ? (json['revisionCount'] as num).toInt() : 0,
      lastModifiedByUserId: json['lastModifiedByUserId']?.toString(),
      lastModifiedByName: json['lastModifiedByName']?.toString(),
      lastModifiedAt: json['lastModifiedAt'] != null
          ? DateTime.tryParse(json['lastModifiedAt'].toString())
          : null,
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
        'aiAnnotations': aiAnnotations.map((a) => a.toJson()).toList(),
        'revisionCount': revisionCount,
        if (lastModifiedByUserId != null)
          'lastModifiedByUserId': lastModifiedByUserId,
        if (lastModifiedByName != null)
          'lastModifiedByName': lastModifiedByName,
        if (lastModifiedAt != null)
          'lastModifiedAt': lastModifiedAt!.toIso8601String(),
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
  final String senderType; // human | ai | system
  final String? aiMode;
  final String? requestedByUserName;
  final List<String> targetNodes;
  final bool mutatedDiagram;
  final String? providerUsed;
  final String? modelUsed;
  final int? sessionNumber;
  final String? sessionDate;

  CollabChatMessage({
    required this.id,
    required this.userId,
    required this.userName,
    required this.message,
    this.color = '#38BDF8',
    DateTime? timestamp,
    this.senderType = 'human',
    this.aiMode,
    this.requestedByUserName,
    List<String>? targetNodes,
    this.mutatedDiagram = false,
    this.providerUsed,
    this.modelUsed,
    this.sessionNumber,
    this.sessionDate,
  })  : timestamp = timestamp ?? DateTime.now(),
        targetNodes = targetNodes ?? [];

  bool get isAi => senderType == 'ai' || userId.startsWith('ai_');

  factory CollabChatMessage.fromJson(Map<String, dynamic> json) {
    final rawTs = json['timestamp'] ?? json['createdAt'];
    final rawTargets = (json['targetNodes'] as List?) ?? const [];
    final uid = (json['userId'] ?? '').toString();
    final sType = (json['senderType'] ??
            (uid.startsWith('ai_') ? 'ai' : 'human'))
        .toString();
    return CollabChatMessage(
      id: (json['id'] ?? json['_id'] ?? 'chat_${DateTime.now().millisecondsSinceEpoch}')
          .toString(),
      userId: uid,
      userName: (json['userName'] ?? 'Usuario').toString(),
      message: (json['message'] ?? '').toString(),
      color: (json['color'] ?? (sType == 'ai' ? '#8B5CF6' : '#38BDF8')).toString(),
      timestamp: rawTs != null
          ? DateTime.tryParse(rawTs.toString()) ?? DateTime.now()
          : DateTime.now(),
      senderType: sType,
      aiMode: json['aiMode']?.toString(),
      requestedByUserName: json['requestedByUserName']?.toString(),
      targetNodes: rawTargets.map((e) => e.toString()).toList(),
      mutatedDiagram: json['mutatedDiagram'] == true,
      providerUsed: json['providerUsed']?.toString(),
      modelUsed: json['modelUsed']?.toString(),
      sessionNumber: json['sessionNumber'] is num
          ? (json['sessionNumber'] as num).toInt()
          : null,
      sessionDate: json['sessionDate']?.toString(),
    );
  }
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
  final String actorType; // human | ai
  final List<String> affectedClasses;
  final int? sessionNumber;
  final String? sessionDate;

  CollabActivityLog({
    required this.id,
    required this.userId,
    required this.userName,
    required this.action,
    this.detail,
    this.category = 'uml',
    this.color = '#38BDF8',
    DateTime? timestamp,
    this.actorType = 'human',
    List<String>? affectedClasses,
    this.sessionNumber,
    this.sessionDate,
  })  : timestamp = timestamp ?? DateTime.now(),
        affectedClasses = affectedClasses ?? [];

  bool get isAi => actorType == 'ai' || userId.startsWith('ai_');

  factory CollabActivityLog.fromJson(Map<String, dynamic> json) {
    final rawTs = json['timestamp'] ?? json['createdAt'];
    final rawClasses = (json['affectedClasses'] as List?) ?? const [];
    final uid = (json['userId'] ?? '').toString();
    final aType = (json['actorType'] ??
            (uid.startsWith('ai_') ? 'ai' : 'human'))
        .toString();
    return CollabActivityLog(
      id: (json['id'] ?? json['_id'] ?? 'act_${DateTime.now().millisecondsSinceEpoch}')
          .toString(),
      userId: uid,
      userName: (json['userName'] ?? 'Usuario').toString(),
      action: (json['action'] ?? '').toString(),
      detail: json['detail']?.toString(),
      category: (json['category'] ?? 'uml').toString(),
      color: (json['color'] ?? (aType == 'ai' ? '#8B5CF6' : '#38BDF8')).toString(),
      timestamp: rawTs != null
          ? DateTime.tryParse(rawTs.toString()) ?? DateTime.now()
          : DateTime.now(),
      actorType: aType,
      affectedClasses: rawClasses.map((e) => e.toString()).toList(),
      sessionNumber: json['sessionNumber'] is num
          ? (json['sessionNumber'] as num).toInt()
          : null,
      sessionDate: json['sessionDate']?.toString(),
    );
  }
}

