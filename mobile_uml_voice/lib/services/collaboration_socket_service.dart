import 'dart:async';
import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;
import '../models/auth_models.dart';
import '../models/uml_models.dart';

class RemoteNodeDragEvent {
  final String nodeId;
  final Offset position;
  final String userId;

  const RemoteNodeDragEvent({
    required this.nodeId,
    required this.position,
    required this.userId,
  });
}

class RemoteDiagramSyncEvent {
  final List<UmlNode> nodes;
  final List<UmlConnection> connections;
  final String userId;
  final String action;

  const RemoteDiagramSyncEvent({
    required this.nodes,
    required this.connections,
    required this.userId,
    required this.action,
  });
}

class NodeLockRejectedEvent {
  final String nodeId;
  final CollabNodeLock lockedBy;

  const NodeLockRejectedEvent({
    required this.nodeId,
    required this.lockedBy,
  });
}

class ProjectPermissionsEvent {
  final String projectId;
  final String userId;
  final String? role;
  final bool? canDownloadCode;
  final bool removed;

  const ProjectPermissionsEvent({
    required this.projectId,
    required this.userId,
    this.role,
    this.canDownloadCode,
    this.removed = false,
  });
}

/// Cliente Socket.IO en tiempo real conectado al namespace `/collaboration`.
/// Implementa el protocolo completo del servidor NestJS: salas, bloqueos mutuos,
/// arrastre en vivo, sincronización AST, chat, bitácora y cambios de rol en vivo.
class CollaborationSocketService extends ChangeNotifier {
  static const int _maxHistory = 100;

  sio.Socket? _socket;
  String? _connectedSocketUrl;
  AppUser? _currentUser;

  bool _isConnected = false;
  String? _activeRoomCode;
  String? _currentDiagramId;
  String _myColor = '#3B82F6';
  bool _isChatVisible = false;
  int _unreadChatCount = 0;

  List<CollabParticipant> _participants = [];
  final Map<String, CollabNodeLock> _activeLocks = {};
  List<CollabChatMessage> _chatMessages = [];
  List<CollabActivityLog> _activityLogs = [];

  final _remoteDragCtrl = StreamController<RemoteNodeDragEvent>.broadcast();
  final _remoteSyncCtrl = StreamController<RemoteDiagramSyncEvent>.broadcast();
  final _lockRejectedCtrl = StreamController<NodeLockRejectedEvent>.broadcast();
  final _permissionsCtrl = StreamController<ProjectPermissionsEvent>.broadcast();

  bool get isConnected => _isConnected;
  String? get activeRoomCode => _activeRoomCode;
  String? get currentDiagramId => _currentDiagramId;
  String get myColor => _myColor;
  bool get isChatVisible => _isChatVisible;
  int get unreadChatCount => _unreadChatCount;
  List<CollabParticipant> get participants => List.unmodifiable(_participants);
  Map<String, CollabNodeLock> get activeLocks => Map.unmodifiable(_activeLocks);
  List<CollabChatMessage> get chatMessages => List.unmodifiable(_chatMessages);
  List<CollabActivityLog> get activityLogs => List.unmodifiable(_activityLogs);

  Stream<RemoteNodeDragEvent> get onRemoteNodeDrag => _remoteDragCtrl.stream;
  Stream<RemoteDiagramSyncEvent> get onRemoteDiagramSync => _remoteSyncCtrl.stream;
  Stream<NodeLockRejectedEvent> get onNodeLockRejected => _lockRejectedCtrl.stream;
  Stream<ProjectPermissionsEvent> get onProjectPermissionsUpdated => _permissionsCtrl.stream;

  void _ensureConnected(String socketUrl) {
    if (_socket != null && _connectedSocketUrl == socketUrl) {
      if (!_socket!.connected) {
        _socket!.connect();
      }
      return;
    }

    if (_socket != null) {
      _socket!.dispose();
      _socket = null;
    }

    _connectedSocketUrl = socketUrl;

    final socket = sio.io(
      socketUrl,
      sio.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1200)
          .build(),
    );

    socket.on('connect', (_) {
      _isConnected = true;
      notifyListeners();
      if (_currentDiagramId != null && _currentUser != null) {
        _emitJoinRoom(_currentDiagramId!);
      }
    });

    socket.on('disconnect', (_) {
      _isConnected = false;
      _activeLocks.clear();
      notifyListeners();
    });

    socket.on('connect_error', (_) {
      _isConnected = false;
      notifyListeners();
    });

    socket.on('room_participants_updated', (dynamic raw) {
      if (raw is! Map) return;
      final data = Map<String, dynamic>.from(raw);
      if (data['roomCode'] != null) {
        _activeRoomCode = data['roomCode'].toString();
      }
      final rawParticipants = data['participants'];
      if (rawParticipants is List) {
        _participants = rawParticipants
            .map((p) => CollabParticipant.fromJson(Map<String, dynamic>.from(p as Map)))
            .toList();
      }
      notifyListeners();
    });

    socket.on('user_joined', (dynamic raw) {
      if (raw is! Map) return;
      final p = CollabParticipant.fromJson(Map<String, dynamic>.from(raw));
      if (p.userId.isEmpty) return;
      if (!_participants.any((item) => item.userId == p.userId)) {
        _participants = [..._participants, p];
        notifyListeners();
      }
    });

    socket.on('user_left', (dynamic raw) {
      if (raw is! Map) return;
      final userId = (raw['userId'] ?? '').toString();
      if (userId.isEmpty) return;
      _participants = _participants.where((p) => p.userId != userId).toList();
      _activeLocks.removeWhere((_, lock) => lock.userId == userId);
      notifyListeners();
    });

    socket.on('node_locked', (dynamic raw) {
      if (raw is! Map) return;
      final lock = CollabNodeLock.fromJson(Map<String, dynamic>.from(raw));
      if (lock.nodeId.isEmpty) return;
      _activeLocks[lock.nodeId] = lock;
      notifyListeners();
    });

    socket.on('node_lock_rejected', (dynamic raw) {
      if (raw is! Map) return;
      final map = Map<String, dynamic>.from(raw);
      final nodeId = (map['nodeId'] ?? '').toString();
      final lockedByRaw = map['lockedBy'];
      if (nodeId.isEmpty || lockedByRaw is! Map) return;
      final lock = CollabNodeLock.fromJson({
        'nodeId': nodeId,
        ...Map<String, dynamic>.from(lockedByRaw),
      });
      _activeLocks[nodeId] = lock;
      _lockRejectedCtrl.add(NodeLockRejectedEvent(nodeId: nodeId, lockedBy: lock));
      notifyListeners();
    });

    socket.on('node_unlocked', (dynamic raw) {
      if (raw is! Map) return;
      final nodeId = (raw['nodeId'] ?? '').toString();
      if (nodeId.isEmpty) return;
      _activeLocks.remove(nodeId);
      notifyListeners();
    });

    socket.on('node_dragged', (dynamic raw) {
      if (raw is! Map) return;
      final map = Map<String, dynamic>.from(raw);
      final senderId = (map['userId'] ?? '').toString();
      if (senderId == _currentUser?.id) return;
      final nodeId = (map['nodeId'] ?? '').toString();
      final pos = map['position'];
      if (nodeId.isEmpty || pos is! Map) return;
      final x = (pos['x'] is num) ? (pos['x'] as num).toDouble() : 0.0;
      final y = (pos['y'] is num) ? (pos['y'] as num).toDouble() : 0.0;
      _remoteDragCtrl.add(
        RemoteNodeDragEvent(
          nodeId: nodeId,
          position: Offset(x, y),
          userId: senderId,
        ),
      );
    });

    socket.on('diagram_synced', (dynamic raw) {
      if (raw is! Map) return;
      final map = Map<String, dynamic>.from(raw);
      final senderId = (map['userId'] ?? '').toString();
      if (senderId == _currentUser?.id) return;

      final rawNodes = (map['nodes'] as List?) ?? const [];
      final rawConns = (map['connections'] as List?) ?? const [];
      final nodes = rawNodes
          .map((n) => UmlNode.fromJson(Map<String, dynamic>.from(n as Map)))
          .toList();
      final connections = rawConns
          .map((c) => UmlConnection.fromJson(Map<String, dynamic>.from(c as Map)))
          .toList();

      _remoteSyncCtrl.add(
        RemoteDiagramSyncEvent(
          nodes: nodes,
          connections: connections,
          userId: senderId,
          action: (map['action'] ?? 'update').toString(),
        ),
      );
    });

    socket.on('chat_message_received', (dynamic raw) {
      if (raw is! Map) return;
      final msg = CollabChatMessage.fromJson(Map<String, dynamic>.from(raw));
      if (msg.message.trim().isEmpty) return;
      if (_chatMessages.any((m) => m.id == msg.id)) return;

      final next = [..._chatMessages, msg];
      _chatMessages = next.length > _maxHistory
          ? next.sublist(next.length - _maxHistory)
          : next;

      if (!_isChatVisible && msg.userId != _currentUser?.id) {
        _unreadChatCount++;
      }
      notifyListeners();
    });

    socket.on('activity_logged', (dynamic raw) {
      if (raw is! Map) return;
      final entry = CollabActivityLog.fromJson(Map<String, dynamic>.from(raw));
      if (entry.action.trim().isEmpty) return;
      if (_activityLogs.any((a) => a.id == entry.id)) return;

      final next = [..._activityLogs, entry];
      _activityLogs = next.length > _maxHistory
          ? next.sublist(next.length - _maxHistory)
          : next;
      notifyListeners();
    });

    socket.on('project_permissions_updated', (dynamic raw) {
      if (raw is! Map) return;
      final map = Map<String, dynamic>.from(raw);
      final projectId = (map['projectId'] ?? '').toString();
      final userId = (map['userId'] ?? '').toString();
      if (projectId.isEmpty || userId.isEmpty) return;

      _permissionsCtrl.add(
        ProjectPermissionsEvent(
          projectId: projectId,
          userId: userId,
          role: map['role']?.toString().toUpperCase(),
          canDownloadCode: map['canDownloadCode'] is bool
              ? map['canDownloadCode'] as bool
              : null,
          removed: map['removed'] == true,
        ),
      );
    });

    _socket = socket;
    socket.connect();
  }

  void joinRoom({
    required String socketUrl,
    required String diagramId,
    required AppUser user,
    String? customRoomCode,
  }) {
    final switchingDiagram =
        _currentDiagramId != null && _currentDiagramId != diagramId;
    if (switchingDiagram) {
      if (_socket != null && _isConnected) {
        _socket!.emit('leave_room', {
          'diagramId': _currentDiagramId,
          'roomCode': _activeRoomCode,
          'userId': _currentUser?.id ?? user.id,
        });
      }
      _chatMessages = [];
      _activityLogs = [];
      _unreadChatCount = 0;
      _activeLocks.clear();
      _participants = [];
      _activeRoomCode = null;
    }

    _currentUser = user;
    _myColor = user.color;
    _currentDiagramId = diagramId;

    _ensureConnected(socketUrl);
    if (_socket != null && _socket!.connected) {
      _emitJoinRoom(diagramId, customRoomCode: customRoomCode);
    }
    notifyListeners();
  }

  void _emitJoinRoom(String diagramId, {String? customRoomCode}) {
    final user = _currentUser;
    if (_socket == null || user == null) return;

    _socket!.emitWithAck(
      'join_room',
      {
        'diagramId': diagramId,
        if (customRoomCode != null && customRoomCode.isNotEmpty)
          'roomCode': customRoomCode,
        'userId': user.id,
        'userName': user.fullName,
        'color': _myColor,
      },
      ack: ([dynamic res]) {
        if (res is! Map) return;
        final map = Map<String, dynamic>.from(res);
        if (map['success'] != true) return;

        final session = map['session'];
        if (session is Map && session['roomCode'] != null) {
          _activeRoomCode = session['roomCode'].toString();
        }

        final rawParticipants = map['participants'];
        if (rawParticipants is List) {
          _participants = rawParticipants
              .map((p) => CollabParticipant.fromJson(Map<String, dynamic>.from(p as Map)))
              .toList();
        }

        final rawLocks = map['activeLocks'];
        if (rawLocks is List) {
          _activeLocks.clear();
          for (final rawLock in rawLocks) {
            final lock = CollabNodeLock.fromJson(Map<String, dynamic>.from(rawLock as Map));
            if (lock.nodeId.isNotEmpty) {
              _activeLocks[lock.nodeId] = lock;
            }
          }
        }

        final rawChats = map['recentChatMessages'];
        if (rawChats is List) {
          _chatMessages = rawChats
              .map((m) => CollabChatMessage.fromJson(Map<String, dynamic>.from(m as Map)))
              .toList();
        }

        final rawActs = map['recentActivityLogs'];
        if (rawActs is List) {
          _activityLogs = rawActs
              .map((a) => CollabActivityLog.fromJson(Map<String, dynamic>.from(a as Map)))
              .toList();
        }

        notifyListeners();
      },
    );
  }

  void leaveRoom() {
    if (_socket != null && _currentUser != null && _currentDiagramId != null) {
      _socket!.emit('leave_room', {
        'diagramId': _currentDiagramId,
        'roomCode': _activeRoomCode,
        'userId': _currentUser!.id,
      });
    }
    _activeRoomCode = null;
    _currentDiagramId = null;
    _participants = [];
    _activeLocks.clear();
    _chatMessages = [];
    _activityLogs = [];
    _unreadChatCount = 0;
    notifyListeners();
  }

  void disconnect() {
    leaveRoom();
    if (_socket != null) {
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
    }
    _connectedSocketUrl = null;
    _isConnected = false;
    notifyListeners();
  }

  void requestNodeLock(String nodeId) {
    final user = _currentUser;
    if (user == null || _currentDiagramId == null) return;

    _activeLocks[nodeId] = CollabNodeLock(
      nodeId: nodeId,
      userId: user.id,
      userName: user.fullName,
      color: _myColor,
    );
    notifyListeners();

    if (_socket != null && _isConnected) {
      _socket!.emit('lock_node', {
        'diagramId': _currentDiagramId,
        'roomCode': _activeRoomCode,
        'nodeId': nodeId,
        'userId': user.id,
        'userName': user.fullName,
        'color': _myColor,
      });
    }
  }

  void releaseNodeLock(String nodeId) {
    final user = _currentUser;
    _activeLocks.remove(nodeId);
    notifyListeners();

    if (_socket != null &&
        _isConnected &&
        _currentDiagramId != null &&
        user != null) {
      _socket!.emit('unlock_node', {
        'diagramId': _currentDiagramId,
        'roomCode': _activeRoomCode,
        'nodeId': nodeId,
        'userId': user.id,
      });
    }
  }

  void sendNodeDrag(String nodeId, Offset position) {
    final user = _currentUser;
    if (_socket == null ||
        !_isConnected ||
        _currentDiagramId == null ||
        user == null) {
      return;
    }

    _socket!.emit('node_drag', {
      'diagramId': _currentDiagramId,
      'roomCode': _activeRoomCode,
      'nodeId': nodeId,
      'position': {'x': position.dx, 'y': position.dy},
      'userId': user.id,
    });
  }

  void sendDiagramSync(UmlDiagram diagram, {String action = 'update'}) {
    final user = _currentUser;
    if (_socket == null ||
        !_isConnected ||
        _currentDiagramId == null ||
        user == null) {
      return;
    }

    _socket!.emit('diagram_sync', {
      'diagramId': _currentDiagramId,
      'roomCode': _activeRoomCode,
      'nodes': diagram.nodes.map((n) => n.toCollaborativeJson()).toList(),
      'connections': diagram.connections.map((c) => c.toSaveAstJson()).toList(),
      'userId': user.id,
      'action': action,
    });
  }

  void setChatVisible(bool visible) {
    _isChatVisible = visible;
    if (visible) {
      _unreadChatCount = 0;
    }
    notifyListeners();
  }

  void sendChatMessage(String message) {
    final clean = message.trim();
    final user = _currentUser;
    if (clean.isEmpty || user == null) return;

    if (_socket == null || !_isConnected || _currentDiagramId == null) {
      final local = CollabChatMessage(
        id: 'local_chat_${DateTime.now().millisecondsSinceEpoch}',
        userId: user.id,
        userName: user.fullName,
        message: clean,
        color: _myColor,
      );
      _chatMessages = [..._chatMessages, local];
      notifyListeners();
      return;
    }

    _socket!.emit('chat_message', {
      'diagramId': _currentDiagramId,
      'roomCode': _activeRoomCode,
      'userId': user.id,
      'userName': user.fullName,
      'message': clean,
      'color': _myColor,
    });
  }

  void sendActivityLog(
    String action, {
    String? detail,
    String category = 'uml',
  }) {
    final clean = action.trim();
    final user = _currentUser;
    if (clean.isEmpty || user == null) return;

    if (_socket == null || !_isConnected || _currentDiagramId == null) {
      final local = CollabActivityLog(
        id: 'local_act_${DateTime.now().millisecondsSinceEpoch}',
        userId: user.id,
        userName: user.fullName,
        action: clean,
        detail: detail,
        category: category,
        color: _myColor,
      );
      _activityLogs = [..._activityLogs, local];
      notifyListeners();
      return;
    }

    _socket!.emit('activity_log', {
      'diagramId': _currentDiagramId,
      'roomCode': _activeRoomCode,
      'userId': user.id,
      'userName': user.fullName,
      'action': clean,
      if (detail != null && detail.isNotEmpty) 'detail': detail,
      'category': category,
      'color': _myColor,
    });
  }

  @override
  void dispose() {
    disconnect();
    _remoteDragCtrl.close();
    _remoteSyncCtrl.close();
    _lockRejectedCtrl.close();
    _permissionsCtrl.close();
    super.dispose();
  }
}

