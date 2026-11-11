import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/project_provider.dart';
import '../services/stt_service.dart';
import '../widgets/voice_orb_widget.dart';

class VoiceAssistantScreen extends StatefulWidget {
  final VoidCallback onNavigateToCanvas;
  const VoiceAssistantScreen({super.key, required this.onNavigateToCanvas});

  @override
  State<VoiceAssistantScreen> createState() => _VoiceAssistantScreenState();
}

class _VoiceAssistantScreenState extends State<VoiceAssistantScreen> {
  final _stt = SttService();
  final _promptCtrl = TextEditingController();
  bool _isListening = false;
  bool _useGenerativeAi = true; // true = Canal 1 IA backend, false = Canal 2 atómico

  static const _examples = [
    'Crea un sistema de biblioteca con Libro, Socio, Prestamo y Categoría usando herencia y composición',
    'Agrega una clase Factura con id UUID, fecha LocalDate y montoTotal BigDecimal',
    'Crear interfaz Notificable',
    'Conectar herencia Paciente con Persona',
  ];

  @override
  void dispose() {
    _stt.stop();
    _promptCtrl.dispose();
    super.dispose();
  }

  Future<void> _toggleMic() async {
    if (_isListening) {
      await _stt.stop();
      setState(() => _isListening = false);
      return;
    }

    setState(() => _isListening = true);
    final started = await _stt.listen(
      onResult: (words) {
        if (!mounted) return;
        setState(() => _promptCtrl.text = words);
      },
      onDone: () {
        if (!mounted) return;
        setState(() => _isListening = false);
        if (_promptCtrl.text.trim().isNotEmpty) {
          _submitPrompt(_promptCtrl.text);
        }
      },
    );

    if (!started && mounted) {
      setState(() => _isListening = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Micrófono no disponible o sin permiso. Usa el cuadro de texto o los prompts de ejemplo.'),
        ),
      );
    }
  }

  Future<void> _submitPrompt(String raw) async {
    final text = raw.trim();
    if (text.isEmpty) return;

    final provider = context.read<ProjectProvider>();
    if (_useGenerativeAi) {
      final ok = await provider.executeAiPrompt(text, isAudio: true);
      if (ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✨ Arquitectura UML actualizada en el lienzo'),
            backgroundColor: Color(0xFF047857),
          ),
        );
      }
    } else {
      await provider.executeAtomicVoiceCommand(text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProjectProvider>();
    final diagram = provider.activeDiagram;

    return Scaffold(
      backgroundColor: const Color(0xFF090D16),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Arquitecto Voice-First',
                style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
            Text(
              diagram != null
                  ? '${provider.activeProject?.name ?? ""} • ${diagram.visibleNodes.length} elementos'
                  : 'Selecciona un proyecto primero',
              style: const TextStyle(fontSize: 11, color: Colors.white60),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: provider.ttsService.isMuted ? 'Activar voz TTS' : 'Silenciar voz TTS',
            icon: Icon(
              provider.ttsService.isMuted
                  ? Icons.volume_off_rounded
                  : Icons.volume_up_rounded,
              color: provider.ttsService.isMuted
                  ? Colors.white38
                  : const Color(0xFF38BDF8),
            ),
            onPressed: () {
              setState(() {
                provider.ttsService.isMuted = !provider.ttsService.isMuted;
              });
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          // Selector de Canal Híbrido
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(
                value: true,
                icon: Icon(Icons.auto_awesome, size: 16),
                label: Text('Canal 1: Copiloto IA'),
              ),
              ButtonSegment(
                value: false,
                icon: Icon(Icons.flash_on, size: 16),
                label: Text('Canal 2: Atómico Offline'),
              ),
            ],
            selected: {_useGenerativeAi},
            onSelectionChanged: (vals) =>
                setState(() => _useGenerativeAi = vals.first),
          ),
          if (_useGenerativeAi && provider.availableAiModels.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: provider.availableAiModels.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (ctx, i) {
                  final m = provider.availableAiModels[i];
                  final selected = m.id == provider.selectedAiModel &&
                      m.provider == provider.selectedAiProvider;
                  return ChoiceChip(
                    selected: selected,
                    label: Text(
                      '${m.isLocal ? "🦙 " : "✨ "}${m.name}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    onSelected: (_) => provider.setSelectedAiModel(m),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 20),
          Center(
            child: VoiceOrbWidget(
              isListening: _isListening,
              isBusy: provider.isBusy,
              onTap: _toggleMic,
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              provider.isBusy
                  ? 'Procesando arquitectura UML...'
                  : _isListening
                      ? 'Escuchando tu comando en español...'
                      : 'Toca el Orbe para dictar por voz',
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF111827),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: Text(
              provider.voiceDialogue,
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontSize: 13.5,
                height: 1.4,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _promptCtrl,
                  minLines: 1,
                  maxLines: 3,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: 'Dicta o escribe tu arquitectura UML...',
                    hintStyle: TextStyle(color: Colors.white38),
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xFF38BDF8),
                  foregroundColor: const Color(0xFF090D16),
                ),
                onPressed: provider.isBusy
                    ? null
                    : () => _submitPrompt(_promptCtrl.text),
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Ejemplos listos para probar:',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _examples.map((ex) {
              return ActionChip(
                backgroundColor: const Color(0xFF1E293B),
                label: Text(
                  ex,
                  style: const TextStyle(color: Colors.white70, fontSize: 11.5),
                ),
                onPressed: () {
                  _promptCtrl.text = ex;
                  _submitPrompt(ex);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          if (diagram != null)
            OutlinedButton.icon(
              onPressed: widget.onNavigateToCanvas,
              icon: const Icon(Icons.schema_rounded),
              label: const Text('Abrir en Lienzo UML'),
            ),
        ],
      ),
    );
  }
}

