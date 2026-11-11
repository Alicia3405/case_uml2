import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_config.dart';
import '../models/auth_models.dart';
import '../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController(text: 'cesar@uagrm.edu.bo');
  final _passCtrl = TextEditingController(text: 'Pass1234!');

  bool _isRegister = false;
  bool _obscurePass = true;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final auth = context.read<AuthService>();
    if (_isRegister) {
      await auth.register(
        _nameCtrl.text.trim(),
        _emailCtrl.text.trim(),
        _passCtrl.text,
      );
    } else {
      await auth.login(_emailCtrl.text.trim(), _passCtrl.text);
    }
  }

  void _fillDemo(DemoAccountSpec spec) {
    setState(() {
      _isRegister = false;
      _emailCtrl.text = spec.email;
      _passCtrl.text = spec.password;
    });
    context.read<AuthService>().clearError();
  }

  Future<void> _configureServerDialog() async {
    final auth = context.read<AuthService>();
    final ctrl = TextEditingController(text: auth.serverOrigin);

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Configurar Servidor NestJS',
            style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: ctrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'URL Base del Backend',
                hintText: 'http://10.0.2.2:3000',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: AppConfig.serverPresets.map((preset) {
                return ActionChip(
                  backgroundColor: const Color(0xFF1E293B),
                  label: Text(preset,
                      style: const TextStyle(color: Colors.white70, fontSize: 11)),
                  onPressed: () => ctrl.text = preset,
                );
              }).toList(),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () async {
              await auth.setServerOrigin(ctrl.text);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Guardar URL'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return Scaffold(
      backgroundColor: const Color(0xFF090D16),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFF1E293B)),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF38BDF8).withValues(alpha: 0.08),
                      blurRadius: 30,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFF38BDF8), Color(0xFF6366F1)],
                              ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.schema_rounded,
                                color: Colors.white, size: 26),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'CASE Studio AI',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  'Modelado UML • Voz • WebSocket',
                                  style: TextStyle(
                                    color: Color(0xFF94A3B8),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            tooltip: 'Configurar servidor (${auth.serverOrigin})',
                            icon: const Icon(Icons.dns_outlined,
                                color: Color(0xFF38BDF8)),
                            onPressed: _configureServerDialog,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(
                              value: false, label: Text('Iniciar Sesión')),
                          ButtonSegment(
                              value: true, label: Text('Crear Cuenta')),
                        ],
                        selected: {_isRegister},
                        onSelectionChanged: (vals) {
                          setState(() => _isRegister = vals.first);
                          auth.clearError();
                        },
                      ),
                      const SizedBox(height: 16),
                      if (auth.errorMessage != null)
                        Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: Colors.redAccent.withValues(alpha: 0.45)),
                          ),
                          child: Text(
                            auth.errorMessage!,
                            style: const TextStyle(
                                color: Color(0xFFFCA5A5), fontSize: 12.5),
                          ),
                        ),
                      if (_isRegister) ...[
                        TextFormField(
                          controller: _nameCtrl,
                          style: const TextStyle(color: Colors.white),
                          decoration: const InputDecoration(
                            labelText: 'Nombre completo',
                            prefixIcon: Icon(Icons.person_outline),
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) => (v == null || v.trim().length < 2)
                              ? 'Ingresa tu nombre completo'
                              : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Correo institucional / personal',
                          prefixIcon: Icon(Icons.email_outlined),
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) => (v == null || !v.contains('@'))
                            ? 'Correo inválido'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _passCtrl,
                        obscureText: _obscurePass,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Contraseña',
                          prefixIcon: const Icon(Icons.lock_outline),
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(
                            icon: Icon(_obscurePass
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined),
                            onPressed: () =>
                                setState(() => _obscurePass = !_obscurePass),
                          ),
                        ),
                        validator: (v) => (v == null || v.length < 6)
                            ? 'Mínimo 6 caracteres'
                            : null,
                        onFieldSubmitted: (_) => _submit(),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: auth.isLoading ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF38BDF8),
                          foregroundColor: const Color(0xFF090D16),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: auth.isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(
                                _isRegister ? 'Registrarme' : 'Ingresar',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 15),
                              ),
                      ),
                      const SizedBox(height: 18),
                      const Divider(color: Color(0xFF1E293B)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Cuentas Demo Colaboración (Pass: Pass1234!)',
                              style: TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Text(
                            auth.serverOrigin,
                            style: const TextStyle(
                                color: Color(0xFF475569), fontSize: 10),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      GridView.count(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisCount: 2,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 2.35,
                        children: DemoAccountSpec.defaults.map((spec) {
                          return InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => _fillDemo(spec),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E293B),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: _emailCtrl.text.trim() == spec.email
                                      ? const Color(0xFF38BDF8)
                                      : const Color(0xFF334155),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    spec.label,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    spec.roleBadge,
                                    style: const TextStyle(
                                      color: Color(0xFF38BDF8),
                                      fontSize: 10,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

