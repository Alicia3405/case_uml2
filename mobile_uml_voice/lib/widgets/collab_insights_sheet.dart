import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';

/// Hoja colaborativa de continuidad multi-sesión, notificaciones, checkpoints
/// y anotaciones de pizarra IA (equivalente móvil al panel multi-día de Web).
Future<void> showCollabInsightsSheet(
  BuildContext context,
  ProjectProvider provider, {
  int initialTab = 0,
}) async {
  provider.refreshResumeBundle();
  provider.refreshNotifications();

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0F172A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => _CollabInsightsBody(
      provider: provider,
      initialTab: initialTab.clamp(0, 2),
    ),
  );
}

/// Diálogo para configurar en caliente la URL de Ollama / túnel Google Colab (`ngrok`).
Future<void> showOllamaConfigDialog(
  BuildContext context,
  ProjectProvider provider,
) async {
  final cfg = await provider.loadOllamaConfig();
  if (!context.mounted) return;

  final urlCtrl = TextEditingController(text: cfg?.baseUrl ?? '');
  final modelCtrl = TextEditingController(text: cfg?.model ?? 'qwen2.5:3b');
  final visionCtrl =
      TextEditingController(text: cfg?.visionModel ?? 'qwen2.5vl:7b');
  String? testSummary;
  bool testing = false;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDlg) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Row(
          children: [
            Text('🦙 Runtime Ollama / Colab',
                style: TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Conecta tu backend a un Ollama local o a Google Colab (ngrok/Cloudflare).',
                style: TextStyle(color: Colors.white60, fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: urlCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: const InputDecoration(
                  labelText: 'URL Base Ollama / Túnel',
                  hintText: 'https://xxxx.ngrok-free.app',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: modelCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: const InputDecoration(
                  labelText: 'Modelo principal UML',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: visionCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: const InputDecoration(
                  labelText: 'Modelo Vision (pizarra/foto)',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              if (testSummary != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    testSummary!,
                    style: const TextStyle(color: Colors.white70, fontSize: 11.5),
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: testing
                ? null
                : () async {
                    setDlg(() {
                      testing = true;
                      testSummary = 'Probando conexión...';
                    });
                    final res = await provider.testOllamaConnection(
                      baseUrl: urlCtrl.text.trim(),
                    );
                    if (!ctx.mounted) return;
                    setDlg(() {
                      testing = false;
                      if (res != null && res.ok) {
                        testSummary =
                            '✅ Conectado (${res.latencyMs} ms)\nModelos: ${res.models.join(', ')}';
                      } else {
                        testSummary =
                            '⚠️ Sin respuesta: ${res?.error ?? 'Verifica túnel Colab'}';
                      }
                    });
                  },
            child: const Text('Probar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
          ElevatedButton(
            onPressed: testing
                ? null
                : () async {
                    final nav = Navigator.of(ctx);
                    await provider.updateOllamaConfig(
                      baseUrl: urlCtrl.text.trim(),
                      model: modelCtrl.text.trim(),
                      visionModel: visionCtrl.text.trim(),
                    );
                    if (ctx.mounted) nav.pop();
                  },
            child: const Text('Guardar'),
          ),
        ],
      ),
    ),
  );

  urlCtrl.dispose();
  modelCtrl.dispose();
  visionCtrl.dispose();
}

class _CollabInsightsBody extends StatefulWidget {
  final ProjectProvider provider;
  final int initialTab;

  const _CollabInsightsBody({
    required this.provider,
    required this.initialTab,
  });

  @override
  State<_CollabInsightsBody> createState() => _CollabInsightsBodyState();
}

class _CollabInsightsBodyState extends State<_CollabInsightsBody>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _snapshotCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
      length: 3,
      vsync: this,
      initialIndex: widget.initialTab,
    );
  }

  @override
  void dispose() {
    _tabs.dispose();
    _snapshotCtrl.dispose();
    super.dispose();
  }

  Color _severityColor(String severity) {
    switch (severity) {
      case 'discipline':
        return const Color(0xFFF59E0B);
      case 'warning':
        return const Color(0xFFFB923C);
      case 'mention':
        return const Color(0xFF38BDF8);
      case 'resolved':
        return const Color(0xFF10B981);
      default:
        return const Color(0xFF8B5CF6);
    }
  }

  IconData _severityIcon(String severity) {
    switch (severity) {
      case 'discipline':
        return Icons.rule_folder_outlined;
      case 'warning':
        return Icons.warning_amber_rounded;
      case 'mention':
        return Icons.alternate_email_rounded;
      case 'resolved':
        return Icons.check_circle_outline;
      default:
        return Icons.lightbulb_outline_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([widget.provider, widget.provider.collabService]),
      builder: (context, _) {
        final provider = widget.provider;
        final diagram = provider.activeDiagram;
        final myId = provider.authService.currentUser?.id;
        final notifs = provider.notifications;
        final unreadCount = provider.unreadNotificationCount;
        final bundle = provider.resumeBundle;
        final session = bundle?.session ?? provider.sessionMeta;
        final snapshots = provider.snapshots;
        final annotations = [...(diagram?.aiAnnotations ?? const <AiAnnotationItem>[])]
          ..sort((a, b) {
            if (a.isOpen != b.isOpen) return a.isOpen ? -1 : 1;
            return b.createdAt.compareTo(a.createdAt);
          });
        final openNotesCount = provider.openAiAnnotations.length;

        return SizedBox(
          height: MediaQuery.of(context).size.height * 0.80,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 6),
                child: Row(
                  children: [
                    const Icon(Icons.hub_outlined, color: Color(0xFF38BDF8)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            diagram?.name ?? 'Continuidad & Copilot IA',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            session != null
                                ? 'Sesión #${session.sessionNumber} • ${session.activeDateKeys.length} día(s)${session.hostUserName != null ? " • 👑 ${session.hostUserName}" : ""}'
                                : 'Historial persistente y sugerencias IA',
                            style: const TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 11.5,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Actualizar desde servidor',
                      onPressed: () {
                        provider.refreshResumeBundle();
                        provider.refreshNotifications();
                      },
                      icon: const Icon(Icons.refresh, color: Colors.white70, size: 20),
                    ),
                  ],
                ),
              ),
              TabBar(
                controller: _tabs,
                indicatorColor: const Color(0xFF38BDF8),
                labelColor: const Color(0xFF38BDF8),
                unselectedLabelColor: Colors.white60,
                tabs: [
                  Tab(text: 'Alertas ($unreadCount)'),
                  Tab(text: 'Retomar (${snapshots.length})'),
                  Tab(text: 'Pizarra IA ($openNotesCount)'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    // TAB 1: Notificaciones
                    Column(
                      children: [
                        if (notifs.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                            child: Row(
                              children: [
                                Text(
                                  '$unreadCount sin leer de ${notifs.length}',
                                  style: const TextStyle(
                                      color: Colors.white60, fontSize: 12),
                                ),
                                const Spacer(),
                                if (unreadCount > 0)
                                  TextButton.icon(
                                    onPressed: provider.markAllNotificationsRead,
                                    icon: const Icon(Icons.done_all, size: 16),
                                    label: const Text('Marcar todas leídas',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                              ],
                            ),
                          ),
                        Expanded(
                          child: notifs.isEmpty
                              ? const Center(
                                  child: Text(
                                    'No hay notificaciones recientes.\nAquí verás @menciones y alertas OMT de la sala.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: Colors.white54),
                                  ),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.all(12),
                                  itemCount: notifs.length,
                                  itemBuilder: (_, i) {
                                    final n = notifs[i];
                                    final isRead = n.isReadBy(myId);
                                    final color = _severityColor(n.severity);
                                    final timeStr = DateFormat('dd/MM HH:mm')
                                        .format(n.createdAt.toLocal());
                                    return InkWell(
                                      onTap: isRead
                                          ? null
                                          : () => provider.markNotificationRead(n.id),
                                      borderRadius: BorderRadius.circular(12),
                                      child: Container(
                                        margin: const EdgeInsets.only(bottom: 8),
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: isRead
                                              ? const Color(0xFF111827)
                                              : const Color(0xFF1E293B),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(
                                            color: isRead
                                                ? const Color(0xFF1E293B)
                                                : color.withValues(alpha: 0.7),
                                          ),
                                        ),
                                        child: Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            CircleAvatar(
                                              radius: 15,
                                              backgroundColor:
                                                  color.withValues(alpha: 0.18),
                                              child: Icon(
                                                _severityIcon(n.severity),
                                                color: color,
                                                size: 16,
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Row(
                                                    children: [
                                                      Expanded(
                                                        child: Text(
                                                          n.title,
                                                          style: TextStyle(
                                                            color: Colors.white,
                                                            fontSize: 13,
                                                            fontWeight: isRead
                                                                ? FontWeight.w500
                                                                : FontWeight.w700,
                                                          ),
                                                        ),
                                                      ),
                                                      Text(
                                                        timeStr,
                                                        style: const TextStyle(
                                                            color: Colors.white38,
                                                            fontSize: 10),
                                                      ),
                                                    ],
                                                  ),
                                                  const SizedBox(height: 3),
                                                  Text(
                                                    n.body,
                                                    style: const TextStyle(
                                                        color: Colors.white70,
                                                        fontSize: 12),
                                                  ),
                                                  const SizedBox(height: 4),
                                                  Text(
                                                    'De: ${n.actorName}${!isRead ? " • Toca para marcar leída" : ""}',
                                                    style: TextStyle(
                                                      color: !isRead
                                                          ? color
                                                          : Colors.white38,
                                                      fontSize: 10.5,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                        ),
                      ],
                    ),

                    // TAB 2: Retomar Multi-Sesión, Autoría y Checkpoints
                    ListView(
                      padding: const EdgeInsets.all(14),
                      children: [
                        if (bundle != null) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: const Color(0xFF38BDF8)
                                    .withValues(alpha: 0.45),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(Icons.history_toggle_off,
                                        color: Color(0xFF38BDF8), size: 18),
                                    SizedBox(width: 6),
                                    Text(
                                      'Desde tu última visita',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13.5,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  bundle.sinceLastVisit.changesCount > 0
                                      ? '${bundle.sinceLastVisit.changesCount} cambio(s) de ${bundle.sinceLastVisit.contributors.join(", ")}'
                                      : 'Estás al día con los últimos cambios del equipo.',
                                  style: const TextStyle(
                                      color: Colors.white70, fontSize: 12),
                                ),
                                if (bundle
                                    .sinceLastVisit.touchedClasses.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 4,
                                    children: bundle
                                        .sinceLastVisit.touchedClasses
                                        .take(8)
                                        .map((c) => Chip(
                                              visualDensity: VisualDensity.compact,
                                              backgroundColor:
                                                  const Color(0xFF0F172A),
                                              label: Text(c,
                                                  style: const TextStyle(
                                                      color: Color(0xFF38BDF8),
                                                      fontSize: 10.5)),
                                            ))
                                        .toList(),
                                  ),
                                ],
                                if (bundle.sinceLastVisit.highlights.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  ...bundle.sinceLastVisit.highlights
                                      .take(4)
                                      .map((h) => Padding(
                                            padding: const EdgeInsets.only(top: 2),
                                            child: Text('• $h',
                                                style: const TextStyle(
                                                    color: Colors.white60,
                                                    fontSize: 11.5)),
                                          )),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (bundle.contributorStats.isNotEmpty) ...[
                            const Text(
                              'Aportes Acumulados (Humanos + IA)',
                              style: TextStyle(
                                  color: Colors.white70,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12.5),
                            ),
                            const SizedBox(height: 6),
                            ...bundle.contributorStats.map((stat) {
                              final isAi = stat.actorType == 'ai';
                              return Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF111827),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      isAi ? Icons.auto_awesome : Icons.person,
                                      size: 16,
                                      color: isAi
                                          ? const Color(0xFFA78BFA)
                                          : const Color(0xFF38BDF8),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        stat.userName,
                                        style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                    Text(
                                      '${stat.totalEvents} ev • UML ${stat.umlEdits} • IA ${stat.aiInteractions}',
                                      style: const TextStyle(
                                          color: Colors.white54, fontSize: 11),
                                    ),
                                  ],
                                ),
                              );
                            }),
                            const SizedBox(height: 12),
                          ],
                        ],
                        const Text(
                          'Checkpoints Multi-Día',
                          style: TextStyle(
                              color: Colors.white70,
                              fontWeight: FontWeight.w600,
                              fontSize: 12.5),
                        ),
                        const SizedBox(height: 8),
                        if (!provider.isReadOnly) ...[
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _snapshotCtrl,
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 13),
                                  decoration: const InputDecoration(
                                    hintText: 'Etiqueta (ej: Fin Día 2)...',
                                    hintStyle: TextStyle(color: Colors.white38),
                                    isDense: true,
                                    border: OutlineInputBorder(),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              ElevatedButton.icon(
                                onPressed: provider.isBusy
                                    ? null
                                    : () async {
                                        final lbl = _snapshotCtrl.text.trim();
                                        final ok = await provider.createSnapshot(
                                          label: lbl.isEmpty ? null : lbl,
                                        );
                                        if (ok) _snapshotCtrl.clear();
                                      },
                                icon: const Icon(Icons.bookmark_add_outlined,
                                    size: 18),
                                label: const Text('Guardar'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                        ],
                        if (snapshots.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 20),
                            child: Text(
                              'No hay checkpoints creados todavía para este diagrama.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white54),
                            ),
                          )
                        else
                          ...snapshots.map((snap) {
                            final dateStr = DateFormat('dd/MM/yyyy HH:mm')
                                .format(snap.createdAt.toLocal());
                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF111827),
                                borderRadius: BorderRadius.circular(10),
                                border:
                                    Border.all(color: const Color(0xFF1E293B)),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.flag_outlined,
                                      color: Color(0xFF10B981), size: 18),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          snap.label,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600,
                                            fontSize: 13,
                                          ),
                                        ),
                                        Text(
                                          'Sesión #${snap.sessionNumber} • ${snap.savedByName} • $dateStr',
                                          style: const TextStyle(
                                              color: Colors.white54,
                                              fontSize: 11),
                                        ),
                                        Text(
                                          '${snap.nodeCount} clases • ${snap.connectionCount} relaciones',
                                          style: const TextStyle(
                                              color: Color(0xFF94A3B8),
                                              fontSize: 11),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (!provider.isReadOnly)
                                    TextButton(
                                      onPressed: provider.isBusy
                                          ? null
                                          : () => provider.restoreSnapshot(snap.id),
                                      child: const Text('Restaurar'),
                                    ),
                                ],
                              ),
                            );
                          }),
                      ],
                    ),

                    // TAB 3: Notas IA en Pizarra
                    annotations.isEmpty
                        ? const Center(
                            child: Text(
                              'No hay notas IA en la pizarra.\nUsa @IA o el Copiloto IA (Opinar / Revisar / OMT) para recibir recomendaciones.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white54),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: annotations.length,
                            itemBuilder: (_, i) {
                              final note = annotations[i];
                              final color = note.isOpen
                                  ? _severityColor(note.severity)
                                  : const Color(0xFF475569);
                              return Container(
                                margin: const EdgeInsets.only(bottom: 10),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF111827),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                      color: color.withValues(alpha: 0.55)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(_severityIcon(note.severity),
                                            color: color, size: 16),
                                        const SizedBox(width: 6),
                                        Expanded(
                                          child: Text(
                                            note.title,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 13,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: color.withValues(alpha: 0.16),
                                            borderRadius:
                                                BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            note.status.toUpperCase(),
                                            style: TextStyle(
                                                color: color,
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w700),
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (note.targetClassName != null) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        'Clase: ${note.targetClassName}',
                                        style: const TextStyle(
                                            color: Color(0xFF38BDF8),
                                            fontSize: 11),
                                      ),
                                    ],
                                    const SizedBox(height: 6),
                                    Text(
                                      note.message,
                                      style: const TextStyle(
                                          color: Colors.white70, fontSize: 12),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'Por ${note.authorName}${note.requestedByUserName != null ? " (solicitó ${note.requestedByUserName})" : ""}',
                                      style: const TextStyle(
                                          color: Colors.white38, fontSize: 10.5),
                                    ),
                                    if (note.isOpen && !provider.isReadOnly) ...[
                                      const SizedBox(height: 8),
                                      Wrap(
                                        spacing: 8,
                                        children: [
                                          if (note.suggestedPrompt != null)
                                            ElevatedButton.icon(
                                              onPressed: provider.isBusy
                                                  ? null
                                                  : () => provider
                                                      .applyWhiteboardAnnotation(
                                                          note),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor:
                                                    const Color(0xFF8B5CF6),
                                                foregroundColor: Colors.white,
                                                visualDensity:
                                                    VisualDensity.compact,
                                              ),
                                              icon: const Icon(Icons.auto_fix_high,
                                                  size: 14),
                                              label: const Text('Aplicar',
                                                  style: TextStyle(fontSize: 11.5)),
                                            ),
                                          OutlinedButton(
                                            onPressed: () =>
                                                provider.updateAnnotationStatus(
                                                    note.id, 'applied'),
                                            style: OutlinedButton.styleFrom(
                                              visualDensity: VisualDensity.compact,
                                            ),
                                            child: const Text('Resuelta',
                                                style: TextStyle(fontSize: 11.5)),
                                          ),
                                          TextButton(
                                            onPressed: () =>
                                                provider.updateAnnotationStatus(
                                                    note.id, 'dismissed'),
                                            style: TextButton.styleFrom(
                                              visualDensity: VisualDensity.compact,
                                            ),
                                            child: const Text('Descartar',
                                                style: TextStyle(
                                                    color: Colors.white54,
                                                    fontSize: 11.5)),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            },
                          ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

