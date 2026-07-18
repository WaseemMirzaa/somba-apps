import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'env.dart';
import 'models.dart';

class AuthResult {
  final BackendUser user;
  final String accessToken;
  final String refreshToken;

  AuthResult({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  factory AuthResult.fromJson(Map<String, dynamic> j) => AuthResult(
        user: BackendUser.fromJson(j['user'] as Map<String, dynamic>),
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
      );
}

/// REST is used ONLY for the one-shot credential exchange. Everything else
/// flows over the WebSocket (see SocketService).
class AuthService {
  static const _accessKey = 'somba.accessToken';
  static const _refreshKey = 'somba.refreshToken';

  Future<AuthResult> _post(String path, Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('${Env.apiUrl}$path'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode(body),
    );
    final json = res.body.isNotEmpty
        ? jsonDecode(res.body) as Map<String, dynamic>
        : <String, dynamic>{};
    if (res.statusCode >= 400) {
      throw Exception(json['message']?.toString() ??
          'Request failed (${res.statusCode})');
    }
    return AuthResult.fromJson(json);
  }

  Future<AuthResult> login(String email, String password) =>
      _post('/api/v1/auth/login', {'email': email, 'password': password});

  Future<AuthResult> register({
    required String email,
    required String password,
    required String name,
    String role = 'customer',
    String? phone,
  }) =>
      _post('/api/v1/auth/register', {
        'email': email,
        'password': password,
        'name': name,
        'role': role,
        if (phone != null) 'phone': phone,
      });

  Future<AuthResult> refresh(String refreshToken) =>
      _post('/api/v1/auth/refresh', {'refreshToken': refreshToken});

  // ---- token persistence ----
  Future<void> saveTokens(AuthResult r) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_accessKey, r.accessToken);
    await p.setString(_refreshKey, r.refreshToken);
  }

  Future<String?> getRefresh() async {
    final p = await SharedPreferences.getInstance();
    return p.getString(_refreshKey);
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_accessKey);
    await p.remove(_refreshKey);
  }
}
