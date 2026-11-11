import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/project_provider.dart';
import '../services/download_helper.dart';
import '../services/file_picker_helper.dart';
import '../widgets/class_editor_sheet.dart';
import '../widgets/codegen_preview_sheet.dart';
import '../widgets/relation_editor_dialog.dart';
import '../widgets/relation_painter.dart';
import '../widgets/team_collab_sheet.dart';
import '../widgets/uml_node_box.dart';
import '../widgets/vision_scanner_sheet.dart';
import '../widgets/voice_dock_sheet.dart';

class CanvasScreen extends StatefulWidget {
  const CanvasScreen({super.key});

  @override
  State<CanvasScreen> createState() => _CanvasScreenState();
}

class _CanvasScreenState extends State<CanvasScreen> {
  final TransformationController _transformCtrl = TransformationController();
  String? _selectedNodeId;
  DateTime _lastDragEmit = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void dispose() {
    _transformCtrl.dispose();
    super.dispose();
  }

  Future<void> _showDiagramPicker(ProjectProvider provider) async {
    final diagrams = provider.activeProjectDiagrams;
    final ctrl = TextEditingController();

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 18,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Diagramas del Proyecto',
              style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 16),
            ),
            const SizedBox(height: 10),
            ...diagrams.map((d) {
              final active = d.id == provider.activeDiagram?.id;
              return ListTile(
                leading: Icon(
                  Icons.schema_outlined,
                  color: active ? const Color(0xFF38BDF8) : Colors.white54,
                ),
                title: Text(d.name,
                    style: const TextStyle(color: Colors.white)),
                trailing: active
                    ? const Icon(Icons.check_circle, color: Color(0xFF38BDF8))
                    : null,
                onTap: () {
                  Navigator.pop(ctx);
                  provider.openDiagram(d);
                },
              );
            }),
            if (!provider.isReadOnly) ...[
              const Divider(color: Color(0xFF334155)),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: ctrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        hintText: 'Nuevo diagrama...',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () {
                      final name = ctrl.text.trim();
                      if (name.isEmpty) return;
                      Navigator.pop(ctx);
                      provider.createDiagram(name);
                    },
                    child: const Text('Crear'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _exportXmi(ProjectProvider provider) async {
    final xml = await provider.exportCurrentDiagramXmi();
    if (!mounted) return;
    if (xml == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.lastError ?? 'No se pudo exportar XMI'),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    final safeName = (provider.activeDiagram?.name ?? 'diagrama')
        .replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')
        .toLowerCase();
    final saved = await saveOrDownloadBytes(
      '$safeName.xmi',
      xml.codeUnits,
      mimeType: 'application/xml',
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('📄 XMI 2.1 exportado: $saved'),
        backgroundColor: const Color(0xFF047857),
      ),
    );
  }

  Future<void> _importXmi(ProjectProvider provider) async {
    final content = await FilePickerHelper.pickXmiContent();
    if (content == null || !mounted) return;
    final ok = await provider.importXmiContent(content);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok
            ? (provider.statusMessage ?? 'XMI importado')
            : (provider.lastError ?? 'Error importando XMI')),
        backgroundColor: ok ? const Color(0xFF047857) : Colors.redAccent,
      ),
    );
  }

  void _showAuditDialog(ProjectProvider provider) {
    final issues = provider.auditActiveDiagram();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Auditoría UML / JPA',
            style: TextStyle(color: Colors.white)),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: issues.length,
            itemBuilder: (_, i) {
              final issue = issues[i];
              final icon = issue.severity == 'error'
                  ? Icons.error_outline
                  : issue.severity == 'warning'
                      ? Icons.warning_amber_rounded
                      : Icons.check_circle_outline;
              final color = issue.severity == 'error'
                  ? Colors.redAccent
                  : issue.severity == 'warning'
                      ? const Color(0xFFFBBF24)
                      : const Color(0xFF10B981);
              return ListTile(
                leading: Icon(icon, color: color),
                title: Text(issue.title,
                    style: const TextStyle(color: Colors.white, fontSize: 13)),
                subtitle: Text(issue.detail,
                    style: const TextStyle(color: Colors.white60, fontSize: 11.5)),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProjectProvider>();
    final collab = provider.collabService;
    final diagram = provider.activeDiagram;
    final project = provider.activeProject;

    if (diagram == null || project == null) {
      return const Scaffold(
        backgroundColor: Color(0xFF090D16),
        body: Center(
          child: Text(
            'Selecciona o crea un proyecto en el Dashboard\npara visualizar su lienzo UML colaborativo.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60),
          ),
        ),
      );
    }

    final visibleNodes = diagram.visibleNodes;

    return Scaffold(
      backgroundColor: const Color(0xFF090D16),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        titleSpacing: 8,
        title: InkWell(
          onTap: () => _showDiagramPicker(provider),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      diagram.name,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.arrow_drop_down, size: 18),
                ],
              ),
              Text(
                '${project.name} • ${project.userRole ?? "OWNER"}',
                style: const TextStyle(fontSize: 11, color: Colors.white60),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        actions: [
          // Chip de sala WebSocket en vivo + unread chat
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Badge(
              isLabelVisible: collab.unreadChatCount > 0,
              label: Text('${collab.unreadChatCount}'),
              child: ActionChip(
                backgroundColor: collab.isConnected
                    ? const Color(0xFF064E3B)
                    : const Color(0xFF1E293B),
                avatar: Icon(
                  collab.isConnected ? Icons.wifi_tethering : Icons.wifi_off,
                  size: 15,
                  color: collab.isConnected
                      ? const Color(0xFF34D399)
                      : Colors.amber,
                ),
                label: Text(
                  '${collab.activeRoomCode ?? "WS"} (${collab.participants.length})',
                  style: const TextStyle(fontSize: 11, color: Colors.white),
                ),
                onPressed: () => showTeamCollabSheet(context, provider),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Deshacer',
            onPressed: provider.canUndo ? provider.undo : null,
            icon: const Icon(Icons.undo, size: 20),
          ),
          IconButton(
            tooltip: 'Rehacer',
            onPressed: provider.canRedo ? provider.redo : null,
            icon: const Icon(Icons.redo, size: 20),
          ),
          IconButton(
            tooltip: provider.isReadOnly
                ? 'Modo solo lectura'
                : 'Guardar en servidor PostgreSQL',
            onPressed: provider.isReadOnly || provider.isBusy
                ? null
                : () => provider.saveCurrentDiagram(),
            icon: Icon(
              provider.hasUnsavedChanges
                  ? Icons.cloud_upload
                  : Icons.cloud_done_outlined,
              color: provider.hasUnsavedChanges
                  ? const Color(0xFFFBBF24)
                  : const Color(0xFF10B981),
            ),
          ),
        ],
      ),
      floatingActionButton: provider.isReadOnly
          ? null
          : FloatingActionButton(
              backgroundColor: const Color(0xFF38BDF8),
              foregroundColor: const Color(0xFF090D16),
              tooltip: 'Voice Dock Atómico',
              onPressed: () => showVoiceDockSheet(context, provider),
              child: const Icon(Icons.mic_rounded),
            ),
      bottomNavigationBar: Container(
        color: const Color(0xFF0F172A),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              if (!provider.isReadOnly) ...[
                _ToolButton(
                  icon: Icons.add_box_outlined,
                  label: '+ Elemento',
                  onTap: () => showClassEditorSheet(context, provider),
                ),
                _ToolButton(
                  icon: Icons.share_outlined,
                  label: 'Conectar',
                  onTap: () => showRelationEditorDialog(context, provider),
                ),
                _ToolButton(
                  icon: Icons.camera_alt_outlined,
                  label: 'Vision AI',
                  onTap: () => showVisionScannerSheet(context, provider),
                ),
              ],
              _ToolButton(
                icon: Icons.code_rounded,
                label: 'Código / ZIP',
                onTap: () => showCodegenPreviewSheet(context, provider),
              ),
              _ToolButton(
                icon: Icons.fact_check_outlined,
                label: 'Auditar',
                onTap: () => _showAuditDialog(provider),
              ),
              PopupMenuButton<String>(
                color: const Color(0xFF1E293B),
                onSelected: (val) {
                  if (val == 'export_xmi') _exportXmi(provider);
                  if (val == 'import_xmi') _importXmi(provider);
                  if (val == 'toggle_ro') provider.toggleLocalReadOnly();
                  if (val == 'reset_zoom') {
                    _transformCtrl.value = Matrix4.identity();
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'export_xmi',
                    child: Text('Exportar XMI 2.1',
                        style: TextStyle(color: Colors.white)),
                  ),
                  if (!provider.isReadOnly)
                    const PopupMenuItem(
                      value: 'import_xmi',
                      child: Text('Importar XMI 2.1',
                          style: TextStyle(color: Colors.white)),
                    ),
                  if (!provider.isViewerRole)
                    PopupMenuItem(
                      value: 'toggle_ro',
                      child: Text(
                        provider.localReadOnlyOverride
                            ? 'Desbloquear edición local'
                            : 'Activar candado solo lectura',
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  const PopupMenuItem(
                    value: 'reset_zoom',
                    child: Text('Centrar Vista (100%)',
                        style: TextStyle(color: Colors.white)),
                  ),
                ],
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.more_horiz, color: Colors.white70, size: 20),
                      Text('Más / XMI',
                          style: TextStyle(color: Colors.white70, fontSize: 10)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          if (provider.statusMessage != null || provider.lastError != null)
            Container(
              width: double.infinity,
              color: provider.lastError != null
                  ? const Color(0xFF7F1D1D)
                  : const Color(0xFF1E293B),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(
                children: [
                  Icon(
                    provider.lastError != null
                        ? Icons.error_outline
                        : Icons.info_outline,
                    size: 16,
                    color: provider.lastError != null
                        ? const Color(0xFFFCA5A5)
                        : const Color(0xFF38BDF8),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      provider.lastError ?? provider.statusMessage ?? '',
                      style: TextStyle(
                        color: provider.lastError != null
                            ? const Color(0xFFFEE2E2)
                            : const Color(0xFFE2E8F0),
                        fontSize: 11.5,
                      ),
                    ),
                  ),
                  InkWell(
                    onTap: provider.clearMessages,
                    child: const Icon(Icons.close,
                        size: 16, color: Colors.white60),
                  ),
                ],
              ),
            ),
          if (provider.isViewerRole)
            Container(
              width: double.infinity,
              color: const Color(0xFF78350F),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: const Row(
                children: [
                  Icon(Icons.visibility_outlined,
                      size: 16, color: Color(0xFFFDE68A)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Modo VIEWER (Solo Lectura): puedes navegar, chatear y revisar código permitido en tiempo real.',
                      style: TextStyle(color: Color(0xFFFEF3C7), fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: InteractiveViewer(
              transformationController: _transformCtrl,
              constrained: false,
              boundaryMargin: const EdgeInsets.all(500),
              minScale: 0.25,
              maxScale: 2.2,
              child: Container(
                width: 4500,
                height: 4500,
                color: const Color(0xFF0B1120),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: CustomPaint(painter: _GridPainter()),
                    ),
                    Positioned.fill(
                      child: CustomPaint(
                        painter: RelationPainter(
                          nodes: visibleNodes,
                          connections: diagram.connections,
                        ),
                      ),
                    ),
                    ...visibleNodes.map((node) {
                      final foreignLock = provider.getForeignNodeLock(node.id);
                      return Positioned(
                        left: node.position.dx,
                        top: node.position.dy,
                        child: GestureDetector(
                          onTap: () {
                            setState(() => _selectedNodeId = node.id);
                            showClassEditorSheet(
                              context,
                              provider,
                              existing: node,
                            );
                          },
                          onPanStart: (_) {
                            if (provider.isReadOnly || foreignLock != null) {
                              if (foreignLock != null) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                        '🔒 Bloqueado por ${foreignLock.userName}'),
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              }
                              return;
                            }
                            setState(() => _selectedNodeId = node.id);
                            collab.requestNodeLock(node.id);
                          },
                          onPanUpdate: (details) {
                            if (provider.isReadOnly || foreignLock != null) return;
                            final scale =
                                _transformCtrl.value.getMaxScaleOnAxis();
                            final nextPos = node.position +
                                details.delta / (scale > 0 ? scale : 1.0);
                            final now = DateTime.now();
                            if (now.difference(_lastDragEmit).inMilliseconds >= 25) {
                              _lastDragEmit = now;
                              provider.updateNodePositionLive(node.id, nextPos);
                            } else {
                              node.position = Offset(
                                nextPos.dx.clamp(16.0, 4600.0),
                                nextPos.dy.clamp(16.0, 4600.0),
                              );
                              setState(() {});
                            }
                          },
                          onPanEnd: (_) {
                            if (provider.isReadOnly || foreignLock != null) return;
                            provider.commitNodeDrag(node.id);
                          },
                          child: UmlNodeBox(
                            node: node,
                            isSelected: _selectedNodeId == node.id,
                            lockedByOther: foreignLock,
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToolButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ToolButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(color: Colors.white70, fontSize: 10)),
          ],
        ),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF1E293B).withValues(alpha: 0.48)
      ..strokeWidth = 1;
    const step = 40.0;
    for (var x = 0.0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
