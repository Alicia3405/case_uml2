import 'package:flutter/material.dart';

/// Guía interactiva rápida del ecosistema móvil Voice-First CASE Studio AI.
Future<void> showTutorialDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      title: const Row(
        children: [
          Icon(Icons.menu_book_rounded, color: Color(0xFF38BDF8)),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Guía Rápida — CASE Studio Mobile',
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ],
      ),
      content: const SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _GuideRow(
              icon: Icons.mic_rounded,
              title: '1. Copiloto IA & Voz Híbrida',
              body:
                  '• Canal 1 (Ollama Local / Cloud): Dicta sistemas completos o usa modos consultivos (Opinar, Revisar, OMT, Resumen) sin alterar el lienzo.\n• Canal 2 (Atómico Offline): Usa comandos rápidos como "Crear clase Factura" o "Conectar herencia Empleado con Persona".',
            ),
            _GuideRow(
              icon: Icons.camera_alt_rounded,
              title: '2. Pizarras a UML (Vision AI)',
              body:
                  'Fotografía un diagrama hecho a mano y Vision AI (Ollama Local-First / Gemini) lo convierte en clases JPA editables.',
            ),
            _GuideRow(
              icon: Icons.group_rounded,
              title: '3. Salas Multi-Día, @IA y Pizarra',
              body:
                  'Colabora en tiempo real con exclusión mutua, menciona @IA o @equipo en el chat, recibe alertas OMT y retoma trabajo con checkpoints y notas de pizarra.',
            ),
            _GuideRow(
              icon: Icons.code_rounded,
              title: '4. Spring Boot 3.4, Flutter y XMI 2.1',
              body:
                  'Genera proyectos completos en ZIP o intercambia XML XMI con Enterprise Architect.',
            ),
          ],
        ),
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Entendido'),
        ),
      ],
    ),
  );
}

class _GuideRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _GuideRow({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: const Color(0xFF38BDF8)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  body,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

