import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'auth_service.dart' show ApiException, frenchText;
import 'env.dart';
import 'models.dart';
import 'rider_store.dart';

/// The API refuses a proof photo above 4 MB (a phone photo re-encoded at 1600 px is about 0.5 MB).
const kMaxProofPhotoBytes = 4 * 1024 * 1024;

/// Proof of delivery taken at the door: a photo of the parcel and/or the customer's signature (a PNG drawn on the
/// phone). Both are optional.
class DeliveryProof {
  const DeliveryProof({this.photoPath, this.signaturePng});
  final String? photoPath;
  final Uint8List? signaturePng;

  bool get isEmpty => photoPath == null && (signaturePng == null || signaturePng!.isEmpty);

  DeliveryProof copyWith({Object? photoPath = _keep, Object? signaturePng = _keep}) => DeliveryProof(
        photoPath: identical(photoPath, _keep) ? this.photoPath : photoPath as String?,
        signaturePng: identical(signaturePng, _keep) ? this.signaturePng : signaturePng as Uint8List?,
      );
  static const _keep = Object();
}

/// Which legs take proof: the handover to the customer (a delivery, an express run or a replacement), never a leg that ends at a warehouse.
extension DeliveryProofRules on DeliveryTaskDto {
  bool get takesProof => isCustomerLeg || kind == LegKind.replacementDelivery;
}

/// Takes the photo with the camera. Tests swap in a fake.
abstract class ProofCamera {
  /// The path of the photo, or null when the rider closed the camera. Throws [ApiException.local] `pod_camera_denied`
  /// when the phone's camera permission is off.
  Future<String?> capture();
}

class ImagePickerProofCamera implements ProofCamera {
  final _picker = ImagePicker();

  @override
  Future<String?> capture() async {
    try {
      // Re-encoded smaller (and as JPEG on iOS, which would otherwise send HEIC): the API takes JPEG or PNG.
      final f = await _picker.pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 82);
      return f?.path;
    } on PlatformException catch (e) {
      if (e.code == 'camera_access_denied' || e.code == 'camera_access_restricted') throw ApiException.local('pod_camera_denied');
      throw ApiException.local('pod_camera_failed');
    }
  }
}

/// Sends the proof to the API. Tests swap in a fake.
abstract class ProofUploader {
  Future<void> upload(String taskId, DeliveryProof proof);
}

/// `POST /api/v1/delivery-proofs/:taskId` (multipart fields `photo` and `signature`, Bearer token). The files go to the
/// API's private storage; staff open them from the task page.
class HttpProofUploader implements ProofUploader {
  /// Tests pass a mock [client], an [apiUrl] and a fixed [token]; the app uses the real ones.
  HttpProofUploader({http.Client? client, String? apiUrl, Future<String> Function()? token})
      : _client = client,
        _apiUrl = apiUrl,
        _token = token;
  final http.Client? _client;
  final String? _apiUrl;
  final Future<String> Function()? _token;

  @override
  Future<void> upload(String taskId, DeliveryProof proof) async {
    if (proof.isEmpty) return;
    final photo = proof.photoPath;
    if (photo != null && await File(photo).length() > kMaxProofPhotoBytes) throw ApiException.local('pod_photo_big');
    final token = await (_token ?? RiderStore.instance.freshAccessToken)();
    final req = http.MultipartRequest('POST', Uri.parse('${_apiUrl ?? Env.apiUrl}/api/v1/delivery-proofs/${Uri.encodeComponent(taskId)}'))
      ..headers['authorization'] = 'Bearer $token';
    // The API reads the real type from the file's first bytes, whatever the declared one.
    if (photo != null) req.files.add(await http.MultipartFile.fromPath('photo', photo));
    final sig = proof.signaturePng;
    if (sig != null && sig.isNotEmpty) {
      req.files.add(http.MultipartFile.fromBytes('signature', sig, filename: 'signature.png'));
    }
    final http.Response res;
    try {
      res = await http.Response.fromStream(await (_client ?? http.Client()).send(req).timeout(const Duration(seconds: 60)));
    } on TimeoutException {
      throw ApiException.local('err_timeout');
    } on http.ClientException {
      throw ApiException.local('err_offline');
    } on SocketException {
      throw ApiException.local('err_offline');
    }
    if (res.statusCode < 400) return;
    if (res.statusCode == 413) throw ApiException.local('pod_photo_big', status: 413);
    if (res.statusCode == 429) throw ApiException.local('err_rate_limit', status: 429);
    if (res.statusCode >= 500) throw ApiException.local('err_server', status: res.statusCode);
    Map<String, dynamic> json = {};
    try {
      final d = jsonDecode(res.body);
      if (d is Map<String, dynamic>) json = d;
    } catch (_) {/* not JSON */}
    final m = json['message'];
    final text = m is List ? m.join('\n') : m?.toString();
    throw text == null ? ApiException.local('err_request_failed', status: res.statusCode, args: {'code': res.statusCode}) : ApiException(text, res.statusCode, json['code'] is String ? json['code'] as String : null, frenchText(json['messageFr']));
  }
}

/// The camera and the uploader the delivery screen uses (tests replace them).
class DeliveryProofKit {
  DeliveryProofKit._();
  static final DeliveryProofKit instance = DeliveryProofKit._();

  ProofCamera camera = ImagePickerProofCamera();
  ProofUploader uploader = HttpProofUploader();

  @visibleForTesting
  void reset() {
    camera = ImagePickerProofCamera();
    uploader = HttpProofUploader();
  }
}
