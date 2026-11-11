import 'package:flutter/material.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';
import '../services/stt_service.dart';

/// Dock rápido de voz desde el Lienzo:
/// - Canal 2: Comandos atómicos offline-first
/// - Canal 1: Copiloto IA generativo y consultivo (Opinar, Revisar, OMT, Resumen)
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
  late bool _useAiCopilot;
  String _feedback = 'Dicta un comando UML o consulta al Copiloto IA.';

  static const _quickCommands = [
    'Crear clase Factura',
    'Crear interfaz Pagable',
    'Crear enum EstadoFactura',
    'Agregar atributo monto tipo BigDecimal a Factura',
    'Conectar Cliente con Factura',
    'Deshacer',
  ];

  static const _consultativeQuickCommands = [
    '¿Qué clases o atributos faltan?',
    'Revisa tipos JPA y multiplicidades',
    'Audita reglas OMT y relaciones',
    'Resume qué avanzó el equipo',
  ];

  @override
  void initState() {
    super.initState();
    _useAiCopilot = widget.provider.isReadOnly;
    if (widget.provider.isReadOnly) {
      _feedback =
          'Modo consultivo VIEWER: pregunta al Copiloto IA (Opinar, Revisar, OMT o Resumen).';
    }
  }

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

  AiPromptMode _effectiveMode() {
    final current = widget.provider.selectedAiMode;
    if (widget.provider.isReadOnly &&
        (current == AiPromptMode.mutate || current == AiPromptMode.auto)) {
      return AiPromptMode.advise;
    }
    return current;
  }

  Future<void> _runCommand(String text) async {
    if (text.trim().isEmpty) return;
    if (_useAiCopilot || widget.provider.isReadOnly) {
      final mode = _effectiveMode();
      setState(() =>
          _feedback = 'Consultando Copiloto IA (${mode.label})...');
      final ok = await widget.provider.executeAiPrompt(
        text,
        isAudio: true,
        mode: mode,
      );
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
    return AnimatedBuilder(
      animation: widget.provider,
      builder: (context, _) {
        final isReadOnly = widget.provider.isReadOnly;
        final useAi = _useAiCopilot || isReadOnly;
        final activeMode = _effectiveMode();
        final chips =
            useAi ? _consultativeQuickCommands : _quickCommands;

        return Padding(
          padding: EdgeInsets.only(
            left: 18,
            right: 18,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      useAi ? Icons.auto_awesome : Icons.mic_rounded,
                      color: useAi
                          ? const Color(0xFFA78BFA)
                          : const Color(0xFF38BDF8),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        isReadOnly
                            ? 'Copiloto IA (Solo Lectura)'
                            : 'Voice Dock UML',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (!isReadOnly)
                      FilterChip(
                        selected: _useAiCopilot,
                        label: Text(
                            _useAiCopilot ? 'Canal 1: IA' : 'Canal 2: Atómico'),
                        onSelected: (v) => setState(() => _useAiCopilot = v),
                      ),
                  ],
                ),
                if (useAi) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: AiPromptMode.values.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 6),
                      itemBuilder: (_, i) {
                        final m = AiPromptMode.values[i];
                        final disabled =
                            isReadOnly && m == AiPromptMode.mutate;
                        return ChoiceChip(
                          selected: activeMode == m,
                          label: Text(
                            m.label,
                            style: TextStyle(
                              fontSize: 11,
                              color: disabled ? Colors.white30 : null,
                            ),
                          ),
                          onSelected: disabled
                              ? null
                              : (_) => widget.provider.setSelectedAiMode(m),
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _feedback,
                    style: const TextStyle(
                        color: Color(0xFFCBD5E1), fontSize: 12.5),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: useAi
                              ? 'Pregunta al Copiloto o pide un cambio...'
                              : 'Ej: Crear clase Producto',
                          hintStyle: const TextStyle(color: Colors.white38),
                          border: const OutlineInputBorder(),
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
                      onPressed: widget.provider.isBusy
                          ? null
                          : () => _runCommand(_textCtrl.text),
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: chips.map((cmd) {
                    return ActionChip(
                      backgroundColor: const Color(0xFF1E293B),
                      label: Text(cmd,
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 11)),
                      onPressed: widget.provider.isBusy
                          ? null
                          : () {
                              _textCtrl.text = cmd;
                              _runCommand(cmd);
                            },
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

