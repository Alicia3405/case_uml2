import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  final int? statusCode;
  final String message;

  ApiException(this.message, {this.statusCode});

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;

  @override
  String toString() => message;
}

/// Cliente HTTP central para el backend NestJS (`/api/...`), con soporte para:
/// - Desenvolver `TransformInterceptor` (`{ statusCode, data, timestamp }`)
/// - Extracción de mensajes del `HttpExceptionFilter`
/// - Peticiones binarias (`.zip`) y XML (`.xmi`)
class ApiClient {
  final http.Client _http;
  String _serverOrigin;
  String? _accessToken;

  ApiClient({
    http.Client? httpClient,
    String? initialServerOrigin,
  })  : _http = httpClient ?? http.Client(),
        _serverOrigin = initialServerOrigin ?? AppConfig.defaultServerOrigin;

  String get serverOrigin => _serverOrigin;
  String get apiBaseUrl => '$_serverOrigin/api';
  String get socketUrl => '$_serverOrigin/collaboration';
  String? get accessToken => _accessToken;

  void setServerOrigin(String origin) {
    _serverOrigin = AppConfig.normalizeOrigin(origin);
  }

  void setAccessToken(String? token) {
    _accessToken = (token == null || token.trim().isEmpty) ? null : token.trim();
  }

  Uri _buildUri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBaseUrl$normalizedPath');
  }

  Map<String, String> _jsonHeaders({bool includeAuth = true}) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (includeAuth && _accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    return headers;
  }

  /// Extrae el campo `data` del envelope estándar de NestJS `TransformInterceptor`.
  static dynamic unwrapEnvelope(dynamic decoded) {
    if (decoded is Map<String, dynamic> &&
        decoded.containsKey('data') &&
        decoded.containsKey('statusCode')) {
      return decoded['data'];
    }
    if (decoded is Map && decoded.containsKey('data') && decoded.containsKey('statusCode')) {
      return decoded['data'];
    }
    return decoded;
  }

  static String extractErrorMessage(http.Response response) {
    try {
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is Map) {
        final errorObj = decoded['error'];
        if (errorObj is Map && errorObj['message'] != null) {
          final m = errorObj['message'];
          return m is List ? m.join(', ') : m.toString();
        }
        final msg = decoded['message'];
        if (msg != null) {
          return msg is List ? msg.join(', ') : msg.toString();
        }
      }
    } catch (_) {}
    return 'Error HTTP ${response.statusCode}';
  }

  dynamic _handleJsonResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.bodyBytes.isEmpty) return null;
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      return unwrapEnvelope(decoded);
    }
    throw ApiException(
      extractErrorMessage(response),
      statusCode: response.statusCode,
    );
  }

  Future<dynamic> getJson(String path, {bool includeAuth = true}) async {
    final res = await _http
        .get(_buildUri(path), headers: _jsonHeaders(includeAuth: includeAuth))
        .timeout(const Duration(seconds: 15));
    return _handleJsonResponse(res);
  }

  Future<dynamic> postJson(
    String path,
    Object? body, {
    bool includeAuth = true,
    Duration timeout = const Duration(seconds: 25),
  }) async {
    final res = await _http
        .post(
          _buildUri(path),
          headers: _jsonHeaders(includeAuth: includeAuth),
          body: body == null ? null : jsonEncode(body),
        )
        .timeout(timeout);
    return _handleJsonResponse(res);
  }

  Future<dynamic> putJson(String path, Object? body) async {
    final res = await _http
        .put(
          _buildUri(path),
          headers: _jsonHeaders(),
          body: body == null ? null : jsonEncode(body),
        )
        .timeout(const Duration(seconds: 20));
    return _handleJsonResponse(res);
  }

  Future<dynamic> patchJson(String path, Object? body) async {
    final res = await _http
        .patch(
          _buildUri(path),
          headers: _jsonHeaders(),
          body: body == null ? null : jsonEncode(body),
        )
        .timeout(const Duration(seconds: 15));
    return _handleJsonResponse(res);
  }

  Future<dynamic> deleteJson(String path) async {
    final res = await _http
        .delete(_buildUri(path), headers: _jsonHeaders())
        .timeout(const Duration(seconds: 15));
    return _handleJsonResponse(res);
  }

  Future<Uint8List> postRawBytes(String path, Object? body) async {
    final res = await _http
        .post(
          _buildUri(path),
          headers: {
            'Content-Type': 'application/json',
            if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
          },
          body: body == null ? '{}' : jsonEncode(body),
        )
        .timeout(const Duration(seconds: 40));

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.bodyBytes;
    }
    throw ApiException(
      extractErrorMessage(res),
      statusCode: res.statusCode,
    );
  }

  Future<String> getRawText(String path) async {
    final res = await _http
        .get(
          _buildUri(path),
          headers: {
            if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
          },
        )
        .timeout(const Duration(seconds: 25));

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return utf8.decode(res.bodyBytes);
    }
    throw ApiException(
      extractErrorMessage(res),
      statusCode: res.statusCode,
    );
  }
}

