import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Thrown when an API call fails (non-2xx or network error).
class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => 'ApiException($status): $message';
}

/// Thin HTTP client for the Somba&Teka NestJS API.
///
/// Base URL is overridable at build time with
/// `--dart-define=API_BASE=http://host:3001/api`. The bearer token (set after
/// login/register) is persisted so the session survives restarts. Every call
/// has a short timeout so the app stays responsive when the backend is down —
/// the repository layer then falls back to bundled data.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://localhost:3001/api',
  );

  static const Duration _timeout = Duration(seconds: 8);
  static const String _tokenKey = 'somba-token';

  String? _token;
  SharedPreferences? _prefs;

  bool get isAuthed => _token != null && _token!.isNotEmpty;
  String? get token => _token;

  Future<void> load() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      _token = _prefs!.getString(_tokenKey);
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> setToken(String? token) async {
    _token = token;
    try {
      _prefs ??= await SharedPreferences.getInstance();
      if (token == null || token.isEmpty) {
        await _prefs!.remove(_tokenKey);
      } else {
        await _prefs!.setString(_tokenKey, token);
      }
    } catch (_) {
      /* best-effort */
    }
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        if (isAuthed) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final uri = _uri(path);
    final headers = _headers();
    final payload = body == null ? null : jsonEncode(body);
    late http.Response res;
    try {
      final client = http.Client();
      try {
        final req = http.Request(method, uri)..headers.addAll(headers);
        if (payload != null) req.body = payload;
        final streamed = await client.send(req).timeout(_timeout);
        res = await http.Response.fromStream(streamed);
      } finally {
        client.close();
      }
    } on TimeoutException {
      throw ApiException(0, 'Request timed out');
    } catch (e) {
      throw ApiException(0, 'Network error: $e');
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      String msg = res.reasonPhrase ?? 'Error';
      try {
        final decoded = jsonDecode(res.body);
        final m = decoded is Map ? decoded['message'] : null;
        if (m is List) {
          msg = m.join(', ');
        } else if (m != null) {
          msg = m.toString();
        }
      } catch (_) {
        /* keep reason phrase */
      }
      throw ApiException(res.statusCode, msg);
    }

    if (res.body.isEmpty) return null;
    try {
      return jsonDecode(res.body);
    } catch (_) {
      return res.body;
    }
  }
}
