import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../models/auth_models.dart';
import 'api_client.dart';

/// Servicio real de autenticación contra `/api/auth/login`, `/register` y `/me`.
class AuthService extends ChangeNotifier {
  static const String _prefTokenKey = 'casestudio_jwt_token_v1';
  static const String _prefUserKey = 'casestudio_user_v1';

  final ApiClient apiClient;

  AppUser? _currentUser;
  String? _errorMessage;
  bool _isLoading = false;
  bool _isInitialized = false;

  AuthService({ApiClient? client}) : apiClient = client ?? ApiClient();

  AppUser? get currentUser => _currentUser;
  String? get errorMessage => _errorMessage;
  bool get isLoading => _isLoading;
  bool get isInitialized => _isInitialized;
  bool get isAuthenticated => _currentUser != null && apiClient.accessToken != null;
  String get serverOrigin => apiClient.serverOrigin;

  Future<void> init() async {
    if (_isInitialized) return;
    final origin = await AppConfig.loadServerOrigin();
    apiClient.setServerOrigin(origin);

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(_prefTokenKey);
      final cachedUserRaw = prefs.getString(_prefUserKey);

      if (token != null && token.isNotEmpty) {
        apiClient.setAccessToken(token);
        if (cachedUserRaw != null && cachedUserRaw.isNotEmpty) {
          _currentUser = AppUser.fromJson(
            Map<String, dynamic>.from(jsonDecode(cachedUserRaw) as Map),
          );
        }

        // Validar sesión contra backend si hay conectividad
        try {
          final meData = await apiClient.getJson('/auth/me');
          if (meData is Map) {
            _currentUser = AppUser.fromJson(Map<String, dynamic>.from(meData));
            await prefs.setString(_prefUserKey, jsonEncode(_currentUser!.toJson()));
          }
        } on ApiException catch (e) {
          if (e.isUnauthorized) {
            await logout();
          }
        } catch (_) {
          // Offline: conservar caché local hasta reconectar
        }
      }
    } catch (_) {}

    _isInitialized = true;
    notifyListeners();
  }

  Future<void> setServerOrigin(String newOrigin) async {
    final normalized = AppConfig.normalizeOrigin(newOrigin);
    apiClient.setServerOrigin(normalized);
    await AppConfig.saveServerOrigin(normalized);
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final data = await apiClient.postJson(
        '/auth/login',
        {'email': email.trim(), 'password': password},
        includeAuth: false,
      );
      await _applyAuthPayload(data);
      return true;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return false;
    } catch (e) {
      _errorMessage =
          'No se pudo conectar con ${apiClient.serverOrigin}. Verifica que el backend esté activo.';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> register(String fullName, String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final data = await apiClient.postJson(
        '/auth/register',
        {
          'fullName': fullName.trim(),
          'email': email.trim(),
          'password': password,
        },
        includeAuth: false,
      );
      await _applyAuthPayload(data);
      return true;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return false;
    } catch (_) {
      _errorMessage =
          'No se pudo conectar con ${apiClient.serverOrigin} para registrar la cuenta.';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateProfile({String? fullName, String? password}) async {
    _errorMessage = null;
    final payload = <String, dynamic>{};
    if (fullName != null && fullName.trim().isNotEmpty) {
      payload['fullName'] = fullName.trim();
    }
    if (password != null && password.trim().isNotEmpty) {
      payload['password'] = password.trim();
    }
    if (payload.isEmpty) return false;

    try {
      final updated = await apiClient.patchJson('/auth/me', payload);
      if (updated is Map) {
        _currentUser = AppUser.fromJson(Map<String, dynamic>.from(updated));
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefUserKey, jsonEncode(_currentUser!.toJson()));
        notifyListeners();
      }
      return true;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _errorMessage = 'No se pudo actualizar el perfil (sin conexión).';
      notifyListeners();
      return false;
    }
  }

  Future<void> _applyAuthPayload(dynamic data) async {
    if (data is! Map) {
      throw ApiException('Respuesta de autenticación inválida del servidor.');
    }
    final token = (data['accessToken'] ?? '').toString();
    final rawUser = data['user'];
    if (token.isEmpty || rawUser is! Map) {
      throw ApiException('Falta token JWT o datos de usuario.');
    }

    final user = AppUser.fromJson(Map<String, dynamic>.from(rawUser));
    apiClient.setAccessToken(token);
    _currentUser = user;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefTokenKey, token);
    await prefs.setString(_prefUserKey, jsonEncode(user.toJson()));
  }

  Future<void> logout() async {
    _currentUser = null;
    _errorMessage = null;
    apiClient.setAccessToken(null);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefTokenKey);
      await prefs.remove(_prefUserKey);
    } catch (_) {}
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}

