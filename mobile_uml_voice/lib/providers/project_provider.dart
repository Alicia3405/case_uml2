import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/uml_models.dart';
import '../services/ai_api_service.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/codegen_api_service.dart';
import '../services/collaboration_socket_service.dart';
import '../services/project_storage_service.dart';
import '../services/tts_service.dart';
import '../services/uml_audit_helper.dart';
import '../services/uml_voice_commander.dart';
import '../services/xmi_api_service.dart';

/// Provider maestro del espacio de trabajo UML móvil:
/// coordina proyectos, diagramas, Socket.IO en vivo, comandos de voz híbridos,
/// Vision AI, generación de código Spring/Flutter, interoperabilidad XMI y cola offline.
class ProjectProvider extends ChangeNotifier {
  static const _uuid = Uuid();
  static const int _maxHistory = 25;

  final AuthService authService;
  final ProjectStorageService storageService;
  final CollaborationSocketService collabService;
  final AiApiService aiService;
  final CodegenApiService codegenService;
  final XmiApiService xmiService;
  final TtsService ttsService;

  List<ProjectSummary> _projects = [];
  ProjectSummary? _activeProject;
  List<UmlDiagram> _activeProjectDiagrams = [];
  UmlDiagram? _activeDiagram;
  List<OfflineSyncMutation> _pendingMutations = [];

  List<AiModelOption> _availableAiModels = [];
  String _selectedAiProvider = 'vertex';
  String _selectedAiModel = 'gemini-3.5-flash-lite';
  bool _isOllamaAvailable = false;
  AiPromptMode _selectedAiMode = AiPromptMode.auto;
  bool _broadcastAiToRoom = true;
  bool _createAiWhiteboardNotes = true;
  List<AiSuggestionItem> _latestAiSuggestions = [];
  List<DisciplineAlertItem> _latestDisciplineAlerts = [];
  String? _latestAiIntentMode;
  OllamaRuntimeConfig? _ollamaConfig;

  ResumeBundleDto? _resumeBundle;
  List<DiagramSnapshotItem> _snapshots = [];
  bool _dismissedResumeBanner = false;

  bool _isLoading = false;
  bool _isBusy = false;
  bool _hasUnsavedChanges = false;
  bool _localReadOnlyOverride = false;
  String? _statusMessage;
  String? _lastError;
  String _voiceDialogue =
      'Hola, soy tu copiloto UML. Toca el orbe o el botón de micrófono y dicta tu arquitectura.';

  String? _boundUserId;
  final List<UmlDiagram> _undoStack = [];
  final List<UmlDiagram> _redoStack = [];

  StreamSubscription<RemoteNodeDragEvent>? _dragSub;
  StreamSubscription<RemoteDiagramSyncEvent>? _syncSub;
  StreamSubscription<NodeLockRejectedEvent>? _lockRejectSub;
  StreamSubscription<ProjectPermissionsEvent>? _permSub;
  StreamSubscription<HostTransferredEvent>? _hostTransferSub;
  StreamSubscription<List<AiAnnotationItem>>? _aiAnnotsSub;
  StreamSubscription<CollabNotificationItem>? _notificationSub;

  ProjectProvider({
    required this.authService,
    required this.storageService,
    required this.collabService,
    required this.aiService,
    required this.codegenService,
    required this.xmiService,
    TtsService? tts,
  }) : ttsService = tts ?? TtsService() {
    _listenSocketStreams();
    collabService.addListener(_onCollabChanged);
    authService.addListener(_onAuthServiceChanged);
    if (authService.currentUser != null) {
      Future.microtask(onAuthChanged);
    }
  }

  void _onAuthServiceChanged() {
    Future.microtask(onAuthChanged);
  }

  List<ProjectSummary> get projects => _projects;
  ProjectSummary? get activeProject => _activeProject;
  List<UmlDiagram> get activeProjectDiagrams => _activeProjectDiagrams;
  UmlDiagram? get activeDiagram => _activeDiagram;
  List<OfflineSyncMutation> get pendingMutations => _pendingMutations;
  int get pendingSyncCount => _pendingMutations.length;

  List<AiModelOption> get availableAiModels => _availableAiModels;
  String get selectedAiProvider => _selectedAiProvider;
  String get selectedAiModel => _selectedAiModel;
  bool get isOllamaAvailable => _isOllamaAvailable;
  AiPromptMode get selectedAiMode => _selectedAiMode;
  bool get broadcastAiToRoom => _broadcastAiToRoom;
  bool get createAiWhiteboardNotes => _createAiWhiteboardNotes;
  List<AiSuggestionItem> get latestAiSuggestions =>
      List.unmodifiable(_latestAiSuggestions);
  List<DisciplineAlertItem> get latestDisciplineAlerts =>
      List.unmodifiable(_latestDisciplineAlerts);
  String? get latestAiIntentMode => _latestAiIntentMode;
  OllamaRuntimeConfig? get ollamaConfig => _ollamaConfig;

  ResumeBundleDto? get resumeBundle => _resumeBundle;
  List<DiagramSnapshotItem> get snapshots => List.unmodifiable(_snapshots);
  List<CollabNotificationItem> get notifications => collabService.notifications;
  int get unreadNotificationCount => collabService.unreadNotificationCount;
  CollabSessionMeta? get sessionMeta => collabService.sessionMeta;
  List<AiAnnotationItem> get openAiAnnotations =>
      _activeDiagram?.openAiAnnotations ?? const [];
  bool get shouldShowResumeBanner =>
      !_dismissedResumeBanner &&
      _resumeBundle != null &&
      (_resumeBundle!.sinceLastVisit.changesCount > 0 ||
          _resumeBundle!.unreadNotifications.isNotEmpty ||
          openAiAnnotations.isNotEmpty);

  void dismissResumeBanner() {
    _dismissedResumeBanner = true;
    notifyListeners();
  }

  void setSelectedAiMode(AiPromptMode mode) {
    _selectedAiMode = mode;
    notifyListeners();
  }

  void setBroadcastAiToRoom(bool value) {
    _broadcastAiToRoom = value;
    notifyListeners();
  }

  void setCreateAiWhiteboardNotes(bool value) {
    _createAiWhiteboardNotes = value;
    notifyListeners();
  }

  bool get isLoading => _isLoading;
  bool get isBusy => _isBusy;
  bool get hasUnsavedChanges => _hasUnsavedChanges;
  bool get localReadOnlyOverride => _localReadOnlyOverride;
  bool get isViewerRole => _activeProject?.isViewer ?? false;
  bool get isReadOnly => isViewerRole || _localReadOnlyOverride;
  bool get canDownloadCode => _activeProject?.canDownload ?? true;
  bool get canUndo => !isReadOnly && _undoStack.isNotEmpty;
  bool get canRedo => !isReadOnly && _redoStack.isNotEmpty;

  String? get statusMessage => _statusMessage;
  String? get lastError => _lastError;
  String get voiceDialogue => _voiceDialogue;

  static String generateShortId(String prefix) =>
      '${prefix}_${_uuid.v4().replaceAll('-', '').substring(0, 12)}';

  void _onCollabChanged() {
    notifyListeners();
  }

  void _listenSocketStreams() {
    _dragSub = collabService.onRemoteNodeDrag.listen((event) {
      if (_activeDiagram == null) return;
      final idx = _activeDiagram!.nodes.indexWhere((n) => n.id == event.nodeId);
      if (idx >= 0) {
        _activeDiagram!.nodes[idx].position = event.position;
        notifyListeners();
      }
    });

    _syncSub = collabService.onRemoteDiagramSync.listen((event) {
      if (_activeDiagram == null) return;
      _activeDiagram!.nodes = event.nodes;
      _activeDiagram!.connections = event.connections;
      if (event.aiAnnotations != null) {
        _activeDiagram!.aiAnnotations = event.aiAnnotations!;
      }
      _activeDiagram!.updatedAt = DateTime.now();
      _hasUnsavedChanges = true;
      _statusMessage = 'Actualización colaborativa recibida (${event.action})';
      final user = authService.currentUser;
      if (user != null) {
        storageService.cacheDiagramLocal(user.id, _activeDiagram!);
      }
      notifyListeners();
    });

    _lockRejectSub = collabService.onNodeLockRejected.listen((event) {
      _statusMessage =
          'Nodo bloqueado por ${event.lockedBy.userName}. Intenta cuando termine su edición.';
      notifyListeners();
    });

    _hostTransferSub = collabService.onHostTransferred.listen((event) {
      _statusMessage = event.newHostUserName != null
          ? '👑 Nuevo anfitrión de sala: ${event.newHostUserName}'
          : 'El anfitrión salió de la sala.';
      notifyListeners();
    });

    _aiAnnotsSub = collabService.onAiAnnotationsUpdated.listen((annotations) {
      if (_activeDiagram == null) return;
      _activeDiagram!.aiAnnotations = annotations;
      final user = authService.currentUser;
      if (user != null) {
        storageService.cacheDiagramLocal(user.id, _activeDiagram!);
      }
      notifyListeners();
    });

    _notificationSub = collabService.onNotificationReceived.listen((notif) {
      _statusMessage = '🔔 ${notif.actorName}: ${notif.title}';
      notifyListeners();
    });

    _permSub = collabService.onProjectPermissionsUpdated.listen((event) async {
      final me = authService.currentUser;
      if (me == null) return;
      if (_activeProject == null || _activeProject!.id != event.projectId) {
        return;
      }

      if (event.userId == me.id) {
        if (event.removed) {
          collabService.leaveRoom();
          _activeDiagram = null;
          _activeProject = null;
          _activeProjectDiagrams = [];
          _statusMessage = 'Fuiste removido del proyecto por el propietario.';
          await loadProjects(autoSelectFirst: false);
          return;
        }
        if (event.role != null) {
          _activeProject!.userRole = event.role;
        }
        if (event.canDownloadCode != null) {
          _activeProject!.userCanDownloadCode = event.canDownloadCode;
        }
        _statusMessage =
            'Tus permisos cambiaron en vivo: ${_activeProject!.userRole} ${canDownloadCode ? "• ZIP habilitado" : "• ZIP bloqueado"}';
      }

      await refreshActiveProjectMembers();
      notifyListeners();
    });
  }

  /// Sincroniza ciclo de vida con cambios en `AuthService`.
  Future<void> onAuthChanged() async {
    final user = authService.currentUser;
    if (user == null) {
      if (_boundUserId != null) {
        _resetWorkspaceState();
      }
      return;
    }

    if (_boundUserId != user.id) {
      _resetWorkspaceState();
      _boundUserId = user.id;
      await Future.wait([
        loadProjects(autoSelectFirst: true),
        loadAiModels(),
      ]);
    }
  }

  void _resetWorkspaceState() {
    _boundUserId = null;
    collabService.disconnect();
    _projects = [];
    _activeProject = null;
    _activeProjectDiagrams = [];
    _activeDiagram = null;
    _pendingMutations = [];
    _resumeBundle = null;
    _snapshots = [];
    _dismissedResumeBanner = false;
    _latestAiSuggestions = [];
    _latestDisciplineAlerts = [];
    _latestAiIntentMode = null;
    _undoStack.clear();
    _redoStack.clear();
    _hasUnsavedChanges = false;
    _localReadOnlyOverride = false;
    _lastError = null;
    _statusMessage = null;
    notifyListeners();
  }

  void clearMessages() {
    _lastError = null;
    _statusMessage = null;
    notifyListeners();
  }

  void toggleLocalReadOnly() {
    _localReadOnlyOverride = !_localReadOnlyOverride;
    _statusMessage = _localReadOnlyOverride
        ? 'Candado local activado: modo solo lectura en este dispositivo.'
        : 'Candado local desactivado.';
    notifyListeners();
  }

  void setSelectedAiModel(AiModelOption option) {
    _selectedAiProvider = option.provider;
    _selectedAiModel = option.id;
    notifyListeners();
  }

  Future<void> loadAiModels() async {
    try {
      final catalog = await aiService.fetchModels();
      _availableAiModels = catalog.models;
      _isOllamaAvailable = catalog.isOllamaAvailable;
      if (_availableAiModels.isNotEmpty) {
        final match = _availableAiModels.where((m) => m.id == catalog.defaultModel).firstOrNull ??
            _availableAiModels.first;
        _selectedAiModel = match.id;
        _selectedAiProvider = match.provider;
      }
      notifyListeners();
    } catch (_) {
      // Mantener defaults cuando el backend está offline
    }
  }

  Future<void> loadProjects({bool autoSelectFirst = false}) async {
    final user = authService.currentUser;
    if (user == null) return;

    _isLoading = true;
    _lastError = null;
    notifyListeners();

    try {
      await refreshPendingMutations();
      _projects = await storageService.fetchProjects(cacheUserId: user.id);

      if (_activeProject != null) {
        final updatedActive =
            _projects.where((p) => p.id == _activeProject!.id).firstOrNull;
        if (updatedActive != null) {
          _activeProject = updatedActive;
        }
      }

      if (_activeProject == null && autoSelectFirst && _projects.isNotEmpty) {
        await selectProject(_projects.first);
      }
    } catch (e) {
      final cached = await storageService.loadCachedProjects(user.id);
      if (cached.isNotEmpty) {
        _projects = cached;
        _statusMessage = 'Modo offline: mostrando proyectos guardados localmente.';
      } else {
        _lastError = e.toString();
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshPendingMutations() async {
    final user = authService.currentUser;
    if (user == null) {
      _pendingMutations = [];
      return;
    }
    _pendingMutations = await storageService.getPendingMutations(user.id);
  }

  Future<bool> selectProject(ProjectSummary project) async {
    final user = authService.currentUser;
    if (user == null) return false;

    _isBusy = true;
    _lastError = null;
    _activeProject = project;
    _localReadOnlyOverride = false;
    notifyListeners();

    try {
      final diagrams = await storageService.fetchDiagramsByProject(project.id);
      _activeProjectDiagrams = diagrams;

      if (diagrams.isEmpty) {
        final created = await storageService.createDiagram(
          project.id,
          'Diagrama Principal',
        );
        _activeProjectDiagrams = [created];
      }

      await openDiagram(_activeProjectDiagrams.first);
      await refreshActiveProjectMembers();
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<void> openDiagram(UmlDiagram summaryOrFull) async {
    final user = authService.currentUser;
    if (user == null) return;

    _isBusy = true;
    _undoStack.clear();
    _redoStack.clear();
    _hasUnsavedChanges = false;
    notifyListeners();

    try {
      UmlDiagram loaded;
      try {
        loaded = await storageService.loadDiagram(
          summaryOrFull.id,
          cacheUserId: user.id,
        );
      } catch (e) {
        final cached = await storageService.loadCachedDiagram(user.id, summaryOrFull.id);
        if (cached != null) {
          loaded = cached;
          _statusMessage = 'Diagrama cargado desde caché local (sin red).';
        } else {
          loaded = summaryOrFull.deepCopy();
          _lastError = e.toString();
        }
      }

      _activeDiagram = loaded;
      _resumeBundle = null;
      _snapshots = [];
      _dismissedResumeBanner = false;
      _latestAiSuggestions = [];
      _latestDisciplineAlerts = [];
      _latestAiIntentMode = null;
      collabService.joinRoom(
        socketUrl: authService.apiClient.socketUrl,
        diagramId: loaded.id,
        user: user,
      );
      unawaited(_hydrateCollaborationContext(loaded.id));
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<void> _hydrateCollaborationContext(String diagramId) async {
    try {
      Future<ResumeBundleDto?> safeResume() async {
        try {
          return await storageService.fetchResumeBundle(diagramId);
        } catch (_) {
          return null;
        }
      }

      Future<List<CollabNotificationItem>> safeNotifs() async {
        try {
          return await storageService.fetchNotifications(diagramId: diagramId);
        } catch (_) {
          return const [];
        }
      }

      final bundleFuture = safeResume();
      final notifsFuture = safeNotifs();
      final bundle = await bundleFuture;
      final notifs = await notifsFuture;
      if (_activeDiagram?.id != diagramId) return;

      if (bundle != null) {
        _resumeBundle = bundle;
        _snapshots = bundle.snapshots;
        if (notifs.isEmpty && bundle.unreadNotifications.isNotEmpty) {
          collabService.setNotifications(bundle.unreadNotifications);
        }
      }
      if (notifs.isNotEmpty) {
        collabService.setNotifications(notifs);
      }
      notifyListeners();
    } catch (_) {
      // No bloquear navegación ni lienzo si el backend está offline
    }
  }

  Future<bool> createProject({
    required String name,
    String? description,
    String basePackage = 'com.casestudio',
  }) async {
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final created = await storageService.createProject(
        name: name,
        description: description,
        basePackage: basePackage,
      );
      _projects = [created, ..._projects];
      await selectProject(created);
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> createDiagram(String name) async {
    if (_activeProject == null) return false;
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final created = await storageService.createDiagram(_activeProject!.id, name);
      _activeProjectDiagrams = [..._activeProjectDiagrams, created];
      await openDiagram(created);
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> deleteProject(String projectId) async {
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      await storageService.deleteProject(projectId);
      _projects = _projects.where((p) => p.id != projectId).toList();
      if (_activeProject?.id == projectId) {
        collabService.leaveRoom();
        _activeProject = null;
        _activeProjectDiagrams = [];
        _activeDiagram = null;
      }
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> saveCurrentDiagram({bool silentIfOffline = true}) async {
    final user = authService.currentUser;
    final diagram = _activeDiagram;
    if (user == null || diagram == null) return false;

    if (isReadOnly) {
      _lastError = 'No tienes permiso para guardar cambios en modo VIEWER/lectura.';
      notifyListeners();
      return false;
    }

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final saved = await storageService.saveDiagramAst(
        diagram.id,
        diagram,
        cacheUserId: user.id,
      );
      _activeDiagram = saved;
      _hasUnsavedChanges = false;
      await storageService.clearMutationForDiagram(user.id, saved.id);
      await refreshPendingMutations();
      _statusMessage = 'Diagrama guardado en MongoDB.';
      collabService.sendActivityLog(
        'Guardó el diagrama en nube',
        detail:
            '${saved.visibleNodes.length} elementos, ${saved.connections.length} relaciones',
        category: 'uml',
        affectedClasses:
            saved.visibleNodes.take(6).map((n) => n.name).toList(),
      );
      return true;
    } on ApiException catch (e) {
      _lastError = e.message;
      return false;
    } catch (_) {
      if (silentIfOffline) {
        await storageService.queueAstMutation(
          userId: user.id,
          diagram: diagram,
          projectName: _activeProject?.name ?? 'Proyecto UML',
        );
        await refreshPendingMutations();
        _hasUnsavedChanges = false;
        _statusMessage =
            'Sin conexión: diagrama guardado en cola local para sincronizar luego.';
        return true;
      }
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<SyncQueueResult> syncOfflineQueue() async {
    final user = authService.currentUser;
    if (user == null) {
      return const SyncQueueResult(synced: 0, failed: 0);
    }

    _isBusy = true;
    notifyListeners();

    try {
      final result = await storageService.syncPendingMutations(user.id);
      await refreshPendingMutations();
      if (result.synced > 0) {
        _statusMessage =
            'Sincronización completada (${result.synced} diagrama(s) subidos).';
        await loadProjects();
      } else if (result.failed > 0 && result.lastError != null) {
        _lastError = result.lastError;
      }
      return result;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  // --- Colaboración de Nodos y Bloqueos Mutuos ---

  CollabNodeLock? getForeignNodeLock(String nodeId) {
    final lock = collabService.activeLocks[nodeId];
    if (lock == null) return null;
    if (lock.userId == authService.currentUser?.id) return null;
    return lock;
  }

  bool _guardCanEdit({String? nodeId}) {
    if (_activeDiagram == null) {
      _lastError = 'Abre primero un proyecto y diagrama.';
      notifyListeners();
      return false;
    }
    if (isReadOnly) {
      const msg = 'Modo solo lectura: no puedes editar este diagrama.';
      _lastError = msg;
      ttsService.speak(msg);
      notifyListeners();
      return false;
    }
    if (nodeId != null) {
      final foreignLock = getForeignNodeLock(nodeId);
      if (foreignLock != null) {
        _lastError = 'Elemento bloqueado por ${foreignLock.userName}.';
        notifyListeners();
        return false;
      }
    }
    return true;
  }

  void _pushUndoSnapshot() {
    if (_activeDiagram == null) return;
    _undoStack.add(_activeDiagram!.deepCopy());
    if (_undoStack.length > _maxHistory) {
      _undoStack.removeAt(0);
    }
    _redoStack.clear();
  }

  void _afterDiagramMutation({String action = 'update', String? auditDetail}) {
    if (_activeDiagram == null) return;
    _activeDiagram!.updatedAt = DateTime.now();
    _hasUnsavedChanges = true;
    final user = authService.currentUser;
    if (user != null) {
      storageService.cacheDiagramLocal(user.id, _activeDiagram!);
    }
    collabService.sendDiagramSync(_activeDiagram!, action: action);
    if (auditDetail != null) {
      collabService.sendActivityLog(auditDetail, category: 'uml');
    }
    notifyListeners();
  }

  void undo() {
    if (!canUndo || _activeDiagram == null) return;
    _redoStack.add(_activeDiagram!.deepCopy());
    _activeDiagram = _undoStack.removeLast();
    _afterDiagramMutation(action: 'undo', auditDetail: 'Ejecutó Deshacer');
  }

  void redo() {
    if (!canRedo || _activeDiagram == null) return;
    _undoStack.add(_activeDiagram!.deepCopy());
    _activeDiagram = _redoStack.removeLast();
    _afterDiagramMutation(action: 'redo', auditDetail: 'Ejecutó Rehacer');
  }

  void updateNodePositionLive(String nodeId, Offset newPosition) {
    if (_activeDiagram == null || isReadOnly) return;
    if (getForeignNodeLock(nodeId) != null) return;
    final idx = _activeDiagram!.nodes.indexWhere((n) => n.id == nodeId);
    if (idx < 0) return;

    final clamped = Offset(
      newPosition.dx.clamp(16.0, 4600.0),
      newPosition.dy.clamp(16.0, 4600.0),
    );
    _activeDiagram!.nodes[idx].position = clamped;
    collabService.sendNodeDrag(nodeId, clamped);
    notifyListeners();
  }

  void commitNodeDrag(String nodeId) {
    if (_activeDiagram == null || isReadOnly) return;
    collabService.releaseNodeLock(nodeId);
    _afterDiagramMutation(action: 'move_node');
  }

  void _stampNodeAuthor(UmlNode node, {bool isNew = false}) {
    final me = authService.currentUser;
    if (me == null) return;
    if (isNew || (node.createdByUserId ?? '').isEmpty) {
      node.createdByUserId ??= me.id;
      node.createdByName ??= me.fullName;
    }
    node.lastModifiedByUserId = me.id;
    node.lastModifiedByName = me.fullName;
    node.lastModifiedAt = DateTime.now();
  }

  bool addNode(UmlNode newNode) {
    if (!_guardCanEdit()) return false;
    _pushUndoSnapshot();
    _stampNodeAuthor(newNode, isNew: true);
    _activeDiagram!.nodes.add(newNode);
    _afterDiagramMutation(
      action: 'create_node',
      auditDetail: 'Creó ${newNode.elementType.label} "${newNode.name}"',
    );
    return true;
  }

  bool updateNode(UmlNode updated) {
    if (!_guardCanEdit(nodeId: updated.id)) return false;
    _pushUndoSnapshot();
    final idx = _activeDiagram!.nodes.indexWhere((n) => n.id == updated.id);
    if (idx >= 0) {
      final prev = _activeDiagram!.nodes[idx];
      updated.createdByUserId ??= prev.createdByUserId;
      updated.createdByName ??= prev.createdByName;
      _stampNodeAuthor(updated);
      _activeDiagram!.nodes[idx] = updated;
    } else {
      _stampNodeAuthor(updated, isNew: true);
      _activeDiagram!.nodes.add(updated);
    }
    _afterDiagramMutation(
      action: 'update_node',
      auditDetail: 'Editó "${updated.name}"',
    );
    return true;
  }

  bool deleteNode(String nodeId) {
    if (!_guardCanEdit(nodeId: nodeId)) return false;
    final existing = _activeDiagram!.nodes.where((n) => n.id == nodeId).firstOrNull;
    if (existing == null) return false;
    _pushUndoSnapshot();
    _activeDiagram!.nodes.removeWhere((n) => n.id == nodeId);
    _activeDiagram!.connections.removeWhere(
      (c) => c.sourceNodeId == nodeId || c.targetNodeId == nodeId,
    );
    _afterDiagramMutation(
      action: 'delete_node',
      auditDetail: 'Eliminó "${existing.name}"',
    );
    return true;
  }

  bool addConnection(UmlConnection connection) {
    if (!_guardCanEdit()) return false;
    _pushUndoSnapshot();
    _activeDiagram!.connections.add(connection);
    _afterDiagramMutation(
      action: 'create_connection',
      auditDetail: 'Creó relación ${connection.type.label}',
    );
    return true;
  }

  bool updateConnection(UmlConnection updated) {
    if (!_guardCanEdit()) return false;
    _pushUndoSnapshot();
    final idx = _activeDiagram!.connections.indexWhere((c) => c.id == updated.id);
    if (idx >= 0) {
      _activeDiagram!.connections[idx] = updated;
    }
    _afterDiagramMutation(action: 'update_connection');
    return true;
  }

  bool deleteConnection(String connectionId) {
    if (!_guardCanEdit()) return false;
    _pushUndoSnapshot();
    _activeDiagram!.connections.removeWhere((c) => c.id == connectionId);
    _afterDiagramMutation(
      action: 'delete_connection',
      auditDetail: 'Eliminó una relación UML',
    );
    return true;
  }

  // --- Canal 2: Comandos Atómicos Locales de Voz ---

  Future<VoiceCommandResult> executeAtomicVoiceCommand(String spokenText) async {
    if (!_guardCanEdit()) {
      return VoiceCommandResult(
        success: false,
        speechResponse: _lastError ?? 'No es posible editar en este momento.',
        commandDescription: 'Bloqueado',
      );
    }

    final snapshot = _activeDiagram!.deepCopy();
    final result = UmlVoiceCommander.executeCommand(spokenText, _activeDiagram!);

    if (result.isUndo) {
      undo();
      _voiceDialogue = result.speechResponse;
      ttsService.speak(result.speechResponse);
      return result;
    }

    if (result.success) {
      final prevById = {for (final n in snapshot.nodes) n.id: n};
      final affectedClasses = <String>[];
      for (final node in _activeDiagram!.nodes) {
        final prev = prevById[node.id];
        if (prev == null) {
          _stampNodeAuthor(node, isNew: true);
          affectedClasses.add(node.name);
        } else {
          final attrsBefore = prev.attributes
              .map((a) => '${a.name}:${a.type}:${a.visibility}:${a.isPrimaryKey}')
              .join('|');
          final attrsAfter = node.attributes
              .map((a) => '${a.name}:${a.type}:${a.visibility}:${a.isPrimaryKey}')
              .join('|');
          final methodsBefore = prev.methods
              .map((m) => '${m.name}:${m.returnType}:${m.parameters}')
              .join('|');
          final methodsAfter = node.methods
              .map((m) => '${m.name}:${m.returnType}:${m.parameters}')
              .join('|');
          if (prev.name != node.name ||
              prev.elementType != node.elementType ||
              prev.stereotype != node.stereotype ||
              attrsBefore != attrsAfter ||
              methodsBefore != methodsAfter) {
            node.createdByUserId ??= prev.createdByUserId;
            node.createdByName ??= prev.createdByName;
            _stampNodeAuthor(node);
            affectedClasses.add(node.name);
          }
        }
      }

      _undoStack.add(snapshot);
      if (_undoStack.length > _maxHistory) _undoStack.removeAt(0);
      _redoStack.clear();

      _afterDiagramMutation(action: 'voice_atomic');
      collabService.sendActivityLog(
        result.commandDescription,
        detail: 'Canal atómico móvil',
        category: 'voice',
        affectedClasses: affectedClasses,
      );
    }

    _voiceDialogue = result.speechResponse;
    ttsService.speak(result.speechResponse);
    notifyListeners();
    return result;
  }

  // --- Canal 1: Copiloto Generativo IA y Consultivo Colaborativo (`/api/ai/prompt` y `/api/ai/audio-prompt`) ---

  Future<bool> executeAiPrompt(
    String prompt, {
    bool isAudio = true,
    AiPromptMode? mode,
    List<String>? selectedNodeIds,
    bool? broadcastToRoom,
    bool? createWhiteboardNotes,
  }) async {
    if (_activeDiagram == null) {
      _lastError = 'Abre primero un proyecto y diagrama.';
      notifyListeners();
      return false;
    }
    final clean = prompt.trim();
    if (clean.isEmpty) return false;

    final requestedMode = mode ?? _selectedAiMode;
    if (isReadOnly && requestedMode == AiPromptMode.mutate) {
      return _guardCanEdit() ? false : false;
    }

    final effectiveMode = isReadOnly && requestedMode == AiPromptMode.auto
        ? AiPromptMode.advise
        : requestedMode;
    final effectiveBroadcast = broadcastToRoom ?? _broadcastAiToRoom;
    final effectiveNotes = isReadOnly
        ? false
        : (createWhiteboardNotes ?? _createAiWhiteboardNotes);

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final me = authService.currentUser;
      final result = await aiService.sendPrompt(
        prompt: clean,
        diagramId: _activeDiagram!.id,
        roomCode: collabService.activeRoomCode,
        currentNodes: _activeDiagram!.nodes,
        currentConnections: _activeDiagram!.connections,
        provider: _selectedAiProvider,
        model: _selectedAiModel,
        mode: effectiveMode,
        broadcastToRoom: effectiveBroadcast,
        createWhiteboardNotes: effectiveNotes,
        selectedNodeIds: selectedNodeIds,
        persistChanges: !isReadOnly && !effectiveMode.isConsultative,
        authorUserId: me?.id,
        authorUserName: me?.fullName,
        isAudio: isAudio,
      );

      _latestAiIntentMode = result.intentMode ?? result.action.toUpperCase();
      _latestAiSuggestions = result.suggestions;
      _latestDisciplineAlerts = result.disciplineAlerts;

      if (result.annotationsAdded.isNotEmpty) {
        final byId = {
          for (final a in _activeDiagram!.aiAnnotations) a.id: a,
        };
        for (final added in result.annotationsAdded) {
          byId[added.id] = added;
        }
        _activeDiagram!.aiAnnotations = byId.values.toList();
      }

      if (result.mutatedDiagram && !isReadOnly) {
        _pushUndoSnapshot();
        _activeDiagram!.nodes = result.nodes;
        _activeDiagram!.connections = result.connections;
        _afterDiagramMutation(action: 'ai_prompt');
        collabService.sendActivityLog(
          'Copiloto IA (${result.modelUsed ?? _selectedAiModel})',
          detail: clean,
          category: 'ai',
        );
      } else {
        if (me != null) {
          await storageService.cacheDiagramLocal(me.id, _activeDiagram!);
        }
      }

      _voiceDialogue = result.message.isNotEmpty
          ? result.message
          : result.changesSummary;
      _statusMessage = result.mutatedDiagram
          ? 'IA aplicada (${result.providerUsed ?? _selectedAiProvider}: ${result.modelUsed ?? _selectedAiModel})'
          : 'Copiloto IA (${_latestAiIntentMode ?? effectiveMode.label.toUpperCase()}): ${result.annotationsAdded.length} nota(s) en pizarra';
      ttsService.speak(_voiceDialogue);
      return true;
    } catch (e) {
      _lastError = e.toString();
      _voiceDialogue = 'Error con el asistente IA: $e';
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  // --- Digitalización Vision AI (`/api/ai/vision-diagram`) ---

  Future<bool> executeVisionDigitization({
    required String imageBase64,
    required String mimeType,
    String? prompt,
    String mode = 'auto',
  }) async {
    if (_activeDiagram == null) {
      _lastError = 'Abre primero un proyecto y diagrama.';
      notifyListeners();
      return false;
    }
    if (isReadOnly && mode != 'advise') {
      return _guardCanEdit();
    }

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final result = await aiService.analyzeVisionDiagram(
        imageBase64: imageBase64,
        mimeType: mimeType,
        diagramId: _activeDiagram!.id,
        roomCode: collabService.activeRoomCode,
        prompt: prompt,
        currentNodes: _activeDiagram!.nodes,
        currentConnections: _activeDiagram!.connections,
        provider: _selectedAiProvider,
        model: _selectedAiModel,
        mode: isReadOnly ? 'advise' : mode,
        broadcastToRoom: _broadcastAiToRoom,
        persistChanges: !isReadOnly && mode != 'advise',
      );

      _latestAiIntentMode = result.intentMode ?? result.action.toUpperCase();
      _latestAiSuggestions = result.suggestions;
      _latestDisciplineAlerts = result.disciplineAlerts;

      if (result.annotationsAdded.isNotEmpty) {
        final byId = {
          for (final a in _activeDiagram!.aiAnnotations) a.id: a,
        };
        for (final added in result.annotationsAdded) {
          byId[added.id] = added;
        }
        _activeDiagram!.aiAnnotations = byId.values.toList();
      }

      if (result.mutatedDiagram && !isReadOnly) {
        _pushUndoSnapshot();
        _activeDiagram!.nodes = result.nodes;
        _activeDiagram!.connections = result.connections;
        _afterDiagramMutation(action: 'vision_ai');
        collabService.sendActivityLog(
          'Digitalizó pizarra/foto con Vision AI (${result.modelUsed ?? ""})',
          detail: result.changesSummary,
          category: 'ai',
        );
      }

      _voiceDialogue = result.message.isNotEmpty
          ? result.message
          : 'Diagrama digitalizado desde imagen.';
      _statusMessage = result.mutatedDiagram
          ? 'Vision AI aplicada (${result.providerUsed ?? "auto"}: ${result.modelUsed ?? ""}).'
          : 'Análisis visual completado sin modificar el lienzo.';
      ttsService.speak(_voiceDialogue);
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  // --- Generación de Código (`Spring Boot` / `Flutter`) y XMI 2.1 ---

  Future<CodegenPreviewResult?> previewGeneratedCode({
    String platform = 'all',
  }) async {
    if (_activeProject == null || _activeDiagram == null) return null;
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      if (_hasUnsavedChanges && !isReadOnly) {
        await saveCurrentDiagram();
      }
      return await codegenService.previewCode(
        diagramId: _activeDiagram!.id,
        project: _activeProject!,
        platform: platform,
      );
    } catch (e) {
      _lastError = e.toString();
      return null;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<List<int>?> downloadCodeZip({String platform = 'all'}) async {
    if (_activeProject == null || _activeDiagram == null) return null;
    if (!canDownloadCode) {
      _lastError =
          'No tienes permiso para descargar código fuente (canDownloadCode = false).';
      notifyListeners();
      return null;
    }

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      if (_hasUnsavedChanges && !isReadOnly) {
        await saveCurrentDiagram();
      }
      final bytes = await codegenService.downloadZip(
        diagramId: _activeDiagram!.id,
        project: _activeProject!,
        platform: platform,
      );
      collabService.sendActivityLog(
        'Descargó paquete ZIP ($platform)',
        category: 'uml',
      );
      return bytes;
    } catch (e) {
      _lastError = e.toString();
      return null;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<String?> exportCurrentDiagramXmi() async {
    if (_activeDiagram == null) return null;
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      if (_hasUnsavedChanges && !isReadOnly) {
        await saveCurrentDiagram();
      }
      final xml = await xmiService.exportDiagramXml(_activeDiagram!.id);
      collabService.sendActivityLog('Exportó diagrama a XMI 2.1', category: 'uml');
      return xml;
    } catch (e) {
      _lastError = e.toString();
      return null;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> importXmiContent(String xmiContent) async {
    if (!_guardCanEdit()) return false;
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final imported = await xmiService.importXmi(
        xmiContent: xmiContent,
        diagramId: _activeDiagram!.id,
        projectId: _activeProject?.id,
        diagramName: _activeDiagram!.name,
      );
      _pushUndoSnapshot();
      _activeDiagram!.nodes = imported.nodes;
      _activeDiagram!.connections = imported.connections;
      _hasUnsavedChanges = false;
      collabService.sendDiagramSync(_activeDiagram!, action: 'xmi_import');
      collabService.sendActivityLog(
        'Importó arquitectura XMI 2.1',
        detail: '${imported.visibleNodes.length} nodos importados',
        category: 'uml',
      );
      _statusMessage = 'XMI importado (${imported.visibleNodes.length} nodos).';
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  // --- Miembros & Permisos en Vivo ---

  Future<void> refreshActiveProjectMembers() async {
    if (_activeProject == null) return;
    try {
      final members = await storageService.fetchMembers(_activeProject!.id);
      _activeProject!.members = members;
      _activeProject!.memberCount = members.length;

      final me = authService.currentUser;
      if (me != null) {
        final mine = members.where((m) => m.userId == me.id).firstOrNull;
        if (mine != null) {
          _activeProject!.userRole = mine.role;
          _activeProject!.userCanDownloadCode = mine.canDownloadCode;
        }
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> inviteMember({
    required String email,
    String role = 'EDITOR',
    bool? canDownloadCode,
  }) async {
    if (_activeProject == null) return false;
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      final added = await storageService.inviteMember(
        projectId: _activeProject!.id,
        email: email,
        role: role,
        canDownloadCode: canDownloadCode,
      );
      await refreshActiveProjectMembers();
      collabService.sendActivityLog(
        'Invitó a ${added.fullName} ($role)',
        category: 'permission',
      );
      _statusMessage = 'Miembro ${added.email} agregado.';
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> updateMemberPermissions({
    required String targetUserId,
    String? role,
    bool? canDownloadCode,
  }) async {
    if (_activeProject == null) return false;
    _lastError = null;

    try {
      final updated = await storageService.updateMemberPermissions(
        projectId: _activeProject!.id,
        targetUserId: targetUserId,
        role: role,
        canDownloadCode: canDownloadCode,
      );
      await refreshActiveProjectMembers();
      collabService.sendActivityLog(
        'Actualizó permisos de ${updated.fullName}',
        detail: '${updated.role} • ZIP=${updated.canDownloadCode}',
        category: 'permission',
      );
      return true;
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> removeMember(String targetUserId) async {
    if (_activeProject == null) return false;
    _lastError = null;

    try {
      await storageService.removeMember(
        projectId: _activeProject!.id,
        targetUserId: targetUserId,
      );
      await refreshActiveProjectMembers();
      return true;
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      return false;
    }
  }

  // --- Continuidad Multi-Sesión, Notificaciones, Checkpoints, Notas IA & Ollama/Colab ---

  Future<void> refreshResumeBundle() async {
    final diag = _activeDiagram;
    if (diag == null) return;
    try {
      final bundle = await storageService.fetchResumeBundle(diag.id);
      if (_activeDiagram?.id != diag.id) return;
      _resumeBundle = bundle;
      _snapshots = bundle.snapshots;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> refreshNotifications({bool unreadOnly = false}) async {
    final diag = _activeDiagram;
    try {
      final items = await storageService.fetchNotifications(
        diagramId: diag?.id,
        unreadOnly: unreadOnly,
      );
      collabService.setNotifications(items);
    } catch (_) {}
  }

  Future<void> markNotificationRead(String notificationId) async {
    collabService.markNotificationReadLocally(notificationId);
    try {
      await storageService.markNotificationRead(notificationId);
    } catch (_) {}
  }

  Future<void> markAllNotificationsRead() async {
    final diag = _activeDiagram;
    if (diag == null) return;
    collabService.markAllNotificationsReadLocally();
    try {
      await storageService.markAllNotificationsRead(diag.id);
    } catch (_) {}
  }

  Future<bool> createSnapshot({String? label}) async {
    final diag = _activeDiagram;
    if (diag == null) return false;
    if (isReadOnly) {
      _lastError = 'No puedes crear checkpoints en modo solo lectura.';
      notifyListeners();
      return false;
    }

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      if (_hasUnsavedChanges) {
        await saveCurrentDiagram();
      }
      final snap = await storageService.createSnapshot(diag.id, label: label);
      _snapshots = [snap, ..._snapshots];
      _statusMessage = '📸 Checkpoint guardado: "${snap.label}"';
      collabService.sendActivityLog(
        'Creó checkpoint "${snap.label}"',
        category: 'uml',
      );
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> restoreSnapshot(String snapshotId) async {
    final diag = _activeDiagram;
    if (diag == null) return false;
    if (isReadOnly) {
      _lastError = 'No puedes restaurar checkpoints en modo solo lectura.';
      notifyListeners();
      return false;
    }

    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      _pushUndoSnapshot();
      final restored = await storageService.restoreSnapshot(diag.id, snapshotId);
      _activeDiagram = restored;
      _hasUnsavedChanges = false;
      final user = authService.currentUser;
      if (user != null) {
        await storageService.cacheDiagramLocal(user.id, restored);
      }
      collabService.sendDiagramSync(restored, action: 'snapshot_restore');
      collabService.sendActivityLog('Restauró un checkpoint anterior', category: 'uml');
      _statusMessage = '🕰️ Checkpoint restaurado en el lienzo.';
      await refreshResumeBundle();
      return true;
    } catch (e) {
      _lastError = e.toString();
      return false;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<bool> updateAnnotationStatus(
    String annotationId,
    String status,
  ) async {
    final diag = _activeDiagram;
    if (diag == null) return false;
    if (isReadOnly) {
      _lastError = 'Modo solo lectura: no puedes resolver anotaciones de equipo.';
      notifyListeners();
      return false;
    }

    try {
      final updated = await storageService.updateAnnotationStatus(
        diagramId: diag.id,
        annotationId: annotationId,
        status: status,
      );
      _activeDiagram!.aiAnnotations = updated.aiAnnotations;
      notifyListeners();
      return true;
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> applyWhiteboardAnnotation(AiAnnotationItem annotation) async {
    if (isReadOnly) {
      _lastError = 'Modo solo lectura: solicita a un EDITOR/OWNER aplicar la idea.';
      notifyListeners();
      return false;
    }

    final promptText = annotation.suggestedPrompt;
    var ok = true;
    if (promptText != null && promptText.trim().isNotEmpty) {
      ok = await executeAiPrompt(
        promptText,
        isAudio: false,
        mode: AiPromptMode.mutate,
        selectedNodeIds: annotation.targetNodeId != null
            ? [annotation.targetNodeId!]
            : null,
      );
    }
    if (ok) {
      await updateAnnotationStatus(annotation.id, 'applied');
    }
    return ok;
  }

  Future<bool> transferHostToMember(String targetUserId) async {
    final sess = collabService.sessionMeta;
    if (sess == null || sess.id.isEmpty) {
      _lastError = 'No hay sesión colaborativa activa para transferir anfitrión.';
      notifyListeners();
      return false;
    }
    try {
      final res = await storageService.transferHost(
        sessionId: sess.id,
        targetUserId: targetUserId,
      );
      final newHostId = res['newHostUserId']?.toString() ?? targetUserId;
      final newHostName = res['newHostUserName']?.toString();
      collabService.updateSessionHostLocally(newHostId, newHostName);
      _statusMessage = '👑 Anfitrión transferido a ${newHostName ?? "colaborador"}';
      notifyListeners();
      return true;
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<OllamaRuntimeConfig?> loadOllamaConfig() async {
    try {
      _ollamaConfig = await aiService.fetchOllamaConfig();
      notifyListeners();
      return _ollamaConfig;
    } catch (e) {
      _lastError = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<OllamaRuntimeConfig?> updateOllamaConfig({
    String? baseUrl,
    String? model,
    String? visionModel,
    bool resetToEnv = false,
  }) async {
    _isBusy = true;
    _lastError = null;
    notifyListeners();

    try {
      _ollamaConfig = await aiService.updateOllamaConfig(
        baseUrl: baseUrl,
        model: model,
        visionModel: visionModel,
        resetToEnv: resetToEnv,
      );
      await loadAiModels();
      _statusMessage = '🦙 Runtime Ollama/Colab actualizado en caliente.';
      return _ollamaConfig;
    } catch (e) {
      _lastError = e.toString();
      return null;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }

  Future<OllamaConnectionTestResult?> testOllamaConnection({String? baseUrl}) async {
    try {
      return await aiService.testOllamaConnection(baseUrl: baseUrl);
    } catch (e) {
      return OllamaConnectionTestResult(
        ok: false,
        baseUrl: baseUrl ?? '',
        error: e.toString(),
      );
    }
  }

  List<UmlAuditIssue> auditActiveDiagram() {
    if (_activeDiagram == null) return const [];
    return UmlAuditHelper.auditDiagram(_activeDiagram!);
  }

  @override
  void dispose() {
    _dragSub?.cancel();
    _syncSub?.cancel();
    _lockRejectSub?.cancel();
    _permSub?.cancel();
    _hostTransferSub?.cancel();
    _aiAnnotsSub?.cancel();
    _notificationSub?.cancel();
    collabService.removeListener(_onCollabChanged);
    authService.removeListener(_onAuthServiceChanged);
    super.dispose();
  }
}
