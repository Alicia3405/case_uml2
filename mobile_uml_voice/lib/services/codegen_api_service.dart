import 'dart:typed_data';
import '../models/uml_models.dart';
import 'api_client.dart';

class CodegenPreviewFile {
  final String path;
  final String filename;
  final String language;
  final String layer;
  final String content;

  CodegenPreviewFile({
    required this.path,
    required this.filename,
    required this.language,
    required this.layer,
    required this.content,
  });

  factory CodegenPreviewFile.fromJson(Map<String, dynamic> json) => CodegenPreviewFile(
        path: (json['path'] ?? '').toString(),
        filename: (json['filename'] ?? '').toString(),
        language: (json['language'] ?? 'text').toString(),
        layer: (json['layer'] ?? 'config').toString(),
        content: (json['content'] ?? '').toString(),
      );
}

class CodegenPreviewResult {
  final String projectName;
  final int totalFiles;
  final List<CodegenPreviewFile> files;

  CodegenPreviewResult({
    required this.projectName,
    required this.totalFiles,
    required this.files,
  });

  factory CodegenPreviewResult.fromJson(Map<String, dynamic> json) {
    final rawFiles = (json['files'] as List?) ?? const [];
    return CodegenPreviewResult(
      projectName: (json['projectName'] ?? 'CASE Studio Project').toString(),
      totalFiles: json['totalFiles'] is num
          ? (json['totalFiles'] as num).toInt()
          : rawFiles.length,
      files: rawFiles
          .map((f) => CodegenPreviewFile.fromJson(Map<String, dynamic>.from(f as Map)))
          .toList(),
    );
  }
}

/// Cliente real de generación de código (`/api/codegen/*`) para Spring Boot 3.4 / Flutter.
class CodegenApiService {
  final ApiClient apiClient;

  CodegenApiService(this.apiClient);

  Future<CodegenPreviewResult> previewCode({
    required String diagramId,
    required ProjectSummary project,
    String platform = 'all',
  }) async {
    final data = await apiClient.postJson(
      '/codegen/preview/$diagramId',
      {
        'diagramId': diagramId,
        'packageName': project.basePackage,
        'projectName': project.name,
        'javaVersion': project.javaVersion.toString(),
        'springBootVersion': project.springBootVersion,
        'platform': platform,
      },
      timeout: const Duration(seconds: 40),
    );
    if (data is Map) {
      return CodegenPreviewResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida del generador de código.');
  }

  Future<Uint8List> downloadZip({
    required String diagramId,
    required ProjectSummary project,
    String platform = 'all',
  }) async {
    return apiClient.postRawBytes('/codegen/download/$diagramId', {
      'diagramId': diagramId,
      'packageName': project.basePackage,
      'projectName': project.name,
      'javaVersion': project.javaVersion.toString(),
      'springBootVersion': project.springBootVersion,
      'platform': platform,
    });
  }
}

