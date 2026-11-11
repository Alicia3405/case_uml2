import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../providers/project_provider.dart';
import 'uml_node_box.dart';

/// Hoja colaborativa de 3 pestañas conectada al gateway Socket.IO `/collaboration`
/// y al controlador REST `/api/projects/:id/members`:
/// 1) Miembros & Permisos (OWNER, EDITOR, VIEWER, switch ZIP)
/// 2) Chat de sala en vivo
/// 3) Bitácora de auditoría en vivo
Future<void> showTeamCollabSheet(
  BuildContext context,
  ProjectProvider provider, {
  int initialTab = 0,
}) async {
  provider.refreshActiveProjectMembers();
  if (initialTab == 1) {
    provider.collabService.setChatVisible(true);
  }

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0F172A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => _TeamCollabBody(
      provider: provider,
      initialTab: initialTab,
    ),
  );

  provider.collabService.setChatVisible(false);
}

class _TeamCollabBody extends StatefulWidget {
  final ProjectProvider provider;
  final int initialTab;

  const _TeamCollabBody({
    required this.provider,
    required this.initialTab,
  });

  @override
  State<_TeamCollabBody> createState() => _TeamCollabBodyState();
}

class _TeamCollabBodyState extends State<_TeamCollabBody>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _inviteEmailCtrl = TextEditingController();
  String _inviteRole = 'EDITOR';
  bool _inviteZip = true;

  final _chatCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(
      length: 3,
      vsync: this,
      initialIndex: widget.initialTab,
    );
    _tabs.addListener(() {
      widget.provider.collabService.setChatVisible(_tabs.index == 1);
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    _inviteEmailCtrl.dispose();
    _chatCtrl.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    final email = _inviteEmailCtrl.text.trim();
    if (email.isEmpty) return;
    final ok = await widget.provider.inviteMember(
      email: email,
      role: _inviteRole,
      canDownloadCode: _inviteRole == 'VIEWER' ? false : _inviteZip,
    );
    if (!mounted) return;
    if (ok) {
      _inviteEmailCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Colaborador $email invitado al proyecto.')),
      );
    } else if (widget.provider.lastError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.provider.lastError!),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([widget.provider, widget.provider.collabService]),
      builder: (context, _) {
        final project = widget.provider.activeProject;
        final collab = widget.provider.collabService;
        final onlineIds = collab.participants.map((p) => p.userId).toSet();
        final isOwner = project?.isOwner ?? false;

        return SizedBox(
          height: MediaQuery.of(context).size.height * 0.78,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 8),
                child: Row(
                  children: [
                    Icon(
                      collab.isConnected ? Icons.wifi_tethering : Icons.wifi_off,
                      color: collab.isConnected
                          ? const Color(0xFF10B981)
                          : Colors.amber,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            project?.name ?? 'Colaboración en Vivo',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Sala: ${collab.activeRoomCode ?? "Conectando..."} • ${collab.participants.length} en línea',
                            style: const TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 11.5,
                            ),
                          ),
                        ],
                      ),
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
                  Tab(text: 'Equipo (${project?.members.length ?? 0})'),
                  Tab(text: 'Chat (${collab.chatMessages.length})'),
                  Tab(text: 'Bitácora (${collab.activityLogs.length})'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    // TAB 1: Miembros y Permisos
                    ListView(
                      padding: const EdgeInsets.all(14),
                      children: [
                        if (collab.participants.isNotEmpty) ...[
                          const Text(
                            'Conectados en tiempo real:',
                            style: TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: collab.participants.map((p) {
                              final c = parseHexColor(p.color);
                              return Chip(
                                avatar: CircleAvatar(
                                  backgroundColor: c,
                                  radius: 6,
                                ),
                                backgroundColor: const Color(0xFF1E293B),
                                label: Text(
                                  p.userName,
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 11.5),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 14),
                        ],
                        if (isOwner) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  'Invitar Colaborador por Correo',
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13),
                                ),
                                const SizedBox(height: 8),
                                TextField(
                                  controller: _inviteEmailCtrl,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: const InputDecoration(
                                    hintText: 'ej: colega@uagrm.edu.bo',
                                    hintStyle: TextStyle(color: Colors.white38),
                                    isDense: true,
                                    border: OutlineInputBorder(),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    DropdownButton<String>(
                                      value: _inviteRole,
                                      dropdownColor: const Color(0xFF0F172A),
                                      style: const TextStyle(color: Colors.white),
                                      items: const [
                                        DropdownMenuItem(
                                            value: 'EDITOR',
                                            child: Text('EDITOR')),
                                        DropdownMenuItem(
                                            value: 'VIEWER',
                                            child: Text('VIEWER')),
                                      ],
                                      onChanged: (v) {
                                        if (v != null) {
                                          setState(() {
                                            _inviteRole = v;
                                            if (v == 'VIEWER') _inviteZip = false;
                                          });
                                        }
                                      },
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: CheckboxListTile(
                                        contentPadding: EdgeInsets.zero,
                                        dense: true,
                                        value: _inviteZip,
                                        title: const Text('Permitir ZIP',
                                            style: TextStyle(
                                                color: Colors.white70,
                                                fontSize: 12)),
                                        onChanged: _inviteRole == 'VIEWER'
                                            ? null
                                            : (v) => setState(
                                                () => _inviteZip = v ?? true),
                                      ),
                                    ),
                                    ElevatedButton(
                                      onPressed: _invite,
                                      child: const Text('Invitar'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        if (project != null)
                          ...project.members.map((m) {
                            final isOnline = onlineIds.contains(m.userId);
                            final isCreator = m.userId == project.createdBy ||
                                m.role == 'OWNER';
                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E293B),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isOnline
                                      ? const Color(0xFF10B981)
                                          .withValues(alpha: 0.45)
                                      : const Color(0xFF334155),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 14,
                                        backgroundColor: parseHexColor(m.color),
                                        child: Text(
                                          m.fullName.isNotEmpty
                                              ? m.fullName[0].toUpperCase()
                                              : 'U',
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold),
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
                                                Flexible(
                                                  child: Text(
                                                    m.fullName,
                                                    style: const TextStyle(
                                                        color: Colors.white,
                                                        fontWeight:
                                                            FontWeight.w600),
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                ),
                                                if (isOnline)
                                                  const Padding(
                                                    padding:
                                                        EdgeInsets.only(left: 6),
                                                    child: Icon(Icons.circle,
                                                        size: 8,
                                                        color: Color(0xFF10B981)),
                                                  ),
                                              ],
                                            ),
                                            Text(
                                              m.email,
                                              style: const TextStyle(
                                                  color: Colors.white54,
                                                  fontSize: 11),
                                            ),
                                          ],
                                        ),
                                      ),
                                      _RoleBadge(
                                        role: m.role,
                                        canDownload: m.canDownloadCode,
                                      ),
                                    ],
                                  ),
                                  if (isOwner && !isCreator) ...[
                                    const Divider(
                                        height: 14, color: Color(0xFF334155)),
                                    Row(
                                      children: [
                                        SegmentedButton<String>(
                                          segments: const [
                                            ButtonSegment(
                                                value: 'EDITOR',
                                                label: Text('Editor',
                                                    style:
                                                        TextStyle(fontSize: 11))),
                                            ButtonSegment(
                                                value: 'VIEWER',
                                                label: Text('Viewer',
                                                    style:
                                                        TextStyle(fontSize: 11))),
                                          ],
                                          selected: {
                                            m.role == 'VIEWER'
                                                ? 'VIEWER'
                                                : 'EDITOR'
                                          },
                                          onSelectionChanged: (sel) {
                                            widget.provider
                                                .updateMemberPermissions(
                                              targetUserId: m.userId,
                                              role: sel.first,
                                            );
                                          },
                                        ),
                                        const Spacer(),
                                        const Text('ZIP',
                                            style: TextStyle(
                                                color: Colors.white70,
                                                fontSize: 11)),
                                        Switch(
                                          value: m.canDownloadCode,
                                          onChanged: (val) {
                                            widget.provider
                                                .updateMemberPermissions(
                                              targetUserId: m.userId,
                                              canDownloadCode: val,
                                            );
                                          },
                                        ),
                                        IconButton(
                                          icon: const Icon(
                                              Icons.person_remove_outlined,
                                              size: 18,
                                              color: Colors.redAccent),
                                          onPressed: () => widget.provider
                                              .removeMember(m.userId),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            );
                          }),
                      ],
                    ),

                    // TAB 2: Chat en Vivo
                    Column(
                      children: [
                        Expanded(
                          child: collab.chatMessages.isEmpty
                              ? const Center(
                                  child: Text(
                                    'Aún no hay mensajes en esta sala.\nSaluda al equipo o coordina una entidad.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: Colors.white54),
                                  ),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.all(12),
                                  itemCount: collab.chatMessages.length,
                                  itemBuilder: (context, i) {
                                    final msg = collab.chatMessages[i];
                                    final isMine = msg.userId ==
                                        widget.provider.authService.currentUser
                                            ?.id;
                                    final timeStr = DateFormat('HH:mm')
                                        .format(msg.timestamp.toLocal());
                                    return Align(
                                      alignment: isMine
                                          ? Alignment.centerRight
                                          : Alignment.centerLeft,
                                      child: Container(
                                        margin:
                                            const EdgeInsets.only(bottom: 8),
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 8),
                                        constraints: BoxConstraints(
                                          maxWidth: MediaQuery.of(context)
                                                  .size
                                                  .width *
                                              0.74,
                                        ),
                                        decoration: BoxDecoration(
                                          color: isMine
                                              ? const Color(0xFF1D4ED8)
                                              : const Color(0xFF1E293B),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              '${msg.userName} • $timeStr',
                                              style: TextStyle(
                                                color: parseHexColor(msg.color),
                                                fontSize: 10.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            Text(
                                              msg.message,
                                              style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 13),
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                        ),
                        Padding(
                          padding: EdgeInsets.fromLTRB(
                            12,
                            6,
                            12,
                            MediaQuery.of(context).viewInsets.bottom + 12,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _chatCtrl,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: const InputDecoration(
                                    hintText: 'Escribir al equipo...',
                                    hintStyle: TextStyle(color: Colors.white38),
                                    isDense: true,
                                    border: OutlineInputBorder(),
                                  ),
                                  onSubmitted: (val) {
                                    collab.sendChatMessage(val);
                                    _chatCtrl.clear();
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              IconButton.filled(
                                onPressed: () {
                                  collab.sendChatMessage(_chatCtrl.text);
                                  _chatCtrl.clear();
                                },
                                icon: const Icon(Icons.send_rounded),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    // TAB 3: Bitácora en Vivo
                    collab.activityLogs.isEmpty
                        ? const Center(
                            child: Text(
                              'Sin eventos recientes en esta sesión.',
                              style: TextStyle(color: Colors.white54),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(12),
                            itemCount: collab.activityLogs.length,
                            itemBuilder: (context, i) {
                              final entry = collab
                                  .activityLogs[collab.activityLogs.length - 1 - i];
                              final timeStr = DateFormat('HH:mm:ss')
                                  .format(entry.timestamp.toLocal());
                              return ListTile(
                                dense: true,
                                leading: CircleAvatar(
                                  radius: 14,
                                  backgroundColor:
                                      parseHexColor(entry.color).withValues(alpha: 0.2),
                                  child: Icon(
                                    entry.category == 'ai'
                                        ? Icons.auto_awesome
                                        : entry.category == 'voice'
                                            ? Icons.mic
                                            : entry.category == 'permission'
                                                ? Icons.admin_panel_settings
                                                : Icons.history_edu,
                                    size: 15,
                                    color: parseHexColor(entry.color),
                                  ),
                                ),
                                title: Text(
                                  '${entry.userName}: ${entry.action}',
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 12.5),
                                ),
                                subtitle: entry.detail != null
                                    ? Text(entry.detail!,
                                        style: const TextStyle(
                                            color: Colors.white54, fontSize: 11))
                                    : null,
                                trailing: Text(
                                  timeStr,
                                  style: const TextStyle(
                                      color: Colors.white38, fontSize: 10),
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

class _RoleBadge extends StatelessWidget {
  final String role;
  final bool canDownload;

  const _RoleBadge({required this.role, required this.canDownload});

  @override
  Widget build(BuildContext context) {
    final upper = role.toUpperCase();
    final color = upper == 'OWNER'
        ? const Color(0xFFF59E0B)
        : upper == 'EDITOR'
            ? const Color(0xFF38BDF8)
            : const Color(0xFF94A3B8);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: color.withValues(alpha: 0.55)),
          ),
          child: Text(
            upper,
            style: TextStyle(
                color: color, fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 4),
        Icon(
          canDownload ? Icons.folder_zip_outlined : Icons.block,
          size: 15,
          color: canDownload ? const Color(0xFF10B981) : Colors.redAccent,
        ),
      ],
    );
  }
}

