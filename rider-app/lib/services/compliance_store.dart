import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart' show ApiException, frenchText;
import 'compliance_models.dart';
import 'env.dart';
import 'rider_store.dart';
import 'support_store.dart' show PhotoPicker, ImagePickerPhotoPicker, PickedPhoto, kMaxPhotoBytes;

/// The compliance socket calls (`rider:vehicle`, `rider:documents`, `rider:documentUpload`). Tests swap in a fake.
abstract class ComplianceApi {
  Future<RiderVehicleDto> vehicle();
  Future<List<RiderDocumentDto>> documents();
  Future<RiderDocumentDto> upload({required String type, String? number, String? expiresOn, required String fileId});
}

class SocketComplianceApi implements ComplianceApi {
  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RiderStore.instance.request(event, body);
  static Map<String, dynamic> _map(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));

  @override
  Future<RiderVehicleDto> vehicle() async => RiderVehicleDto.fromJson(_map(await _call('rider:vehicle')));

  @override
  Future<List<RiderDocumentDto>> documents() async => ((await _call('rider:documents')) as List).map((e) => RiderDocumentDto.fromJson(_map(e))).toList();

  @override
  Future<RiderDocumentDto> upload({required String type, String? number, String? expiresOn, required String fileId}) async =>
      RiderDocumentDto.fromJson(_map(await _call('rider:documentUpload', {
        'type': type,
        if (number != null && number.trim().isNotEmpty) 'number': number.trim(),
        if (expiresOn != null) 'expiresOn': expiresOn,
        'fileId': fileId,
      })));
}

/// Stores a scan in the API's PRIVATE upload folder (`POST /api/v1/private-uploads`, multipart field `file`, Bearer token) and
/// returns the file id the document is then attached with. Tests swap in a fake.
abstract class PrivateFileUploader {
  Future<String> upload(PickedPhoto photo);
}

class HttpPrivateFileUploader implements PrivateFileUploader {
  @override
  Future<String> upload(PickedPhoto photo) async {
    final file = File(photo.path);
    if (await file.length() > kMaxPhotoBytes) throw ApiException.local('err_photo_too_big');
    final token = await RiderStore.instance.freshAccessToken();
    final req = http.MultipartRequest('POST', Uri.parse('${Env.apiUrl}/api/v1/private-uploads'))
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
      throw text == null ? ApiException.local('err_request_failed', status: res.statusCode, args: {'code': res.statusCode}) : ApiException(text, res.statusCode, json['code'] is String ? json['code'] as String : null, frenchText(json['messageFr']));
    }
    final id = json['id'];
    if (id is! String || id.isEmpty) throw ApiException.local('err_generic');
    return id;
  }
}

/// The rider's vehicle and documents, live: read on open, refreshed by `rider:vehicle:updated` and `rider:document:updated`
/// pushes. Read only apart from sending a document. Nothing here ever stops the rider from working: warnings only.
class ComplianceStore extends ChangeNotifier {
  ComplianceStore._();
  static final ComplianceStore instance = ComplianceStore._();

  ComplianceApi api = SocketComplianceApi();
  PhotoPicker picker = ImagePickerPhotoPicker();
  PrivateFileUploader uploader = HttpPrivateFileUploader();

  /// "Today" for the expiry warnings; tests move it.
  DateTime Function() clock = DateTime.now;

  RiderVehicleDto vehicle = const RiderVehicleDto();
  final List<RiderDocumentDto> documents = [];
  bool vehicleLoaded = false;
  bool documentsLoaded = false;
  bool loading = false;
  Object? vehicleError;
  Object? documentsError;

  ({int expired, int expiring}) get warnings => documentWarnings(documents, clock());
  bool get hasWarnings => warnings.expired + warnings.expiring > 0;

  /// Reads both. Each failure is kept apart so one screen does not show the other's error. Listeners are told when it ends.
  Future<void> load() async {
    if (loading) return;
    loading = true;
    vehicleError = documentsError = null;
    await Future.wait([
      () async {
        try {
          vehicle = await api.vehicle();
          vehicleLoaded = true;
        } catch (e) {
          vehicleError = e;
          if (kDebugMode) debugPrint('vehicle read failed: $e');
        }
      }(),
      () async {
        try {
          final rows = await api.documents();
          documents
            ..clear()
            ..addAll(rows);
          documentsLoaded = true;
        } catch (e) {
          documentsError = e;
          if (kDebugMode) debugPrint('documents read failed: $e');
        }
      }(),
    ]);
    loading = false;
    notifyListeners();
  }

  /// Stores the scan privately, then attaches it to a new document (pending until the warehouse checks it).
  Future<RiderDocumentDto> submit({required String type, String? number, DateTime? expiresOn, required PickedPhoto photo}) async {
    final fileId = await uploader.upload(photo);
    final doc = await api.upload(type: type, number: number, expiresOn: expiresOn == null ? null : isoDay(expiresOn), fileId: fileId);
    _put(doc);
    return doc;
  }

  void _put(RiderDocumentDto d) {
    final i = documents.indexWhere((x) => x.id == d.id);
    if (i == -1) {
      documents.insert(0, d);
    } else {
      documents[i] = d;
    }
    documentsLoaded = true;
    notifyListeners();
  }

  /// A `rider:document:updated` push (the warehouse approved or rejected it, or it was just sent from another phone).
  void applyDocumentPush(dynamic d) {
    if (d is! Map) return;
    try {
      _put(RiderDocumentDto.fromJson(d.map((k, v) => MapEntry(k.toString(), v))));
    } catch (_) {/* malformed push: the next read fixes it */}
  }

  /// A `rider:vehicle:updated` push (the warehouse edited the vehicle).
  void applyVehiclePush(dynamic d) {
    if (d is! Map) return;
    try {
      vehicle = RiderVehicleDto.fromJson(d.map((k, v) => MapEntry(k.toString(), v)));
      vehicleLoaded = true;
      notifyListeners();
    } catch (_) {/* malformed push: the next read fixes it */}
  }

  /// Sign-out: nothing of this rider may show for the next one.
  void clear() {
    vehicle = const RiderVehicleDto();
    documents.clear();
    vehicleLoaded = documentsLoaded = loading = false;
    vehicleError = documentsError = null;
    notifyListeners();
  }
}
