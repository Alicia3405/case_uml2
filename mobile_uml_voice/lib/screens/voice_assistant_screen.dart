import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';
import '../services/stt_service.dart';
import '../widgets/collab_insights_sheet.dart';
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
    '¿Qué clases o atributos faltan y qué reglas OMT debo corregir?',
    'Audita relaciones y compatibilidad Spring Boot del diagrama',
    'Resume qué avanzó el equipo en esta sesión',
    'Crea un sistema de biblioteca con Libro, Socio, Prestamo y Categoría usando herencia y composición',
    'Agrega una clase Factura con id UUID, fecha LocalDate y montoTotal BigDecimal',
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

  AiPromptMode _effectiveMode(ProjectProvider provider) {
    if (provider.isReadOnly &&
        (provider.selectedAiMode == AiPromptMode.mutate ||
            provider.selectedAiMode == AiPromptMode.auto)) {
      return AiPromptMode.advise;
    }
    return provider.selectedAiMode;
  }

  Future<void> _submitPrompt(String raw) async {
    final text = raw.trim();
    if (text.isEmpty) return;

    final provider = context.read<ProjectProvider>();
    if (_useGenerativeAi || provider.isReadOnly) {
      final mode = _effectiveMode(provider);
      final ok = await provider.executeAiPrompt(
        text,
        isAudio: true,
        mode: mode,
      );
      if (ok && mounted) {
        final mutated =
            (provider.latestAiIntentMode ?? '').toUpperCase() == 'MUTATE';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(mutated
                ? '✨ Arquitectura UML actualizada en el lienzo'
                : '💡 Respuesta del Copiloto IA (${provider.latestAiIntentMode ?? mode.label})'),
            backgroundColor: const Color(0xFF047857),
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
    final useAi = _useGenerativeAi || provider.isReadOnly;
    final activeMode = _effectiveMode(provider);

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
            tooltip: 'Configurar runtime Ollama / Google Colab',
            icon: const Icon(Icons.tune, color: Color(0xFFA78BFA)),
            onPressed: () => showOllamaConfigDialog(context, provider),
          ),
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
            selected: {useAi},
            onSelectionChanged: (vals) {
              if (!vals.first && provider.isReadOnly) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Modo solo lectura: usa Canal 1 en modos Opinar, Revisar, OMT o Resumen.',
                    ),
                  ),
                );
                return;
              }
              setState(() => _useGenerativeAi = vals.first);
            },
          ),
          if (useAi) ...[
            if (provider.availableAiModels.isNotEmpty) ...[
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
            const SizedBox(height: 8),
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: AiPromptMode.values.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (_, i) {
                  final mode = AiPromptMode.values[i];
                  final disabled =
                      provider.isReadOnly && mode == AiPromptMode.mutate;
                  return ChoiceChip(
                    selected: activeMode == mode,
                    label: Text(
                      mode.label,
                      style: TextStyle(
                        fontSize: 11,
                        color: disabled ? Colors.white30 : null,
                      ),
                    ),
                    onSelected: disabled
                        ? null
                        : (_) => provider.setSelectedAiMode(mode),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilterChip(
                  selected: provider.broadcastAiToRoom,
                  label: const Text('Difundir chat',
                      style: TextStyle(fontSize: 11)),
                  onSelected: provider.setBroadcastAiToRoom,
                ),
                if (!provider.isReadOnly)
                  FilterChip(
                    selected: provider.createAiWhiteboardNotes,
                    label: const Text('Notas pizarra',
                        style: TextStyle(fontSize: 11)),
                    onSelected: provider.setCreateAiWhiteboardNotes,
                  ),
                if (diagram != null && provider.openAiAnnotations.isNotEmpty)
                  ActionChip(
                    backgroundColor: const Color(0xFF422006),
                    label: Text(
                      '💡 ${provider.openAiAnnotations.length} nota(s) pizarra',
                      style: const TextStyle(
                          color: Color(0xFFFDE68A), fontSize: 11),
                    ),
                    onPressed: () => showCollabInsightsSheet(
                      context,
                      provider,
                      initialTab: 2,
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 18),
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (provider.latestAiIntentMode != null) ...[
                  Text(
                    'Modo detectado: ${provider.latestAiIntentMode}',
                    style: const TextStyle(
                      color: Color(0xFFA78BFA),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                Text(
                  provider.voiceDialogue,
                  style: const TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontSize: 13.5,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          if (provider.latestDisciplineAlerts.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text(
              'Alertas de Disciplina OMT / Spring:',
              style: TextStyle(
                  color: Color(0xFFFBBF24),
                  fontSize: 12,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            ...provider.latestDisciplineAlerts.map(
              (alert) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: const Color(0xFF1F160A),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.55)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.rule_folder_outlined,
                            color: Color(0xFFFBBF24), size: 16),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '${alert.code}${alert.className != null ? " • ${alert.className}" : ""}',
                            style: const TextStyle(
                              color: Color(0xFFFDE68A),
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      alert.message,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                    if (alert.suggestedPrompt != null &&
                        !provider.isReadOnly) ...[
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: provider.isBusy
                              ? null
                              : () => provider.executeAiPrompt(
                                    alert.suggestedPrompt!,
                                    isAudio: false,
                                    mode: AiPromptMode.mutate,
                                  ),
                          icon: const Icon(Icons.auto_fix_high, size: 15),
                          label: const Text('Aplicar corrección',
                              style: TextStyle(fontSize: 11.5)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          if (provider.latestAiSuggestions.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text(
              'Sugerencias del Copiloto IA:',
              style: TextStyle(
                  color: Color(0xFF38BDF8),
                  fontSize: 12,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            ...provider.latestAiSuggestions.map(
              (sug) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: const Color(0xFF38BDF8).withValues(alpha: 0.45)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      sug.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      sug.message,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                    if (sug.suggestedPrompt != null && !provider.isReadOnly) ...[
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerRight,
                        child: OutlinedButton.icon(
                          onPressed: provider.isBusy
                              ? null
                              : () => provider.executeAiPrompt(
                                    sug.suggestedPrompt!,
                                    isAudio: false,
                                    mode: AiPromptMode.mutate,
                                  ),
                          icon: const Icon(Icons.auto_awesome, size: 14),
                          label: const Text('Aplicar sugerencia',
                              style: TextStyle(fontSize: 11.5)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _promptCtrl,
                  minLines: 1,
                  maxLines: 3,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: useAi
                        ? 'Consulta al Copiloto o dicta tu arquitectura UML...'
                        : 'Dicta un comando atómico UML...',
                    hintStyle: const TextStyle(color: Colors.white38),
                    border: const OutlineInputBorder(),
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
                onPressed: provider.isBusy
                    ? null
                    : () {
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

