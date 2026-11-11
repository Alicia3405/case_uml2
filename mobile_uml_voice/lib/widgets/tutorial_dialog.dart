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
              title: '1. Voz Híbrida (2 Canales)',
              body:
                  '• Canal 1 (IA Cloud/Ollama): Describe un sistema completo en voz alta para generar entidades, relaciones y notas.\n• Canal 2 (Atómico Offline): Usa comandos rápidos como "Crear clase Factura" o "Conectar herencia Empleado con Persona".',
            ),
            _GuideRow(
              icon: Icons.camera_alt_rounded,
              title: '2. Pizarras a UML (Vision AI)',
              body:
                  'Fotografía un diagrama hecho a mano y Gemini Vision lo convierte en clases JPA editables.',
            ),
            _GuideRow(
              icon: Icons.group_rounded,
              title: '3. WebSocket en Tiempo Real',
              body:
                  'Al editar una clase en el lienzo, se bloquea con exclusión mutua para el resto del equipo. Soporta roles OWNER, EDITOR y VIEWER + chat y bitácora.',
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

