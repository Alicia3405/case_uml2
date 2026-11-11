import 'dart:js_interop';
import 'dart:typed_data';
import 'package:web/web.dart' as web;

/// Descarga Blob estándar en Chrome / Web usando `package:web` (sin `dart:html`).
Future<String?> saveOrDownloadBytes(
  String filename,
  List<int> bytes, {
  String mimeType = 'application/octet-stream',
}) async {
  final uint8List = Uint8List.fromList(bytes);
  final blobParts = <JSAny>[uint8List.toJS].toJS;
  final blob = web.Blob(blobParts, web.BlobPropertyBag(type: mimeType));
  final url = web.URL.createObjectURL(blob);
  final anchor = web.document.createElement('a') as web.HTMLAnchorElement
    ..href = url
    ..download = filename;
  anchor.click();
  web.URL.revokeObjectURL(url);
  return filename;
}

