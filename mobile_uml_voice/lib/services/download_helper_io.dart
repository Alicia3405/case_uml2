import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';

/// Guarda archivos binarios o XML en almacenamiento local en Android/Desktop.
Future<String?> saveOrDownloadBytes(
  String filename,
  List<int> bytes, {
  String mimeType = 'application/octet-stream',
}) async {
  final dir = await getApplicationDocumentsDirectory();
  final safeName = filename.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
  final file = File('${dir.path}${Platform.pathSeparator}$safeName');
  await file.writeAsBytes(Uint8List.fromList(bytes), flush: true);
  return file.path;
}

