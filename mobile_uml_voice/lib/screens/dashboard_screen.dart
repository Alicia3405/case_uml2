import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';
import '../services/auth_service.dart';
import '../widgets/team_collab_sheet.dart';
import '../widgets/tutorial_dialog.dart';
import '../widgets/user_profile_dialog.dart';
import '../widgets/vision_scanner_sheet.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback onNavigateToCanvas;
  final VoidCallback onNavigateToVoice;

  const DashboardScreen({
    super.key,
    required this.onNavigateToCanvas,
    required this.onNavigateToVoice,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _searchQuery = '';
  int _tabFilter = 0; // 0: Todos, 1: Mis Proyectos, 2: Colaborativos

  Future<void> _createProjectDialog() async {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final pkgCtrl = TextEditingController(text: 'com.casestudio.app');

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Nuevo Proyecto CASE UML',
            style: TextStyle(color: Colors.white)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Nombre del Proyecto',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: descCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Descripción (opcional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: pkgCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Paquete Java Base',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Crear y Abrir'),
          ),
        ],
      ),
    );

    if (ok == true && nameCtrl.text.trim().isNotEmpty && mounted) {
      final created = await context.read<ProjectProvider>().createProject(
            name: nameCtrl.text.trim(),
            description: descCtrl.text.trim(),
            basePackage: pkgCtrl.text.trim(),
          );
      if (created && mounted) {
        widget.onNavigateToCanvas();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final provider = context.watch<ProjectProvider>();
    final user = auth.currentUser;

    final filtered = provider.projects.where((p) {
      if (_tabFilter == 1 && !p.isOwner && p.createdBy != user?.id) {
        return false;
      }
      if (_tabFilter == 2 && p.createdBy == user?.id && p.memberCount <= 1) {
        return false;
      }
      if (_searchQuery.trim().isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        return p.name.toLowerCase().contains(q) ||
            p.description.toLowerCase().contains(q) ||
            p.basePackage.toLowerCase().contains(q);
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF090D16),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Proyectos UML',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            if (user != null)
              Text(
                '${user.fullName} • ${auth.serverOrigin}',
                style: const TextStyle(fontSize: 11, color: Colors.white60),
              ),
          ],
        ),
        actions: [
          if (provider.pendingSyncCount > 0)
            Badge(
              label: Text('${provider.pendingSyncCount}'),
              child: IconButton(
                tooltip: 'Sincronizar cola offline pendiente',
                icon: const Icon(Icons.cloud_upload_outlined,
                    color: Color(0xFFFBBF24)),
                onPressed: () async {
                  final res = await provider.syncOfflineQueue();
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                          'Sincronizados: ${res.synced}, fallidos: ${res.failed}'),
                    ),
                  );
                },
              ),
            ),
          IconButton(
            tooltip: 'Recargar proyectos',
            icon: const Icon(Icons.refresh),
            onPressed: () => provider.loadProjects(),
          ),
          IconButton(
            tooltip: 'Guía rápida',
            icon: const Icon(Icons.help_outline),
            onPressed: () => showTutorialDialog(context),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: InkWell(
              onTap: () => showUserProfileDialog(context, auth),
              child: CircleAvatar(
                radius: 16,
                backgroundColor: const Color(0xFF38BDF8),
                child: Text(
                  user?.initials ?? 'U',
                  style: const TextStyle(
                    color: Color(0xFF090D16),
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF38BDF8),
        foregroundColor: const Color(0xFF090D16),
        onPressed: _createProjectDialog,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Proyecto',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: RefreshIndicator(
        onRefresh: () => provider.loadProjects(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 90),
          children: [
            // Accesos rápidos multimodales
            Row(
              children: [
                Expanded(
                  child: _QuickCard(
                    icon: Icons.mic_rounded,
                    color: const Color(0xFF38BDF8),
                    title: 'Arquitecto Voz IA',
                    subtitle: 'Canal 1 + Canal 2',
                    onTap: widget.onNavigateToVoice,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickCard(
                    icon: Icons.camera_alt_rounded,
                    color: const Color(0xFF8B5CF6),
                    title: 'Vision AI Foto',
                    subtitle: 'Pizarra a UML',
                    onTap: () {
                      if (provider.activeDiagram == null) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                              content:
                                  Text('Selecciona primero un proyecto abajo.')),
                        );
                        return;
                      }
                      showVisionScannerSheet(context, provider);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Buscar proyecto o paquete...',
                hintStyle: const TextStyle(color: Colors.white38),
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: const Color(0xFF111827),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF1E293B)),
                ),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
            const SizedBox(height: 10),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('Todos')),
                ButtonSegment(value: 1, label: Text('Propios')),
                ButtonSegment(value: 2, label: Text('Colaborativos')),
              ],
              selected: {_tabFilter},
              onSelectionChanged: (s) => setState(() => _tabFilter = s.first),
            ),
            const SizedBox(height: 14),
            if (provider.isLoading)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (filtered.isEmpty)
              Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF1E293B)),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.folder_open, size: 42, color: Colors.white38),
                    SizedBox(height: 8),
                    Text(
                      'No hay proyectos que coincidan con el filtro actual.',
                      style: TextStyle(color: Colors.white60),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else
              ...filtered.map((p) => _ProjectCard(
                    project: p,
                    isActive: provider.activeProject?.id == p.id,
                    onOpenCanvas: () async {
                      final ok = await provider.selectProject(p);
                      if (ok && mounted) {
                        widget.onNavigateToCanvas();
                      }
                    },
                    onOpenTeam: () async {
                      await provider.selectProject(p);
                      if (!context.mounted) return;
                      await showTeamCollabSheet(context, provider);
                    },
                    onDelete: p.isOwner
                        ? () async {
                            final confirm = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                backgroundColor: const Color(0xFF0F172A),
                                title: const Text('Eliminar Proyecto',
                                    style: TextStyle(color: Colors.white)),
                                content: Text(
                                  '¿Eliminar "${p.name}" y todos sus diagramas?',
                                  style: const TextStyle(color: Colors.white70),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx, false),
                                    child: const Text('Cancelar'),
                                  ),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.redAccent),
                                    onPressed: () => Navigator.pop(ctx, true),
                                    child: const Text('Eliminar'),
                                  ),
                                ],
                              ),
                            );
                            if (confirm == true) {
                              await provider.deleteProject(p.id);
                            }
                          }
                        : null,
                  )),
          ],
        ),
      ),
    );
  }
}

class _QuickCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _QuickCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF111827),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.38)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.16),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 12.5)),
                  Text(subtitle,
                      style:
                          const TextStyle(color: Colors.white54, fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  final ProjectSummary project;
  final bool isActive;
  final VoidCallback onOpenCanvas;
  final VoidCallback onOpenTeam;
  final VoidCallback? onDelete;

  const _ProjectCard({
    required this.project,
    required this.isActive,
    required this.onOpenCanvas,
    required this.onOpenTeam,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final role = (project.userRole ?? 'OWNER').toUpperCase();
    final roleColor = role == 'OWNER'
        ? const Color(0xFFF59E0B)
        : role == 'EDITOR'
            ? const Color(0xFF38BDF8)
            : const Color(0xFF94A3B8);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive ? const Color(0xFF38BDF8) : const Color(0xFF1E293B),
          width: isActive ? 1.8 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  project.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15.5,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: roleColor.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  role,
                  style: TextStyle(
                    color: roleColor,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (project.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              project.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            children: [
              _MetaChip(icon: Icons.inventory_2_outlined, text: project.basePackage),
              _MetaChip(
                  icon: Icons.people_outline,
                  text: '${project.memberCount} miembros'),
              _MetaChip(
                icon: project.canDownload
                    ? Icons.folder_zip_outlined
                    : Icons.block,
                text: project.canDownload ? 'ZIP OK' : 'Sin ZIP',
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onOpenCanvas,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF38BDF8),
                    foregroundColor: const Color(0xFF090D16),
                  ),
                  icon: const Icon(Icons.schema_rounded, size: 18),
                  label: Text(isActive ? 'Continuar Lienzo' : 'Abrir Lienzo'),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: onOpenTeam,
                icon: const Icon(Icons.group_outlined, size: 18),
                label: const Text('Equipo'),
              ),
              if (onDelete != null) ...[
                const SizedBox(width: 4),
                IconButton(
                  tooltip: 'Eliminar proyecto',
                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                  onPressed: onDelete,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MetaChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: const Color(0xFF94A3B8)),
        const SizedBox(width: 4),
        Text(
          text,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11.5),
        ),
      ],
    );
  }
}

