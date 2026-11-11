import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../providers/project_provider.dart';
import '../services/codegen_api_service.dart';
import '../services/download_helper.dart';

/// Bottom sheet para previsualizar código generado (Spring Boot 3.4 / Flutter)
/// o descargar el archivo `.zip` completo desde `/api/codegen/*`.
Future<void> showCodegenPreviewSheet(
  BuildContext context,
  ProjectProvider provider,
) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0F172A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => _CodegenPreviewBody(provider: provider),
  );
}

class _CodegenPreviewBody extends StatefulWidget {
  final ProjectProvider provider;
  const _CodegenPreviewBody({required this.provider});

  @override
  State<_CodegenPreviewBody> createState() => _CodegenPreviewBodyState();
}

class _CodegenPreviewBodyState extends State<_CodegenPreviewBody> {
  String _platform = 'all';
  CodegenPreviewResult? _preview;
  CodegenPreviewFile? _selectedFile;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  Future<void> _loadPreview() async {
    setState(() => _loading = true);
    final res = await widget.provider.previewGeneratedCode(platform: _platform);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _preview = res;
      _selectedFile = res != null && res.files.isNotEmpty ? res.files.first : null;
    });
  }

  Future<void> _downloadZip() async {
    final bytes = await widget.provider.downloadCodeZip(platform: _platform);
    if (!mounted) return;
    if (bytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              widget.provider.lastError ?? 'No tienes permiso para descargar ZIP'),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    final safeProject = (widget.provider.activeProject?.name ?? 'proyecto')
        .replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')
        .toLowerCase();
    final saved = await saveOrDownloadBytes(
      '${safeProject}_$_platform.zip',
      bytes,
      mimeType: 'application/zip',
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('📦 ZIP generado (${bytes.length} bytes): $saved'),
        backgroundColor: const Color(0xFF047857),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canDownload = widget.provider.canDownloadCode;

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.84,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.code_rounded, color: Color(0xFF38BDF8)),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Generación Full-Stack (Spring Boot + Flutter)',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: (_loading || !canDownload) ? null : _downloadZip,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: canDownload
                        ? const Color(0xFF10B981)
                        : Colors.grey.shade700,
                    foregroundColor: Colors.white,
                  ),
                  icon: Icon(
                      canDownload ? Icons.download_rounded : Icons.lock_outline,
                      size: 18),
                  label: Text(canDownload ? 'Descargar ZIP' : 'ZIP Bloqueado'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'all', label: Text('Full Stack')),
                ButtonSegment(value: 'spring-boot', label: Text('Spring Boot')),
                ButtonSegment(value: 'flutter', label: Text('Flutter')),
              ],
              selected: {_platform},
              onSelectionChanged: (vals) {
                setState(() => _platform = vals.first);
                _loadPreview();
              },
            ),
            const SizedBox(height: 10),
            if (_loading)
              const Expanded(
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_preview == null)
              Expanded(
                child: Center(
                  child: Text(
                    widget.provider.lastError ??
                        'Agrega clases al diagrama para generar código.',
                    style: const TextStyle(color: Colors.white60),
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            else ...[
              Text(
                '${_preview!.totalFiles} archivos generados (${_preview!.projectName})',
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _preview!.files.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 6),
                  itemBuilder: (context, i) {
                    final f = _preview!.files[i];
                    final selected = _selectedFile?.path == f.path;
                    return ChoiceChip(
                      selected: selected,
                      label: Text(
                        f.filename,
                        style: const TextStyle(fontSize: 11.5),
                      ),
                      onSelected: (_) => setState(() => _selectedFile = f),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              if (_selectedFile != null)
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF020617),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          color: const Color(0xFF1E293B),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _selectedFile!.path,
                                  style: const TextStyle(
                                    color: Color(0xFF38BDF8),
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.copy,
                                    size: 16, color: Colors.white70),
                                onPressed: () {
                                  Clipboard.setData(
                                      ClipboardData(text: _selectedFile!.content));
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Código copiado')),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.all(12),
                            child: SelectableText(
                              _selectedFile!.content,
                              style: const TextStyle(
                                color: Color(0xFFE2E8F0),
                                fontFamily: 'monospace',
                                fontSize: 11.5,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

