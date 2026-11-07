// Fakes for the proof-of-delivery tests: a camera that answers with a fixed path (or fails) and an uploader that records
// what it was given (or fails).
import 'package:somba_rider/services/delivery_proof.dart';

class FakeProofCamera implements ProofCamera {
  FakeProofCamera({this.path = '/tmp/proof-photo.jpg', this.error});
  String? path;
  Object? error;
  int taken = 0;

  @override
  Future<String?> capture() async {
    taken++;
    if (error != null) throw error!;
    return path;
  }
}

class FakeProofUploader implements ProofUploader {
  FakeProofUploader({this.error});
  Object? error;
  final uploads = <(String, DeliveryProof)>[];
  final order = <String>[];

  @override
  Future<void> upload(String taskId, DeliveryProof proof) async {
    order.add('upload');
    if (error != null) throw error!;
    uploads.add((taskId, proof));
  }
}
