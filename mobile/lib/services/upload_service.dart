import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart' show ApiException;
import 'env.dart';
import 'realtime_store.dart';

/// Uploads a photo to the platform (`POST /api/v1/uploads`, multipart field `file`) and returns its public URL.
/// The URL is what the socket events take as an attachment (returns, support, chat…).
class UploadService {
  UploadService._();

  /// Tests answer the upload instead of the network.
  @visibleForTesting
  static Future<String> Function(Uint8List bytes, String filename)? debugUpload;

  static Future<String> uploadImage(Uint8List bytes, {String filename = 'photo.jpg'}) async {
    final hook = debugUpload;
    if (hook != null) return hook(bytes, filename);
    try {
      final token = await RealtimeStore.instance.freshAccessToken();
      final req = http.MultipartRequest('POST', Uri.parse('${Env.apiUrl}/api/v1/uploads'))
        ..headers['authorization'] = 'Bearer $token'
        ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
      final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 40)));
      Map<String, dynamic> json = {};
      try {
        final d = jsonDecode(res.body);
        if (d is Map<String, dynamic>) json = d;
      } catch (_) {}
      final url = json['url'];
      if (res.statusCode >= 200 && res.statusCode < 300 && url is String && url.isNotEmpty) return url;
      final msg = json['message'];
      throw ApiException(msg is List ? msg.join(' ') : '${msg ?? 'Upload failed.'}', res.statusCode);
    } on TimeoutException {
      throw ApiException.local('err_timeout');
    } on http.ClientException {
      throw ApiException.local('err_offline');
    }
  }
}
