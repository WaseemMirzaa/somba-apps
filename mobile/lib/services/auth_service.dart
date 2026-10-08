import 'dart:async';
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

/// A human-readable failure from the API (already safe to show to the user).
class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

/// REST is used ONLY for one-shot calls that happen before a socket exists
/// (sign-in, sign-up, password recovery, verification). Everything else flows
/// over the WebSocket (see SocketService).
class AuthService {
  static const _accessKey = 'somba.accessToken';
  static const _refreshKey = 'somba.refreshToken';

  Future<Map<String, dynamic>> _call(
    String path,
    Map<String, dynamic>? body, {
    String? bearer,
  }) async {
    final http.Response res;
    try {
      res = await http
          .post(
            Uri.parse('${Env.apiUrl}$path'),
            headers: {
              'content-type': 'application/json',
              if (bearer != null) 'authorization': 'Bearer $bearer',
            },
            body: body == null ? null : jsonEncode(body),
          )
          .timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw ApiException('The server took too long to respond. Check your connection and try again.');
    } on http.ClientException {
      throw ApiException("Can't reach the server. Check your internet connection.");
    }
    Map<String, dynamic> json = <String, dynamic>{};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) json = decoded;
      } catch (_) {/* non-JSON error page */}
    }
    if (res.statusCode >= 400) {
      // Nest returns `message` as a string, or a list for validation errors.
      final m = json['message'];
      final text = m is List ? m.join('\n') : m?.toString();
      throw ApiException(
        text ?? (res.statusCode == 429 ? 'Too many attempts. Please wait a minute.' : 'Request failed (${res.statusCode}).'),
        res.statusCode,
      );
    }
    return json;
  }

  Future<AuthResult> login(String email, String password) async =>
      AuthResult.fromJson(await _call('/api/v1/auth/login', {'email': email, 'password': password}));

  /// Customers only: staff/rider accounts are created by an administrator.
  Future<AuthResult> register({
    required String email,
    required String password,
    required String name,
    String? phone,
    String locale = 'en',
  }) async =>
      AuthResult.fromJson(await _call('/api/v1/auth/register', {
        'email': email,
        'password': password,
        'name': name,
        'role': 'customer',
        'locale': locale,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      }));

  Future<AuthResult> refresh(String refreshToken) async =>
      AuthResult.fromJson(await _call('/api/v1/auth/refresh', {'refreshToken': refreshToken}));

  // ---- recovery + verification ----
  /// Always succeeds from the user's point of view (the API never reveals
  /// whether an address has an account).
  Future<String?> forgotPassword(String email) async => (await _call('/api/v1/auth/forgot', {'email': email}))['devToken'] as String?;

  Future<void> resetPassword(String token, String password) =>
      _call('/api/v1/auth/reset', {'token': token.trim(), 'password': password});

  /// Returns the dev-only token the API includes outside production (null in production).
  Future<String?> sendEmailVerification(String accessToken) async =>
      (await _call('/api/v1/auth/email/send', null, bearer: accessToken))['devToken'] as String?;

  Future<void> verifyEmail(String token) => _call('/api/v1/auth/email/verify', {'token': token.trim()});

  Future<String?> sendPhoneOtp(String accessToken) async =>
      (await _call('/api/v1/auth/phone/send', null, bearer: accessToken))['devToken'] as String?;

  Future<void> verifyPhoneOtp(String accessToken, String code) =>
      _call('/api/v1/auth/phone/verify', {'code': code}, bearer: accessToken);

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
