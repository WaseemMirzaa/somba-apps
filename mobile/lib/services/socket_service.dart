import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'env.dart';

/// Single authenticated Socket.IO connection. All reads/writes go through
/// [request] (request→ack); live updates arrive via [on]. No HTTP polling.
class SocketService {
  io.Socket? _socket;

  io.Socket connect(String token) {
    disconnect();
    final socket = io.io(
      Env.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .build(),
    );
    _socket = socket;
    socket.connect();
    return socket;
  }

  io.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  void on(String event, void Function(dynamic data) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) => _socket?.off(event);

  /// Emit and await the server's `{ok, data|error}` acknowledgement.
  Future<dynamic> request(String event, [Map<String, dynamic>? body]) {
    final socket = _socket;
    if (socket == null) {
      return Future.error(StateError('Socket not connected.'));
    }
    final completer = Completer<dynamic>();
    socket.emitWithAck(
      event,
      body ?? const <String, dynamic>{},
      ack: (dynamic res) {
        if (completer.isCompleted) return;
        if (res is Map && res['ok'] == false) {
          completer.completeError(Exception(res['error']?.toString() ?? 'Request failed.'));
        } else if (res is Map && res.containsKey('data')) {
          completer.complete(res['data']);
        } else {
          completer.complete(res);
        }
      },
    );
    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () => throw TimeoutException('No ack for $event'),
    );
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
