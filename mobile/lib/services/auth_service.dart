import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/strings.dart';
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

/// The account has two-factor sign-in on: the password was right, so the app now asks for the 6-digit code (or a
/// recovery code) and finishes with [AuthService.loginWithTwoFactor]. The [challenge] is good for a few minutes.
class TwoFactorRequired implements Exception {
  final String challenge;
  const TwoFactorRequired(this.challenge);
  @override
  String toString() => 'TwoFactorRequired';
}

/// What the server did with a request to send a code or a link. [sent] is false when nothing went out: [reason] says
/// why (`not_configured`: this server has no SMS / e-mail provider set up yet; `failed`: the provider refused it), so
/// a screen never says "code sent" for a code nobody got. [to] is where it went, already masked by the server.
///
/// An older server answers only `{sent: false}` with no reason. Nothing went out, so that counts as [failed]: the
/// screens must never fall back to "we sent it" because the reason is missing.
class SendResult {
  final bool sent;
  final String? reason;
  final String? to;
  final String? devToken;
  const SendResult({required this.sent, this.reason, this.to, this.devToken});

  bool get notConfigured => !sent && reason == 'not_configured';
  bool get failed => !sent && reason != 'not_configured';

  factory SendResult.fromJson(Map<String, dynamic> j) => SendResult(
        sent: j['sent'] != false,
        reason: j['reason'] as String?,
        to: j['to'] as String?,
        devToken: j['devToken'] as String?,
      );
}

/// A failure from the API, safe to show to the user. [message] is what the
/// server (or the client) said in English; printing the exception gives the
/// text in the user's language (see Strings.serverError).
///
/// A refusal that carries more than a message (the `code` and the extra fields of the ack, for example the area a
/// delivery was refused for) keeps them in [code] and [details], so a screen can word it itself.
class ApiException implements Exception {
  final String message;
  final int? status;
  final String? localKey;
  final Map<String, Object?>? args;

  /// The machine-readable `code` of a refusal (`not_served`…); null when the server sent only a message.
  final String? code;

  /// The other fields of the refusal's ack (everything but `ok`, `error` and `code`); empty when there are none.
  final Map<String, Object?> details;

  ApiException(this.message, [this.status])
      : localKey = null,
        args = null,
        code = null,
        details = const {};

  /// A refusal with its structured fields (see [ApiException.fromAck]).
  ApiException.refusal(this.message, {this.status, this.code, this.details = const {}})
      : localKey = null,
        args = null;

  /// A client-side failure (offline, timeout…): the text comes from the strings layer.
  ApiException.local(String key, {this.status, this.args})
      : localKey = key,
        message = const Strings('en').t(key, args),
        code = null,
        details = const {};

  /// The failure of an ack `{ ok: false, error, code?, ...fields }`: the message plus every structured field the
  /// server added. An ack without an `error` is a generic failure.
  factory ApiException.fromAck(Map<dynamic, dynamic> ack) {
    final error = ack['error'];
    if (error == null) return ApiException.local('err_generic');
    final code = ack['code'];
    return ApiException.refusal(
      error.toString(),
      code: code is String && code.trim().isNotEmpty ? code.trim() : null,
      details: {
        for (final e in ack.entries)
          if (!const {'ok', 'error', 'code'}.contains(e.key)) e.key.toString(): e.value,
      },
    );
  }

  @override
  String toString() => localKey != null ? Strings.current.t(localKey!, args) : Strings.current.serverError(message);
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
      throw ApiException.local('err_timeout');
    } on http.ClientException {
      throw ApiException.local('err_offline');
    }
    Map<String, dynamic> json = <String, dynamic>{};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) json = decoded;
      } catch (_) {/* non-JSON error page */}
    }
    if (res.statusCode == 429) throw ApiException.local('err_rate_limit', status: 429); // the throttler's own text is English
    if (res.statusCode >= 500) {
      debugPrint('Server error ${res.statusCode} on $path: ${res.body.length > 300 ? res.body.substring(0, 300) : res.body}');
      throw ApiException.local('err_server', status: res.statusCode);
    }
    if (res.statusCode >= 400) {
      // Nest returns `message` as a string, or a list for validation errors.
      final m = json['message'];
      final text = m is List ? m.join('\n') : m?.toString();
      if (text == null) {
        throw ApiException.local('err_request_failed', status: res.statusCode, args: {'code': res.statusCode});
      }
      throw ApiException(text, res.statusCode);
    }
    return json;
  }

  /// A sign-in answer is either the tokens, or `{needs2fa, challenge}` (throws [TwoFactorRequired]).
  AuthResult _tokens(Map<String, dynamic> json) {
    if (json['needs2fa'] == true && json['challenge'] is String) throw TwoFactorRequired(json['challenge'] as String);
    try {
      return AuthResult.fromJson(json);
    } catch (e, st) {
      // The server accepted the request but sent something this app cannot read: say so in the log, not just "unexpected".
      debugPrint('Unreadable sign-in answer (${e.runtimeType}): $e\n$st');
      throw ApiException.local('err_server');
    }
  }

  Future<AuthResult> login(String email, String password) async => _tokens(await _call('/api/v1/auth/login', {'email': email, 'password': password}));

  /// Second step of a sign-in on an account with two-factor authentication on.
  Future<AuthResult> loginWithTwoFactor(String challenge, String code) async =>
      _tokens(await _call('/api/v1/auth/login/2fa', {'challenge': challenge, 'code': code.trim()}));

  /// Customers only: staff/rider accounts are created by an administrator.
  Future<AuthResult> register({
    required String email,
    required String password,
    required String name,
    String? phone,
    String locale = 'en',
  }) async =>
      _tokens(await _call('/api/v1/auth/register', {
        'email': email,
        'password': password,
        'name': name,
        'role': 'customer',
        'locale': locale,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      }));

  Future<AuthResult> refresh(String refreshToken) async => _tokens(await _call('/api/v1/auth/refresh', {'refreshToken': refreshToken}));

  // ---- recovery + verification ----
  /// Always succeeds from the user's point of view (the API never reveals
  /// whether an address has an account).
  Future<SendResult> forgotPassword(String email) async => SendResult.fromJson(await _call('/api/v1/auth/forgot', {'email': email}));

  /// Phone-code login, step 1. The API answers the same whether or not the number has an account; the dev code
  /// is included only outside production.
  Future<SendResult> sendLoginCode(String phone) async => SendResult.fromJson(await _call('/api/v1/auth/phone/login/send', {'phone': phone.trim()}));

  /// Phone-code login, step 2.
  Future<AuthResult> loginWithCode(String phone, String code) async =>
      _tokens(await _call('/api/v1/auth/phone/login', {'phone': phone.trim(), 'code': code.trim()}));

  Future<void> resetPassword(String token, String password) =>
      _call('/api/v1/auth/reset', {'token': token.trim(), 'password': password});

  /// The dev-only token the API includes outside production is in [SendResult.devToken] (null in production).
  Future<SendResult> sendEmailVerification(String accessToken) async => SendResult.fromJson(await _call('/api/v1/auth/email/send', null, bearer: accessToken));

  Future<void> verifyEmail(String token) => _call('/api/v1/auth/email/verify', {'token': token.trim()});

  Future<SendResult> sendPhoneOtp(String accessToken) async => SendResult.fromJson(await _call('/api/v1/auth/phone/send', null, bearer: accessToken));

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
