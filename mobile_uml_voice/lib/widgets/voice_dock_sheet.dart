import 'package:flutter/material.dart';
import '../providers/project_provider.dart';
import '../services/stt_service.dart';

/// Dock rápido de comandos atómicos de voz (Canal 2 offline-first) desde el Lienzo.
Future<void> showVoiceDockSheet(
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
    builder: (ctx) => _VoiceDockBody(provider: provider),
  );
}

class _VoiceDockBody extends StatefulWidget {
  final ProjectProvider provider;
  const _VoiceDockBody({required this.provider});

  @override
  State<_VoiceDockBody> createState() => _VoiceDockBodyState();
}

class _VoiceDockBodyState extends State<_VoiceDockBody> {
  final _stt = SttService();
  final _textCtrl = TextEditingController();
  bool _isListening = false;
  bool _useAiCopilot = false;
  String _feedback = 'Dicta un comando UML o escríbelo abajo.';

  static const _quickCommands = [
    'Crear clase Factura',
    'Crear interfaz Pagable',
    'Crear enum EstadoFactura',
    'Agregar atributo monto tipo BigDecimal a Factura',
    'Conectar Cliente con Factura',
    'Deshacer',
  ];

  @override
  void dispose() {
    _stt.stop();
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _toggleMic() async {
    if (_isListening) {
      await _stt.stop();
      setState(() => _isListening = false);
      return;
    }

    setState(() {
      _isListening = true;
      _feedback = 'Escuchando tu comando en español...';
    });

    final ok = await _stt.listen(
      onResult: (words) {
        if (!mounted) return;
        setState(() => _textCtrl.text = words);
      },
      onDone: () {
        if (!mounted) return;
        setState(() => _isListening = false);
        if (_textCtrl.text.trim().isNotEmpty) {
          _runCommand(_textCtrl.text.trim());
        }
      },
    );

    if (!ok && mounted) {
      setState(() {
        _isListening = false;
        _feedback =
            'Micrófono no disponible aquí. Escribe o usa un acceso rápido abajo.';
      });
    }
  }

  Future<void> _runCommand(String text) async {
    if (text.trim().isEmpty) return;
    if (_useAiCopilot) {
      setState(() => _feedback = 'Consultando Copiloto IA...');
      final ok = await widget.provider.executeAiPrompt(text, isAudio: true);
      if (!mounted) return;
      setState(() {
        _feedback = ok
            ? widget.provider.voiceDialogue
            : (widget.provider.lastError ?? 'No se pudo aplicar IA');
      });
    } else {
      final res = await widget.provider.executeAtomicVoiceCommand(text);
      if (!mounted) return;
      setState(() => _feedback = res.speechResponse);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.mic_rounded, color: Color(0xFF38BDF8)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Voice Dock UML',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700),
                ),
              ),
              FilterChip(
                selected: _useAiCopilot,
                label: Text(_useAiCopilot ? 'Canal 1: IA' : 'Canal 2: Atómico'),
                onSelected: (v) => setState(() => _useAiCopilot = v),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              _feedback,
              style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12.5),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _textCtrl,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: 'Ej: Crear clase Producto',
                    hintStyle: TextStyle(color: Colors.white38),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onSubmitted: _runCommand,
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                style: IconButton.styleFrom(
                  backgroundColor: _isListening
                      ? Colors.redAccent
                      : const Color(0xFF38BDF8),
                  foregroundColor: const Color(0xFF0F172A),
                ),
                onPressed: _toggleMic,
                icon: Icon(_isListening ? Icons.stop : Icons.mic),
              ),
              const SizedBox(width: 4),
              IconButton.filledTonal(
                onPressed: () => _runCommand(_textCtrl.text),
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _quickCommands.map((cmd) {
              return ActionChip(
                backgroundColor: const Color(0xFF1E293B),
                label: Text(cmd,
                    style: const TextStyle(color: Colors.white70, fontSize: 11)),
                onPressed: () {
                  _textCtrl.text = cmd;
                  _runCommand(cmd);
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

