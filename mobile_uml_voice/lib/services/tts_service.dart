import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// Servicio de Síntesis de Voz (TTS) con soporte de silencio.
class TtsService {
  static final TtsService _instance = TtsService._internal();
  factory TtsService() => _instance;
  TtsService._internal();

  FlutterTts? _flutterTts;
  bool _isInitialized = false;
  bool isSpeaking = false;
  bool isMuted = false;

  Future<void> init() async {
    if (_isInitialized) return;
    try {
      _flutterTts = FlutterTts();
      await _flutterTts!.setLanguage('es-ES');
      await _flutterTts!.setPitch(1.0);
      await _flutterTts!.setSpeechRate(0.95);

      _flutterTts!.setStartHandler(() => isSpeaking = true);
      _flutterTts!.setCompletionHandler(() => isSpeaking = false);
      _flutterTts!.setErrorHandler((msg) {
        isSpeaking = false;
        debugPrint('TTS Error: $msg');
      });

      _isInitialized = true;
    } catch (e) {
      debugPrint('No se pudo inicializar FlutterTts: $e');
    }
  }

  Future<void> speak(String text) async {
    if (isMuted || text.trim().isEmpty) return;
    await init();
    try {
      if (_flutterTts != null) {
        isSpeaking = true;
        await _flutterTts!.speak(text);
      }
    } catch (e) {
      isSpeaking = false;
      debugPrint('Error en speak: $e');
    }
  }

  Future<void> stop() async {
    try {
      if (_flutterTts != null) {
        await _flutterTts!.stop();
      }
    } catch (e) {
      debugPrint('Error al detener TTS: $e');
    }
    isSpeaking = false;
  }
}

