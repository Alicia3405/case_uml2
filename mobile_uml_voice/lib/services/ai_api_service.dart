import '../models/uml_models.dart';
import 'api_client.dart';

class AiModelsCatalog {
  final String defaultModel;
  final String defaultProvider;
  final bool isOllamaAvailable;
  final List<AiModelOption> models;

  AiModelsCatalog({
    required this.defaultModel,
    required this.defaultProvider,
    required this.isOllamaAvailable,
    required this.models,
  });

  factory AiModelsCatalog.fromJson(Map<String, dynamic> json) {
    final rawModels = (json['models'] as List?) ?? const [];
    return AiModelsCatalog(
      defaultModel: (json['defaultModel'] ?? 'gemini-3.5-flash-lite').toString(),
      defaultProvider: (json['defaultProvider'] ?? 'vertex').toString(),
      isOllamaAvailable: json['isOllamaAvailable'] == true,
      models: rawModels
          .map((m) => AiModelOption.fromJson(Map<String, dynamic>.from(m as Map)))
          .toList(),
    );
  }
}

class AiSuggestionItem {
  final String id;
  final String severity; // idea | warning | discipline
  final String? targetNodeId;
  final String? targetClassName;
  final String title;
  final String message;
  final String? suggestedPrompt;

  AiSuggestionItem({
    required this.id,
    this.severity = 'idea',
    this.targetNodeId,
    this.targetClassName,
    required this.title,
    required this.message,
    this.suggestedPrompt,
  });

  factory AiSuggestionItem.fromJson(Map<String, dynamic> json) =>
      AiSuggestionItem(
        id: (json['id'] ?? 'sug_${DateTime.now().millisecondsSinceEpoch}')
            .toString(),
        severity: (json['severity'] ?? 'idea').toString(),
        targetNodeId: json['targetNodeId']?.toString(),
        targetClassName: json['targetClassName']?.toString(),
        title: (json['title'] ?? 'Sugerencia').toString(),
        message: (json['message'] ?? '').toString(),
        suggestedPrompt: json['suggestedPrompt']?.toString(),
      );
}

class DisciplineAlertItem {
  final String code;
  final String severity; // warning | discipline
  final String? targetNodeId;
  final String? className;
  final String message;
  final String? suggestedPrompt;

  DisciplineAlertItem({
    required this.code,
    this.severity = 'warning',
    this.targetNodeId,
    this.className,
    required this.message,
    this.suggestedPrompt,
  });

  factory DisciplineAlertItem.fromJson(Map<String, dynamic> json) =>
      DisciplineAlertItem(
        code: (json['code'] ?? 'OMT').toString(),
        severity: (json['severity'] ?? 'warning').toString(),
        targetNodeId: json['targetNodeId']?.toString(),
        className: json['className']?.toString(),
        message: (json['message'] ?? '').toString(),
        suggestedPrompt: json['suggestedPrompt']?.toString(),
      );
}

class OllamaRuntimeConfig {
  final String baseUrl;
  final String model;
  final String visionModel;
  final int timeoutMs;
  final bool isCustomRuntime;

  OllamaRuntimeConfig({
    required this.baseUrl,
    required this.model,
    required this.visionModel,
    this.timeoutMs = 120000,
    this.isCustomRuntime = false,
  });

  bool get isColabTunnel =>
      baseUrl.contains('ngrok') ||
      baseUrl.contains('trycloudflare') ||
      baseUrl.contains('loca.lt');

  factory OllamaRuntimeConfig.fromJson(Map<String, dynamic> json) =>
      OllamaRuntimeConfig(
        baseUrl: (json['baseUrl'] ?? '').toString(),
        model: (json['model'] ?? 'qwen2.5:3b').toString(),
        visionModel: (json['visionModel'] ?? 'qwen2.5vl:7b').toString(),
        timeoutMs: json['timeoutMs'] is num
            ? (json['timeoutMs'] as num).toInt()
            : 120000,
        isCustomRuntime: json['isCustomRuntime'] == true,
      );
}

class OllamaConnectionTestResult {
  final bool ok;
  final String baseUrl;
  final int latencyMs;
  final List<String> models;
  final String defaultModel;
  final String visionModel;
  final bool hasVisionModel;
  final String? error;

  OllamaConnectionTestResult({
    required this.ok,
    required this.baseUrl,
    this.latencyMs = 0,
    List<String>? models,
    this.defaultModel = '',
    this.visionModel = '',
    this.hasVisionModel = false,
    this.error,
  }) : models = models ?? [];

  factory OllamaConnectionTestResult.fromJson(Map<String, dynamic> json) =>
      OllamaConnectionTestResult(
        ok: json['ok'] == true,
        baseUrl: (json['baseUrl'] ?? '').toString(),
        latencyMs:
            json['latencyMs'] is num ? (json['latencyMs'] as num).toInt() : 0,
        models: ((json['models'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        defaultModel: (json['defaultModel'] ?? '').toString(),
        visionModel: (json['visionModel'] ?? '').toString(),
        hasVisionModel: json['hasVisionModel'] == true,
        error: json['error']?.toString(),
      );
}

class AiMutationResult {
  final bool success;
  final String action;
  final String message;
  final List<UmlNode> nodes;
  final List<UmlConnection> connections;
  final String changesSummary;
  final String? providerUsed;
  final String? modelUsed;
  final String? intentMode;
  final bool mutatedDiagram;
  final List<AiSuggestionItem> suggestions;
  final List<AiAnnotationItem> annotationsAdded;
  final List<DisciplineAlertItem> disciplineAlerts;
  final bool broadcastedToRoom;

  AiMutationResult({
    required this.success,
    required this.action,
    required this.message,
    required this.nodes,
    required this.connections,
    required this.changesSummary,
    this.providerUsed,
    this.modelUsed,
    this.intentMode,
    bool? mutatedDiagram,
    List<AiSuggestionItem>? suggestions,
    List<AiAnnotationItem>? annotationsAdded,
    List<DisciplineAlertItem>? disciplineAlerts,
    this.broadcastedToRoom = false,
  })  : mutatedDiagram = mutatedDiagram ??
            (action != 'advise' &&
                action != 'review' &&
                action != 'discipline' &&
                action != 'recap' &&
                action != 'clarification_required'),
        suggestions = suggestions ?? [],
        annotationsAdded = annotationsAdded ?? [],
        disciplineAlerts = disciplineAlerts ?? [];

  factory AiMutationResult.fromJson(Map<String, dynamic> json) {
    final rawNodes = (json['nodes'] as List?) ?? const [];
    final rawConns = (json['connections'] as List?) ?? const [];
    final rawSugs = (json['suggestions'] as List?) ?? const [];
    final rawAnnots = (json['annotationsAdded'] as List?) ?? const [];
    final rawAlerts = (json['disciplineAlerts'] as List?) ?? const [];
    final action = (json['action'] ?? 'update').toString();
    final rawMutated = json['mutatedDiagram'];
    final mutated = rawMutated is bool
        ? rawMutated
        : (action != 'advise' &&
            action != 'review' &&
            action != 'discipline' &&
            action != 'recap' &&
            action != 'clarification_required');

    return AiMutationResult(
      success: json['success'] != false,
      action: action,
      message: (json['message'] ?? '').toString(),
      nodes: rawNodes
          .map((n) => UmlNode.fromJson(Map<String, dynamic>.from(n as Map)))
          .toList(),
      connections: rawConns
          .map((c) => UmlConnection.fromJson(Map<String, dynamic>.from(c as Map)))
          .toList(),
      changesSummary: (json['changesSummary'] ?? json['message'] ?? '').toString(),
      providerUsed: json['providerUsed']?.toString(),
      modelUsed: json['modelUsed']?.toString(),
      intentMode: json['intentMode']?.toString(),
      mutatedDiagram: mutated,
      suggestions: rawSugs
          .map((s) => AiSuggestionItem.fromJson(Map<String, dynamic>.from(s as Map)))
          .toList(),
      annotationsAdded: rawAnnots
          .map((a) => AiAnnotationItem.fromJson(Map<String, dynamic>.from(a as Map)))
          .toList(),
      disciplineAlerts: rawAlerts
          .map((d) =>
              DisciplineAlertItem.fromJson(Map<String, dynamic>.from(d as Map)))
          .toList(),
      broadcastedToRoom: json['broadcastedToRoom'] == true,
    );
  }
}

/// Cliente real contra los endpoints IA del backend (`/api/ai/*`).
class AiApiService {
  final ApiClient apiClient;

  AiApiService(this.apiClient);

  Future<AiModelsCatalog> fetchModels() async {
    final data = await apiClient.getJson('/ai/models', includeAuth: false);
    if (data is Map) {
      return AiModelsCatalog.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Formato inválido al listar modelos de IA.');
  }

  Future<OllamaRuntimeConfig> fetchOllamaConfig() async {
    final data = await apiClient.getJson('/ai/ollama/config');
    if (data is Map) {
      return OllamaRuntimeConfig.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Formato inválido al obtener configuración de Ollama.');
  }

  Future<OllamaRuntimeConfig> updateOllamaConfig({
    String? baseUrl,
    String? model,
    String? visionModel,
    bool resetToEnv = false,
  }) async {
    final data = await apiClient.postJson('/ai/ollama/config', {
      if (baseUrl != null && baseUrl.trim().isNotEmpty) 'baseUrl': baseUrl.trim(),
      if (model != null && model.trim().isNotEmpty) 'model': model.trim(),
      if (visionModel != null && visionModel.trim().isNotEmpty)
        'visionModel': visionModel.trim(),
      if (resetToEnv) 'resetToEnv': true,
    });
    if (data is Map) {
      return OllamaRuntimeConfig.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('No se pudo actualizar la configuración de Ollama.');
  }

  Future<OllamaConnectionTestResult> testOllamaConnection({String? baseUrl}) async {
    final data = await apiClient.postJson('/ai/ollama/test', {
      if (baseUrl != null && baseUrl.trim().isNotEmpty) 'baseUrl': baseUrl.trim(),
    });
    if (data is Map) {
      return OllamaConnectionTestResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida al probar Ollama/Colab.');
  }

  Future<AiMutationResult> sendPrompt({
    required String prompt,
    required String diagramId,
    String? roomCode,
    required List<UmlNode> currentNodes,
    required List<UmlConnection> currentConnections,
    String? provider,
    String? model,
    AiPromptMode mode = AiPromptMode.auto,
    bool broadcastToRoom = true,
    bool createWhiteboardNotes = true,
    List<String>? selectedNodeIds,
    bool persistChanges = false,
    String? authorUserId,
    String? authorUserName,
    bool isAudio = false,
  }) async {
    final endpoint = isAudio ? '/ai/audio-prompt' : '/ai/prompt';
    final data = await apiClient.postJson(
      endpoint,
      {
        'prompt': prompt,
        'diagramId': diagramId,
        if (roomCode != null && roomCode.isNotEmpty) 'roomCode': roomCode,
        'currentNodes': currentNodes.map((n) => n.toCollaborativeJson()).toList(),
        'currentConnections': currentConnections.map((c) => c.toSaveAstJson()).toList(),
        if (provider != null && provider.isNotEmpty) 'provider': provider,
        if (model != null && model.isNotEmpty) 'model': model,
        'mode': mode.code,
        'broadcastToRoom': broadcastToRoom,
        'createWhiteboardNotes': createWhiteboardNotes,
        if (selectedNodeIds != null && selectedNodeIds.isNotEmpty)
          'selectedNodeIds': selectedNodeIds,
        'persistChanges': persistChanges,
        if (authorUserId != null && authorUserId.isNotEmpty)
          'authorUserId': authorUserId,
        if (authorUserName != null && authorUserName.isNotEmpty)
          'authorUserName': authorUserName,
      },
      timeout: const Duration(seconds: 75),
    );
    if (data is Map) {
      return AiMutationResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida del asistente IA.');
  }

  Future<AiMutationResult> analyzeVisionDiagram({
    required String imageBase64,
    required String mimeType,
    required String diagramId,
    String? roomCode,
    String? prompt,
    required List<UmlNode> currentNodes,
    required List<UmlConnection> currentConnections,
    String? provider,
    String? model,
    String mode = 'auto',
    bool broadcastToRoom = true,
    bool persistChanges = false,
  }) async {
    final data = await apiClient.postJson(
      '/ai/vision-diagram',
      {
        'imageBase64': imageBase64,
        'mimeType': mimeType,
        'diagramId': diagramId,
        if (roomCode != null && roomCode.isNotEmpty) 'roomCode': roomCode,
        if (prompt != null && prompt.trim().isNotEmpty) 'prompt': prompt.trim(),
        'currentNodes': currentNodes.map((n) => n.toCollaborativeJson()).toList(),
        'currentConnections': currentConnections.map((c) => c.toSaveAstJson()).toList(),
        if (provider != null && provider.isNotEmpty) 'provider': provider,
        if (model != null && model.isNotEmpty) 'model': model,
        'mode': mode,
        'broadcastToRoom': broadcastToRoom,
        'persistChanges': persistChanges,
      },
      timeout: const Duration(seconds: 90),
    );
    if (data is Map) {
      return AiMutationResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida de Vision AI.');
  }
}

