import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

/// Servicio multiplataforma de Reconocimiento de Voz (STT) en español.
class SttService {
  static final SttService _instance = SttService._internal();
  factory SttService() => _instance;
  SttService._internal();

  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _isAvailable = false;
  bool _isListening = false;

  bool get isListening => _isListening || _speech.isListening;
  bool get isAvailable => _isAvailable;

  Future<bool> init() async {
    if (_isAvailable) return true;
    try {
      _isAvailable = await _speech.initialize(
        onError: (val) {
          debugPrint('STT onError: ${val.errorMsg}');
          _isListening = false;
        },
        onStatus: (val) {
          if (val == 'done' || val == 'notListening') {
            _isListening = false;
          } else if (val == 'listening') {
            _isListening = true;
          }
        },
      );
      return _isAvailable;
    } catch (e) {
      debugPrint('STT init error: $e');
      _isAvailable = false;
      return false;
    }
  }

  Future<bool> listen({
    required void Function(String text) onResult,
    required VoidCallback onDone,
  }) async {
    final available = await init();
    if (!available) {
      return false;
    }

    if (_isListening || _speech.isListening) {
      try {
        await _speech.stop();
        await Future.delayed(const Duration(milliseconds: 150));
      } catch (_) {}
    }

    _isListening = true;
    try {
      await _speech.listen(
        onResult: (result) {
          onResult(result.recognizedWords);
          if (result.finalResult) {
            _isListening = false;
            onDone();
          }
        },
        listenOptions: stt.SpeechListenOptions(
          cancelOnError: true,
          partialResults: true,
          localeId: 'es_ES',
          pauseFor: const Duration(milliseconds: 3500),
          listenFor: const Duration(seconds: 60),
        ),
      );
      return true;
    } catch (e) {
      debugPrint('Error al escuchar STT: $e');
      _isListening = false;
      onDone();
      return false;
    }
  }

  Future<void> stop() async {
    try {
      if (_isListening || _speech.isListening) {
        await _speech.stop();
      }
    } catch (e) {
      debugPrint('Error al detener STT: $e');
    } finally {
      _isListening = false;
    }
  }
}

