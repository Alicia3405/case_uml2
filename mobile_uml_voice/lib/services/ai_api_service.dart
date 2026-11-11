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

class AiMutationResult {
  final bool success;
  final String action;
  final String message;
  final List<UmlNode> nodes;
  final List<UmlConnection> connections;
  final String changesSummary;
  final String? providerUsed;
  final String? modelUsed;

  AiMutationResult({
    required this.success,
    required this.action,
    required this.message,
    required this.nodes,
    required this.connections,
    required this.changesSummary,
    this.providerUsed,
    this.modelUsed,
  });

  factory AiMutationResult.fromJson(Map<String, dynamic> json) {
    final rawNodes = (json['nodes'] as List?) ?? const [];
    final rawConns = (json['connections'] as List?) ?? const [];
    return AiMutationResult(
      success: json['success'] != false,
      action: (json['action'] ?? 'update').toString(),
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

  Future<AiMutationResult> sendPrompt({
    required String prompt,
    required String diagramId,
    String? roomCode,
    required List<UmlNode> currentNodes,
    required List<UmlConnection> currentConnections,
    String? provider,
    String? model,
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
      },
      timeout: const Duration(seconds: 60),
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
      },
      timeout: const Duration(seconds: 75),
    );
    if (data is Map) {
      return AiMutationResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida de Gemini Vision.');
  }
}

