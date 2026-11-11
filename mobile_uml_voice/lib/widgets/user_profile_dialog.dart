import 'package:flutter/material.dart';
import '../services/auth_service.dart';

/// Diálogo de perfil conectado a `PATCH /api/auth/me` y cierre de sesión.
Future<void> showUserProfileDialog(
  BuildContext context,
  AuthService authService,
) async {
  final user = authService.currentUser;
  if (user == null) return;

  final nameCtrl = TextEditingController(text: user.fullName);
  final passCtrl = TextEditingController();
  final serverCtrl = TextEditingController(text: authService.serverOrigin);

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      title: Row(
        children: [
          CircleAvatar(
            backgroundColor: const Color(0xFF38BDF8),
            child: Text(user.initials,
                style: const TextStyle(
                    color: Color(0xFF0F172A), fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.fullName,
                    style: const TextStyle(color: Colors.white, fontSize: 15)),
                Text(user.email,
                    style: const TextStyle(color: Colors.white60, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Nombre completo',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: passCtrl,
              obscureText: true,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Nueva contraseña (opcional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: serverCtrl,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
              decoration: const InputDecoration(
                labelText: 'Servidor Backend API',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: () async {
            Navigator.pop(ctx);
            await authService.logout();
          },
          icon: const Icon(Icons.logout, color: Colors.redAccent),
          label: const Text('Cerrar Sesión',
              style: TextStyle(color: Colors.redAccent)),
        ),
        ElevatedButton(
          onPressed: () async {
            if (serverCtrl.text.trim().isNotEmpty &&
                serverCtrl.text.trim() != authService.serverOrigin) {
              await authService.setServerOrigin(serverCtrl.text.trim());
            }
            final ok = await authService.updateProfile(
              fullName: nameCtrl.text.trim(),
              password: passCtrl.text.trim().isEmpty ? null : passCtrl.text.trim(),
            );
            if (!ctx.mounted) return;
            Navigator.pop(ctx);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(ok
                    ? 'Perfil actualizado'
                    : (authService.errorMessage ?? 'Sin cambios aplicados')),
              ),
            );
          },
          child: const Text('Guardar'),
        ),
      ],
    ),
  );
}

