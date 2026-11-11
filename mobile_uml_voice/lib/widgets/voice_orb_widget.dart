import 'package:flutter/material.dart';

/// Orbe visual interactivo con onda radial animada para el asistente Voice-First.
class VoiceOrbWidget extends StatefulWidget {
  final bool isListening;
  final bool isBusy;
  final VoidCallback onTap;

  const VoiceOrbWidget({
    super.key,
    required this.isListening,
    this.isBusy = false,
    required this.onTap,
  });

  @override
  State<VoiceOrbWidget> createState() => _VoiceOrbWidgetState();
}

class _VoiceOrbWidgetState extends State<VoiceOrbWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeColor = widget.isBusy
        ? const Color(0xFF8B5CF6)
        : widget.isListening
            ? const Color(0xFFEF4444)
            : const Color(0xFF38BDF8);

    return GestureDetector(
      onTap: widget.isBusy ? null : widget.onTap,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final pulse = widget.isListening || widget.isBusy
              ? (1.0 + _controller.value * 0.25)
              : (1.0 + _controller.value * 0.08);
          return Container(
            width: 176,
            height: 176,
            alignment: Alignment.center,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Transform.scale(
                  scale: pulse * 1.18,
                  child: Container(
                    width: 122,
                    height: 122,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: activeColor.withValues(alpha: 0.14),
                    ),
                  ),
                ),
                Transform.scale(
                  scale: pulse,
                  child: Container(
                    width: 108,
                    height: 108,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: activeColor.withValues(alpha: 0.45),
                        width: 2,
                      ),
                    ),
                  ),
                ),
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: widget.isBusy
                          ? const [Color(0xFF8B5CF6), Color(0xFF6366F1)]
                          : widget.isListening
                              ? const [Color(0xFFEF4444), Color(0xFFF97316)]
                              : const [Color(0xFF38BDF8), Color(0xFF3B82F6)],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: activeColor.withValues(alpha: 0.48),
                        blurRadius: 24,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: widget.isBusy
                      ? const Padding(
                          padding: EdgeInsets.all(26),
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 3,
                          ),
                        )
                      : Icon(
                          widget.isListening ? Icons.graphic_eq : Icons.mic_rounded,
                          size: 44,
                          color: Colors.white,
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

