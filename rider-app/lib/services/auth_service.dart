import 'dart:async';
import 'dart:convert';
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

  factory AuthResult.fromJson(Map<String, dynamic> j) {
    final user = BackendUser.fromJson(j['user'] as Map<String, dynamic>);
    return AuthResult(
      // The answer says it at the top level too; either one holds the rider at the change-password screen.
      user: j['mustChangePassword'] == true && !user.mustChangePassword ? user.withMustChangePassword(true) : user,
      accessToken: j['accessToken'] as String,
      refreshToken: j['refreshToken'] as String,
    );
  }
}

/// The server's refusal code for an account that still has its temporary password (api/src/auth/password-change.ts).
const kPasswordChangeRequired = 'password_change_required';

/// Called whenever ANY call (socket or REST) is refused with [kPasswordChangeRequired]: the rider store holds the app at the
/// change-password screen, whatever screen made the call.
void Function()? onPasswordChangeRequired;

/// A failure from the API, safe to show to the user. [message] is what the
/// server (or the client) said in English; printing the exception gives the
/// text in the user's language (see Strings.serverError).
class ApiException implements Exception {
  final String message;
  final int? status;
  final String? localKey;
  final Map<String, Object?>? args;

  /// The server's machine-readable reason, when it sent one (`password_change_required`).
  final String? code;

  /// The server's own French sentence (`errorFr` of an ack, `messageFr` of an HTTP body), when it sent one. Shown
  /// instead of the English text when the app is in French (docs/contracts/error-text.md, section 4).
  final String? messageFr;

  ApiException(this.message, [this.status, this.code, this.messageFr])
      : localKey = null,
        args = null {
    if (code == kPasswordChangeRequired) onPasswordChangeRequired?.call();
  }

  /// A client-side failure (offline, timeout…): the text comes from the strings layer.
  ApiException.local(String key, {this.status, this.args})
      : localKey = key,
        code = null,
        messageFr = null,
        message = const Strings('en').t(key, args);

  @override
  String toString() {
    if (localKey != null) return Strings.current.t(localKey!, args);
    final fr = messageFr;
    if (fr != null && fr.trim().isNotEmpty && Strings.current.isFr) return fr.trim();
    return Strings.current.serverError(message);
  }
}

/// The French version the server sent with an error: a string, or a list of strings (joined with [separator] like
/// the English `message`). Null when absent or blank, which is normal: the server only sends it when it knows the sentence.
String? frenchText(Object? v, {String separator = '\n'}) {
  final text = v is List ? v.map((e) => '$e'.trim()).where((e) => e.isNotEmpty).join(separator) : (v is String ? v.trim() : '');
  return text.isEmpty ? null : text;
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
    if (res.statusCode >= 500) throw ApiException.local('err_server', status: res.statusCode);
    if (res.statusCode >= 400) {
      // Nest returns `message` as a string, or a list for validation errors.
      final m = json['message'];
      final text = m is List ? m.join('\n') : m?.toString();
      if (text == null) {
        throw res.statusCode == 429
            ? ApiException.local('err_rate_limit', status: 429)
            : ApiException.local('err_request_failed', status: res.statusCode, args: {'code': res.statusCode});
      }
      final code = json['code'];
      throw ApiException(text, res.statusCode, code is String ? code : null, frenchText(json['messageFr']));
    }
    return json;
  }

  Future<AuthResult> login(String email, String password) async =>
      AuthResult.fromJson(await _call('/api/v1/auth/login', {'email': email, 'password': password}));

  Future<AuthResult> refresh(String refreshToken) async =>
      AuthResult.fromJson(await _call('/api/v1/auth/refresh', {'refreshToken': refreshToken}));

  // ---- recovery + verification ----
  /// Always succeeds from the user's point of view (the API never reveals
  /// whether an address has an account).
  /// `devToken` is the dev-only reset token (null in production); `notConfigured` is true when this server has no e-mail
  /// provider yet, so no link can have been sent.
  Future<({String? devToken, bool notConfigured})> forgotPassword(String email) async {
    final j = await _call('/api/v1/auth/forgot', {'email': email});
    return (devToken: j['devToken'] as String?, notConfigured: j['reason'] == 'not_configured');
  }

  Future<void> resetPassword(String token, String password) =>
      _call('/api/v1/auth/reset', {'token': token.trim(), 'password': password});

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
