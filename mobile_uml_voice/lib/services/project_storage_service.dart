import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/auth_models.dart';
import '../models/uml_models.dart';
import 'api_client.dart';

class OfflineSyncMutation {
  final String diagramId;
  final String diagramName;
  final String projectName;
  final String queuedAt;
  final Map<String, dynamic> astPayload;

  OfflineSyncMutation({
    required this.diagramId,
    required this.diagramName,
    required this.projectName,
    required this.queuedAt,
    required this.astPayload,
  });

  factory OfflineSyncMutation.fromJson(Map<String, dynamic> json) =>
      OfflineSyncMutation(
        diagramId: (json['diagramId'] ?? '').toString(),
        diagramName: (json['diagramName'] ?? 'Diagrama').toString(),
        projectName: (json['projectName'] ?? 'Proyecto').toString(),
        queuedAt: (json['queuedAt'] ?? '').toString(),
        astPayload: Map<String, dynamic>.from(json['astPayload'] as Map),
      );

  Map<String, dynamic> toJson() => {
        'diagramId': diagramId,
        'diagramName': diagramName,
        'projectName': projectName,
        'queuedAt': queuedAt,
        'astPayload': astPayload,
      };
}

class SyncQueueResult {
  final int synced;
  final int failed;
  final String? lastError;

  const SyncQueueResult({
    required this.synced,
    required this.failed,
    this.lastError,
  });
}

/// Repositorio conectado a `/api/projects`, `/api/projects/:id/members` y `/api/diagrams`
/// con caché local por usuario y cola real de sincronización offline.
class ProjectStorageService {
  final ApiClient apiClient;

  ProjectStorageService(this.apiClient);

  String _projectsCacheKey(String userId) => 'casestudio_projects_cache_$userId';
  String _diagramCacheKey(String userId, String diagramId) =>
      'casestudio_diagram_${userId}_$diagramId';
  String _syncQueueKey(String userId) => 'casestudio_sync_queue_$userId';

  Future<List<ProjectSummary>> fetchProjects({String? cacheUserId}) async {
    final data = await apiClient.getJson('/projects');
    if (data is! List) {
      throw ApiException('Formato inesperado al listar proyectos.');
    }
    final list = data
        .map((e) => ProjectSummary.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();

    if (cacheUserId != null && cacheUserId.isNotEmpty) {
      await _cacheProjects(cacheUserId, list);
    }
    return list;
  }

  Future<List<ProjectSummary>> loadCachedProjects(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_projectsCacheKey(userId));
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw) as List;
      return decoded
          .map((e) => ProjectSummary.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _cacheProjects(String userId, List<ProjectSummary> list) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _projectsCacheKey(userId),
        jsonEncode(list.map((p) => p.toJson()).toList()),
      );
    } catch (_) {}
  }

  Future<ProjectSummary> createProject({
    required String name,
    String? description,
    String basePackage = 'com.casestudio',
    int javaVersion = 21,
    String springBootVersion = '3.4.0',
  }) async {
    final data = await apiClient.postJson('/projects', {
      'name': name.trim(),
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      'basePackage': basePackage.trim().isEmpty ? 'com.casestudio' : basePackage.trim(),
      'javaVersion': javaVersion,
      'springBootVersion': springBootVersion,
    });
    if (data is Map) {
      return ProjectSummary.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('No se pudo interpretar el proyecto creado.');
  }

  Future<void> deleteProject(String projectId) async {
    await apiClient.deleteJson('/projects/$projectId');
  }

  Future<List<UmlDiagram>> fetchDiagramsByProject(String projectId) async {
    final data = await apiClient.getJson('/diagrams/project/$projectId');
    if (data is! List) return [];
    return data
        .map((e) => UmlDiagram.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<UmlDiagram> loadDiagram(String diagramId, {String? cacheUserId}) async {
    final data = await apiClient.getJson('/diagrams/$diagramId');
    if (data is! Map) {
      throw ApiException('No se pudo interpretar el diagrama recibido.');
    }
    final diagram = UmlDiagram.fromJson(Map<String, dynamic>.from(data));
    if (cacheUserId != null && cacheUserId.isNotEmpty) {
      await cacheDiagramLocal(cacheUserId, diagram);
    }
    return diagram;
  }

  Future<UmlDiagram?> loadCachedDiagram(String userId, String diagramId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_diagramCacheKey(userId, diagramId));
      if (raw == null || raw.isEmpty) return null;
      return UmlDiagram.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> cacheDiagramLocal(String userId, UmlDiagram diagram) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _diagramCacheKey(userId, diagram.id),
        jsonEncode(diagram.toJson()),
      );
    } catch (_) {}
  }

  Future<UmlDiagram> createDiagram(String projectId, String name) async {
    final data = await apiClient.postJson('/diagrams', {
      'projectId': projectId,
      'name': name.trim(),
    });
    if (data is Map) {
      return UmlDiagram.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('No se pudo crear el diagrama.');
  }

  Future<UmlDiagram> saveDiagramAst(
    String diagramId,
    UmlDiagram diagram, {
    String? cacheUserId,
  }) async {
    final data = await apiClient.putJson(
      '/diagrams/$diagramId/ast',
      diagram.toSaveAstPayload(),
    );
    if (data is! Map) {
      throw ApiException('Respuesta inválida al guardar el AST.');
    }
    final saved = UmlDiagram.fromJson(Map<String, dynamic>.from(data));
    if (cacheUserId != null && cacheUserId.isNotEmpty) {
      await cacheDiagramLocal(cacheUserId, saved);
    }
    return saved;
  }

  // --- Colaboradores & Permisos (`/api/projects/:id/members`) ---

  Future<List<ProjectMember>> fetchMembers(String projectId) async {
    final data = await apiClient.getJson('/projects/$projectId/members');
    if (data is! List) return [];
    return data
        .map((m) => ProjectMember.fromJson(Map<String, dynamic>.from(m as Map)))
        .toList();
  }

  Future<ProjectMember> inviteMember({
    required String projectId,
    required String email,
    String role = 'EDITOR',
    bool? canDownloadCode,
  }) async {
    final data = await apiClient.postJson('/projects/$projectId/members', {
      'email': email.trim().toLowerCase(),
      'role': role.toUpperCase(),
      'canDownloadCode': ?canDownloadCode,
    });
    if (data is Map) {
      return ProjectMember.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida al invitar miembro.');
  }

  Future<ProjectMember> updateMemberPermissions({
    required String projectId,
    required String targetUserId,
    String? role,
    bool? canDownloadCode,
  }) async {
    final data = await apiClient.patchJson(
      '/projects/$projectId/members/$targetUserId',
      {
        if (role != null) 'role': role.toUpperCase(),
        'canDownloadCode': ?canDownloadCode,
      },
    );
    if (data is Map) {
      return ProjectMember.fromJson(Map<String, dynamic>.from(data));
    }
    throw ApiException('Respuesta inválida al actualizar permisos.');
  }

  Future<void> removeMember({
    required String projectId,
    required String targetUserId,
  }) async {
    await apiClient.deleteJson('/projects/$projectId/members/$targetUserId');
  }

  // --- Cola real de sincronización offline ---

  Future<List<OfflineSyncMutation>> getPendingMutations(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_syncQueueKey(userId));
      if (raw == null || raw.isEmpty) return [];
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => OfflineSyncMutation.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> queueAstMutation({
    required String userId,
    required UmlDiagram diagram,
    String projectName = 'Proyecto UML',
  }) async {
    try {
      final queue = await getPendingMutations(userId);
      queue.removeWhere((m) => m.diagramId == diagram.id);
      queue.add(
        OfflineSyncMutation(
          diagramId: diagram.id,
          diagramName: diagram.name,
          projectName: projectName,
          queuedAt: DateTime.now().toIso8601String(),
          astPayload: diagram.toSaveAstPayload(),
        ),
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _syncQueueKey(userId),
        jsonEncode(queue.map((m) => m.toJson()).toList()),
      );
      await cacheDiagramLocal(userId, diagram);
    } catch (_) {}
  }

  Future<void> clearMutationForDiagram(String userId, String diagramId) async {
    try {
      final queue = await getPendingMutations(userId);
      queue.removeWhere((m) => m.diagramId == diagramId);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _syncQueueKey(userId),
        jsonEncode(queue.map((m) => m.toJson()).toList()),
      );
    } catch (_) {}
  }

  Future<SyncQueueResult> syncPendingMutations(String userId) async {
    final queue = await getPendingMutations(userId);
    if (queue.isEmpty) {
      return const SyncQueueResult(synced: 0, failed: 0);
    }

    final remaining = <OfflineSyncMutation>[];
    var synced = 0;
    var failed = 0;
    String? lastError;

    for (final item in queue) {
      try {
        final data = await apiClient.putJson(
          '/diagrams/${item.diagramId}/ast',
          item.astPayload,
        );
        if (data is Map) {
          final saved = UmlDiagram.fromJson(Map<String, dynamic>.from(data));
          await cacheDiagramLocal(userId, saved);
        }
        synced++;
      } on ApiException catch (e) {
        if (e.isForbidden || e.statusCode == 404) {
          // Si perdió permisos o se eliminó en servidor, descartamos esta mutación
          lastError = e.message;
          failed++;
        } else {
          remaining.add(item);
          lastError = e.message;
          failed++;
        }
      } catch (e) {
        remaining.add(item);
        lastError = e.toString();
        failed++;
      }
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _syncQueueKey(userId),
        jsonEncode(remaining.map((m) => m.toJson()).toList()),
      );
    } catch (_) {}

    return SyncQueueResult(synced: synced, failed: failed, lastError: lastError);
  }
}

