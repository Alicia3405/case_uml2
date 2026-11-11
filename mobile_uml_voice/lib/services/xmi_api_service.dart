import '../models/uml_models.dart';
import 'api_client.dart';

/// Cliente real de interoperabilidad XMI 2.1 (`/api/xmi/*`) compatible con Enterprise Architect.
class XmiApiService {
  final ApiClient apiClient;

  XmiApiService(this.apiClient);

  Future<String> exportDiagramXml(String diagramId) async {
    return apiClient.getRawText('/xmi/export/$diagramId');
  }

  Future<UmlDiagram> importXmi({
    required String xmiContent,
    String? diagramId,
    String? projectId,
    String? diagramName,
  }) async {
    final data = await apiClient.postJson(
      '/xmi/import',
      {
        'xmiContent': xmiContent,
        'diagramId': ?diagramId,
        'projectId': ?projectId,
        if (diagramName != null && diagramName.trim().isNotEmpty)
          'diagramName': diagramName.trim(),
      },
      timeout: const Duration(seconds: 30),
    );

    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      if (map['diagram'] is Map) {
        return UmlDiagram.fromJson(Map<String, dynamic>.from(map['diagram'] as Map));
      }
      return UmlDiagram.fromJson(map);
    }
    throw ApiException('Respuesta inválida al importar el XMI.');
  }
}

