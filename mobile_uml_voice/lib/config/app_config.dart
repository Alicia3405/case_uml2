import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Configuración central de red y endpoints para el backend NestJS de CASE Studio AI.
class AppConfig {
  static const String _prefServerUrlKey = 'casestudio_server_url_v1';

  static String get defaultServerOrigin {
    if (kIsWeb) {
      return 'http://localhost:3000';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  static final List<String> serverPresets = [
    'http://localhost:3000',
    'http://10.0.2.2:3000',
    'http://192.168.1.100:3000',
  ];

  static String normalizeOrigin(String raw) {
    var trimmed = raw.trim();
    if (trimmed.isEmpty) return defaultServerOrigin;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'http://$trimmed';
    }
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    if (trimmed.endsWith('/api')) {
      trimmed = trimmed.substring(0, trimmed.length - 4);
    }
    return trimmed;
  }

  static Future<String> loadServerOrigin() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefServerUrlKey);
      if (saved != null && saved.trim().isNotEmpty) {
        return normalizeOrigin(saved);
      }
    } catch (_) {}
    return defaultServerOrigin;
  }

  static Future<void> saveServerOrigin(String origin) async {
    final normalized = normalizeOrigin(origin);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefServerUrlKey, normalized);
  }
}

