import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

class PickedImagePayload {
  final Uint8List bytes;
  final String base64Data;
  final String mimeType;

  PickedImagePayload({
    required this.bytes,
    required this.base64Data,
    required this.mimeType,
  });
}

/// Helper multiplataforma (Android & Web) para seleccionar imágenes y archivos XMI sin usar `dart:html`.
class FilePickerHelper {
  static final ImagePicker _imagePicker = ImagePicker();

  static Future<PickedImagePayload?> pickImage({bool fromCamera = false}) async {
    final XFile? file = await _imagePicker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      imageQuality: 88,
      maxWidth: 1600,
    );
    if (file == null) return null;

    final bytes = await file.readAsBytes();
    final lowerName = file.name.toLowerCase();
    var mime = 'image/jpeg';
    if (lowerName.endsWith('.png')) {
      mime = 'image/png';
    } else if (lowerName.endsWith('.webp')) {
      mime = 'image/webp';
    }
    return PickedImagePayload(
      bytes: bytes,
      base64Data: base64Encode(bytes),
      mimeType: mime,
    );
  }

  static Future<String?> pickXmiContent() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['xmi', 'xml'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return null;

    final picked = result.files.first;
    final bytes = picked.bytes;
    if (bytes != null && bytes.isNotEmpty) {
      return utf8.decode(bytes, allowMalformed: true);
    }
    return null;
  }
}

