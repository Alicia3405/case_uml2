import 'package:flutter/material.dart';
import '../providers/project_provider.dart';
import '../services/file_picker_helper.dart';

/// Escáner multimodal de pizarras o bocetos UML hacia `POST /api/ai/vision-diagram`.
Future<void> showVisionScannerSheet(
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
    builder: (ctx) => _VisionScannerBody(provider: provider),
  );
}

class _VisionScannerBody extends StatefulWidget {
  final ProjectProvider provider;
  const _VisionScannerBody({required this.provider});

  @override
  State<_VisionScannerBody> createState() => _VisionScannerBodyState();
}

class _VisionScannerBodyState extends State<_VisionScannerBody> {
  PickedImagePayload? _picked;
  final _hintCtrl = TextEditingController();
  bool _processing = false;

  @override
  void dispose() {
    _hintCtrl.dispose();
    super.dispose();
  }

  Future<void> _selectImage(bool fromCamera) async {
    try {
      final result = await FilePickerHelper.pickImage(fromCamera: fromCamera);
      if (result != null && mounted) {
        setState(() => _picked = result);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo obtener la imagen: $e')),
      );
    }
  }

  Future<void> _analyze() async {
    if (_picked == null) return;
    setState(() => _processing = true);

    final ok = await widget.provider.executeVisionDigitization(
      imageBase64: _picked!.base64Data,
      mimeType: _picked!.mimeType,
      prompt: _hintCtrl.text.trim(),
    );

    if (!mounted) return;
    setState(() => _processing = false);

    if (ok) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('📷 Pizarra digitalizada con Gemini Vision AI'),
          backgroundColor: Color(0xFF047857),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.provider.lastError ?? 'Error en Vision AI'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 22,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.camera_alt_rounded, color: Color(0xFF38BDF8)),
                SizedBox(width: 8),
                Text(
                  'Vision AI — Pizarra a Diagrama UML',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Captura una foto de un diagrama hecho a mano o selecciona una imagen de tu galería para convertirlo en clases JPA editables.',
              style: TextStyle(color: Colors.white70, fontSize: 12.5),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _processing ? null : () => _selectImage(true),
                    icon: const Icon(Icons.photo_camera),
                    label: const Text('Cámara'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _processing ? null : () => _selectImage(false),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Galería'),
                  ),
                ),
              ],
            ),
            if (_picked != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.memory(
                  _picked!.bytes,
                  height: 180,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _hintCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Instrucción adicional (opcional)',
                  hintText: 'Ej: Mantener entidades existentes y agregar relaciones',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              ElevatedButton.icon(
                onPressed: _processing ? null : _analyze,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF8B5CF6),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                icon: _processing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.auto_awesome),
                label: Text(_processing
                    ? 'Analizando con Gemini Vision...'
                    : 'Digitalizar Diagrama UML'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

