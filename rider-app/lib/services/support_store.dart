import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'auth_service.dart' show ApiException;
import 'env.dart';
import 'rider_store.dart';
import 'support_models.dart';

/// At most this many photos per message (the API refuses more).
const kMaxSupportPhotos = 6;

/// The API refuses a photo above 5 MB.
const kMaxPhotoBytes = 5 * 1024 * 1024;

/// A photo chosen on the phone, not uploaded yet.
class PickedPhoto {
  const PickedPhoto(this.path);
  final String path;
}

/// Chooses photos (camera or gallery). Tests swap in a fake.
abstract class PhotoPicker {
  Future<List<PickedPhoto>> pick({required bool camera, required int limit});
}

class ImagePickerPhotoPicker implements PhotoPicker {
  final _picker = ImagePicker();

  @override
  Future<List<PickedPhoto>> pick({required bool camera, required int limit}) async {
    // Re-encoded smaller (and as JPEG on iOS, which would otherwise send HEIC): the API takes JPEG, PNG or WebP up to 5 MB.
    if (camera) {
      final f = await _picker.pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 82);
      return f == null ? const [] : [PickedPhoto(f.path)];
    }
    final files = await _picker.pickMultiImage(maxWidth: 1600, imageQuality: 82, limit: limit < 2 ? null : limit);
    return files.take(limit).map((f) => PickedPhoto(f.path)).toList();
  }
}

/// Sends a photo to the API (`POST /api/v1/uploads`, multipart field `file`, Bearer token) and returns its public URL.
abstract class PhotoUploader {
  Future<String> upload(PickedPhoto photo);
}

class HttpPhotoUploader implements PhotoUploader {
  @override
  Future<String> upload(PickedPhoto photo) async {
    final file = File(photo.path);
    if (await file.length() > kMaxPhotoBytes) throw ApiException.local('err_photo_too_big');
    final token = await RiderStore.instance.freshAccessToken();
    final req = http.MultipartRequest('POST', Uri.parse('${Env.apiUrl}/api/v1/uploads'))
      ..headers['authorization'] = 'Bearer $token'
      ..files.add(await http.MultipartFile.fromPath('file', photo.path));
    final http.Response res;
    try {
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 40)));
    } on TimeoutException {
      throw ApiException.local('err_timeout');
    } on http.ClientException {
      throw ApiException.local('err_offline');
    } on SocketException {
      throw ApiException.local('err_offline');
    }
    Map<String, dynamic> json = {};
    try {
      final d = jsonDecode(res.body);
      if (d is Map<String, dynamic>) json = d;
    } catch (_) {/* not JSON */}
    if (res.statusCode >= 400) {
      final m = json['message'];
      final text = m is List ? m.join('\n') : m?.toString();
      throw text == null ? ApiException.local('err_request_failed', status: res.statusCode, args: {'code': res.statusCode}) : ApiException(text, res.statusCode);
    }
    final url = json['url'];
    if (url is! String || url.isEmpty) throw ApiException.local('err_generic');
    return url;
  }
}

/// The support socket calls (`support:*`). Tests swap in a fake.
abstract class SupportApi {
  Future<List<SupportTicket>> list();
  Future<SupportTicket> get(String id);
  Future<SupportTicket> open({required String subject, required String message, String? category, String? orderId, List<String> attachments = const []});
  Future<SupportTicket> reply(String id, {String? text, List<String> attachments = const []});
  Future<SupportTicket> markRead(String id);
}

class SocketSupportApi implements SupportApi {
  Future<dynamic> _call(String event, Map<String, dynamic> body) => RiderStore.instance.request(event, body);

  static SupportTicket _ticket(dynamic d) => SupportTicket.fromJson((d as Map).map((k, v) => MapEntry(k.toString(), v)));

  @override
  Future<List<SupportTicket>> list() async => ((await _call('support:list', {})) as List).map(_ticket).toList();

  @override
  Future<SupportTicket> get(String id) async => _ticket(await _call('support:get', {'id': id}));

  @override
  Future<SupportTicket> open({required String subject, required String message, String? category, String? orderId, List<String> attachments = const []}) async =>
      _ticket(await _call('support:open', {
        'subject': subject,
        'message': message,
        if (category != null) 'category': category,
        if (orderId != null) 'orderId': orderId,
        if (attachments.isNotEmpty) 'attachments': attachments,
      }));

  @override
  Future<SupportTicket> reply(String id, {String? text, List<String> attachments = const []}) async => _ticket(await _call('support:reply', {
        'id': id,
        if (text != null && text.trim().isNotEmpty) 'text': text.trim(),
        if (attachments.isNotEmpty) 'attachments': attachments,
      }));

  @override
  Future<SupportTicket> markRead(String id) async => _ticket(await _call('support:markRead', {'id': id}));
}

/// The rider's support tickets, live: the list, the unread count and `support:updated` pushes.
class SupportStore extends ChangeNotifier {
  SupportStore._();
  static final SupportStore instance = SupportStore._();

  SupportApi api = SocketSupportApi();
  PhotoPicker picker = ImagePickerPhotoPicker();
  PhotoUploader uploader = HttpPhotoUploader();

  final List<SupportTicket> tickets = [];
  bool loaded = false;
  bool loading = false;

  /// Set when the last list read failed (the screen shows it and offers a retry).
  Object? loadError;

  /// Staff messages the rider has not read, over all tickets (the badge).
  int get unread => tickets.fold(0, (n, t) => n + t.userUnread);

  SupportTicket? byId(String id) {
    for (final t in tickets) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Reads the list. Listeners are told when it ends (not at the start: a screen calls this from `initState`, in the
  /// middle of a build); until then a screen with no list yet shows its spinner.
  Future<void> load() async {
    if (loading) return;
    loading = true;
    loadError = null;
    try {
      final rows = await api.list();
      tickets
        ..clear()
        ..addAll(rows);
      _sort();
      loaded = true;
    } catch (e) {
      loadError = e;
      if (kDebugMode) debugPrint('support list failed: $e');
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Reads one ticket (a notice tap can name one the list has not got yet).
  Future<SupportTicket> fetch(String id) async => _put(await api.get(id));

  Future<SupportTicket> open({required String subject, required String message, String? category, String? orderId, List<String> attachments = const []}) async =>
      _put(await api.open(subject: subject, message: message, category: category, orderId: orderId, attachments: attachments));

  Future<SupportTicket> reply(String id, {String? text, List<String> attachments = const []}) async =>
      _put(await api.reply(id, text: text, attachments: attachments));

  /// The rider is reading the thread: zero its badge now, tell the server (a failure only means the badge returns).
  Future<void> markRead(String id) async {
    final t = byId(id);
    if (t == null || !t.hasUnread) return;
    _replace(t.withUnread(0));
    try {
      _put(await api.markRead(id));
    } catch (_) {/* the next list read brings the badge back */}
  }

  /// A `support:updated` push: the ticket changed (a reply, a status change, a first message).
  void applyPush(dynamic d) {
    if (d is! Map) return;
    try {
      _put(SupportTicket.fromJson(d.map((k, v) => MapEntry(k.toString(), v))));
    } catch (_) {/* malformed push: the next list read fixes it */}
  }

  void clear() {
    tickets.clear();
    loaded = false;
    loading = false;
    loadError = null;
    notifyListeners();
  }

  SupportTicket _put(SupportTicket t) {
    final i = tickets.indexWhere((x) => x.id == t.id);
    if (i == -1) {
      tickets.add(t);
    } else {
      tickets[i] = t;
    }
    _sort();
    notifyListeners();
    return t;
  }

  void _replace(SupportTicket t) {
    final i = tickets.indexWhere((x) => x.id == t.id);
    if (i != -1) tickets[i] = t;
    notifyListeners();
  }

  void _sort() => tickets.sort((a, b) => (b.updatedAt ?? b.createdAt ?? DateTime(0)).compareTo(a.updatedAt ?? a.createdAt ?? DateTime(0)));
}
