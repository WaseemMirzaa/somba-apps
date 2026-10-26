import 'models.dart' show pickLang;

/// Models for returns, disputes, replacements and exchanges (`docs/contracts/after-sale.md` §2 and §3).
/// Every parser is tolerant: an OLD payload (only id / reference / orderId / type / reason / status / resolution)
/// still parses, and unknown or missing fields fall back to a safe default.

Map<String, dynamic> asStringMap(Object? v) => v is Map ? v.map((k, x) => MapEntry(k.toString(), x)) : <String, dynamic>{};

double _num(Object? v) => v is num ? v.toDouble() : (double.tryParse('${v ?? ''}') ?? 0);
int _int(Object? v) => v is num ? v.toInt() : (int.tryParse('${v ?? ''}') ?? 0);
String _str(Object? v) => v == null ? '' : '$v';
String? _strOrNull(Object? v) {
  final s = v == null ? '' : '$v'.trim();
  return s.isEmpty ? null : s;
}

DateTime? _date(Object? v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;
List<String> _strings(Object? v) => v is List ? [for (final e in v) if (e != null && '$e'.trim().isNotEmpty) '$e'] : const [];

/// The first word of a name: sellers are always shown by first name only (privacy, contract §10).
String firstNameOf(String name) {
  final t = name.trim();
  if (t.isEmpty) return '';
  return t.split(RegExp(r'\s+')).first;
}

/// One line of a return / dispute request.
class DisputeItemView {
  const DisputeItemView({
    required this.id,
    this.orderItemId = '',
    this.productId = '',
    this.productName = '',
    this.productNameFr = '',
    this.variant = '',
    this.variantFr = '',
    this.qty = 1,
    this.unitPriceUsd = 0,
    this.refundUsd = 0,
    this.condition,
    this.restockedQty = 0,
  });

  final String id;
  final String orderItemId;
  final String productId;
  final String productName;
  final String productNameFr;
  final String variant;
  final String variantFr;
  final int qty;
  final double unitPriceUsd;
  final double refundUsd;
  final String? condition;
  final int restockedQty;

  String displayName(String lang) => pickLang(lang, productName, productNameFr);
  bool get hasVariant => variant.isNotEmpty && variant != 'Default';
  String displayVariant(String lang) => lang == 'fr' && variantFr.trim().isNotEmpty ? variantFr.trim() : variant;

  /// What this line is worth if refunded in full (the price paid times the units).
  double get valueUsd => unitPriceUsd * qty;

  factory DisputeItemView.fromJson(Map<String, dynamic> j) => DisputeItemView(
        id: _str(j['id']),
        orderItemId: _str(j['orderItemId']),
        productId: _str(j['productId']),
        productName: _str(j['productName']),
        productNameFr: _str(j['productNameFr']),
        variant: _str(j['variant']),
        variantFr: _str(j['variantFr']),
        qty: _int(j['qty']) <= 0 ? 1 : _int(j['qty']),
        unitPriceUsd: _num(j['unitPriceUsd']),
        refundUsd: _num(j['refundUsd']),
        condition: _strOrNull(j['condition']),
        restockedQty: _int(j['restockedQty']),
      );
}

/// A message in a request's thread.
class DisputeMessageView {
  const DisputeMessageView({required this.id, this.authorName = '', this.role = 'customer', this.text = '', this.attachments = const [], this.createdAt});

  final String id;
  final String authorName;

  /// `customer` | `seller` | `admin…` (support) | `warehouse…`.
  final String role;
  final String text;
  final List<String> attachments;
  final DateTime? createdAt;

  bool get isCustomer => role == 'customer';
  bool get isSeller => role == 'seller';

  factory DisputeMessageView.fromJson(Map<String, dynamic> j) => DisputeMessageView(
        id: _str(j['id']),
        authorName: _str(j['authorName']),
        role: _str(j['role']).isEmpty ? 'customer' : _str(j['role']),
        text: _str(j['text']),
        attachments: _strings(j['attachments']),
        createdAt: _date(j['createdAt']),
      );
}

/// A return or dispute request.
class DisputeView {
  const DisputeView({
    required this.id,
    this.reference = '',
    this.orderId = '',
    this.orderReference = '',
    this.type = 'dispute',
    this.category,
    this.reason = '',
    this.status = 'open',
    String? stage,
    this.attachments = const [],
    this.items = const [],
    this.sellerId,
    this.sellerDueAt,
    this.sellerRespondedAt,
    this.sellerReason,
    this.escalatedAt,
    this.resolution,
    this.outcome,
    this.refundUsd = 0,
    this.refundTo = 'wallet',
    this.receivedAt,
    this.gradedAt,
    this.pickupTaskId,
    this.canEscalate = false,
    this.canCancel = false,
    this.createdAt,
    this.updatedAt,
    this.messages,
    this.messageCount = 0,
  }) : _stage = stage;

  final String id;
  final String reference;
  final String orderId;
  final String orderReference;

  /// `return` | `dispute`.
  final String type;
  final String? category;
  final String reason;

  /// `open` | `resolved` | `rejected`.
  final String status;
  final String? _stage;
  final List<String> attachments;
  final List<DisputeItemView> items;
  final String? sellerId;
  final DateTime? sellerDueAt;
  final DateTime? sellerRespondedAt;
  final String? sellerReason;
  final DateTime? escalatedAt;
  final String? resolution;

  /// `refund_full` | `refund_partial` | `replacement` | `reject` | `return_refund` | null.
  final String? outcome;
  final double refundUsd;

  /// `wallet` | `phone`.
  final String refundTo;
  final DateTime? receivedAt;
  final DateTime? gradedAt;
  final String? pickupTaskId;
  final bool canEscalate;
  final bool canCancel;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Only on `disputes:get` (null when this copy came from a list or a push).
  final List<DisputeMessageView>? messages;
  final int messageCount;

  bool get isReturn => type == 'return';

  /// False for an old payload that carries no `stage` (the screens then use the plain status wording).
  bool get hasStage => _stage != null && _stage.isNotEmpty;
  bool get isClosed => status != 'open' || _stage == 'closed';
  bool get isOpen => !isClosed;

  /// Where the request stands. Old payloads have no stage: an open one waits for the seller, the rest is closed.
  String get stage {
    if (isClosed) return 'closed';
    final s = _stage;
    return s == null || s.isEmpty ? 'awaiting_seller' : s;
  }

  /// A cancelled request is `rejected` with this resolution (contract §2.1).
  bool get wasCancelled => status == 'rejected' && (resolution ?? '').toLowerCase().contains('cancelled by the customer');

  /// True when money went back (or is promised) to the customer.
  bool get hasRefund => refundUsd > 0;

  /// Sum of what the request's lines are worth (the preview before the server fixes `refundUsd`).
  double get itemsValueUsd => items.fold(0.0, (s, i) => s + i.valueUsd);

  /// True when the goods travel: a return, once somebody said yes.
  bool get inPickupFlow => isReturn && const {'approved', 'pickup', 'received'}.contains(stage);

  factory DisputeView.fromJson(Map<String, dynamic> j) {
    final msgs = j['messages'];
    return DisputeView(
      id: _str(j['id']),
      reference: _str(j['reference']),
      orderId: _str(j['orderId']),
      orderReference: _str(j['orderReference']),
      type: _str(j['type']) == 'return' ? 'return' : 'dispute',
      category: _strOrNull(j['category']),
      reason: _str(j['reason']),
      status: _str(j['status']).isEmpty ? 'open' : _str(j['status']),
      stage: _strOrNull(j['stage']),
      attachments: _strings(j['attachments']),
      items: j['items'] is List ? [for (final e in j['items'] as List) if (e is Map) DisputeItemView.fromJson(asStringMap(e))] : const [],
      sellerId: _strOrNull(j['sellerId']),
      sellerDueAt: _date(j['sellerDueAt']),
      sellerRespondedAt: _date(j['sellerRespondedAt']),
      sellerReason: _strOrNull(j['sellerReason']),
      escalatedAt: _date(j['escalatedAt']),
      resolution: _strOrNull(j['resolution']),
      outcome: _strOrNull(j['outcome']),
      refundUsd: _num(j['refundUsd']),
      refundTo: _str(j['refundTo']) == 'phone' ? 'phone' : 'wallet',
      receivedAt: _date(j['receivedAt']),
      gradedAt: _date(j['gradedAt']),
      pickupTaskId: _strOrNull(j['pickupTaskId']),
      canEscalate: j['canEscalate'] == true,
      canCancel: j['canCancel'] == true,
      createdAt: _date(j['createdAt']),
      updatedAt: _date(j['updatedAt']),
      messages: msgs is List ? [for (final e in msgs) if (e is Map) DisputeMessageView.fromJson(asStringMap(e))] : null,
      messageCount: _int(j['messageCount']),
    );
  }

  /// This copy with the thread of [other] when this one has none (a list row or a push replaced a fetched detail).
  DisputeView keepingMessagesOf(DisputeView? other) =>
      messages != null || other?.messages == null ? this : copyWith(messages: other!.messages, messageCount: other.messageCount);

  DisputeView copyWith({List<DisputeMessageView>? messages, int? messageCount}) => DisputeView(
        id: id,
        reference: reference,
        orderId: orderId,
        orderReference: orderReference,
        type: type,
        category: category,
        reason: reason,
        status: status,
        stage: _stage,
        attachments: attachments,
        items: items,
        sellerId: sellerId,
        sellerDueAt: sellerDueAt,
        sellerRespondedAt: sellerRespondedAt,
        sellerReason: sellerReason,
        escalatedAt: escalatedAt,
        resolution: resolution,
        outcome: outcome,
        refundUsd: refundUsd,
        refundTo: refundTo,
        receivedAt: receivedAt,
        gradedAt: gradedAt,
        pickupTaskId: pickupTaskId,
        canEscalate: canEscalate,
        canCancel: canCancel,
        createdAt: createdAt,
        updatedAt: updatedAt,
        messages: messages ?? this.messages,
        messageCount: messageCount ?? this.messageCount,
      );
}

/// The ack of `disputes:open`: the first request, and the ids of the others when a return spanned several stores.
class DisputeOpened {
  const DisputeOpened(this.dispute, this.siblings);
  final DisputeView dispute;
  final List<String> siblings;
  bool get isSplit => siblings.isNotEmpty;
}

/// One line the customer may still return.
class EligibleLine {
  const EligibleLine({required this.itemId, this.productId = '', this.productName = '', this.variant = '', this.qty = 1, this.remaining = 0, this.unitPriceUsd = 0});

  final String itemId;
  final String productId;
  final String productName;
  final String variant;
  final int qty;
  final int remaining;
  final double unitPriceUsd;

  bool get hasVariant => variant.isNotEmpty && variant != 'Default';

  factory EligibleLine.fromJson(Map<String, dynamic> j) => EligibleLine(
        itemId: _str(j['itemId']),
        productId: _str(j['productId']),
        productName: _str(j['productName']),
        variant: _str(j['variant']),
        qty: _int(j['qty']),
        remaining: _int(j['remaining']),
        unitPriceUsd: _num(j['unitPriceUsd']),
      );
}

/// What `disputes:eligibility` says about an order.
class ReturnEligibility {
  const ReturnEligibility({required this.eligible, this.reason, this.windowDays = 0, this.deliveredAt, this.endsAt, this.items = const []});

  final bool eligible;

  /// The server's English reason when [eligible] is false.
  final String? reason;
  final int windowDays;
  final DateTime? deliveredAt;
  final DateTime? endsAt;
  final List<EligibleLine> items;

  /// True when the window itself is over (not "not delivered yet" or "returns off").
  bool get windowPassed => !eligible && endsAt != null && windowDays > 0 && DateTime.now().isAfter(endsAt!);

  factory ReturnEligibility.fromJson(Map<String, dynamic> j) => ReturnEligibility(
        eligible: j['eligible'] == true,
        reason: _strOrNull(j['reason']),
        windowDays: _int(j['windowDays']),
        deliveredAt: _date(j['deliveredAt']),
        endsAt: _date(j['endsAt']),
        items: j['items'] is List ? [for (final e in j['items'] as List) if (e is Map) EligibleLine.fromJson(asStringMap(e))] : const [],
      );
}

/// A replacement request (same item again).
class ReplacementView {
  const ReplacementView({
    required this.id,
    this.reference = '',
    this.orderId = '',
    this.orderReference = '',
    this.sellerId,
    this.sku = '',
    this.productName = '',
    this.productNameFr = '',
    this.reason = '',
    this.condition,
    this.qty = 1,
    this.variant,
    this.attachments = const [],
    this.status = 'requested',
    this.dispatchStatus,
    this.sellerDueAt,
    this.sellerRespondedAt,
    this.sellerReason,
    this.deliveryTaskId,
    this.deliveredAt,
    this.disputeId,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String reference;
  final String orderId;
  final String orderReference;
  final String? sellerId;
  final String sku;
  final String productName;
  final String productNameFr;
  final String reason;
  final String? condition;
  final int qty;
  final String? variant;
  final List<String> attachments;

  /// `requested` | `approved` | `received` | `allocated` | `dispatched` | `delivered` | `rejected`.
  final String status;
  final String? dispatchStatus;
  final DateTime? sellerDueAt;
  final DateTime? sellerRespondedAt;
  final String? sellerReason;
  final String? deliveryTaskId;
  final DateTime? deliveredAt;
  final String? disputeId;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String displayName(String lang) => pickLang(lang, productName, productNameFr);
  bool get isRejected => status == 'rejected';
  bool get isDone => status == 'delivered' || status == 'rejected';
  bool get isOpen => !isDone;

  factory ReplacementView.fromJson(Map<String, dynamic> j) => ReplacementView(
        id: _str(j['id']),
        reference: _str(j['reference']),
        orderId: _str(j['orderId']),
        orderReference: _str(j['orderReference']),
        sellerId: _strOrNull(j['sellerId']),
        sku: _str(j['sku']),
        productName: _str(j['productName']),
        productNameFr: _str(j['productNameFr']),
        reason: _str(j['reason']),
        condition: _strOrNull(j['condition']),
        qty: _int(j['qty']) <= 0 ? 1 : _int(j['qty']),
        variant: _strOrNull(j['variant']),
        attachments: _strings(j['attachments']),
        status: _str(j['status']).isEmpty ? 'requested' : _str(j['status']),
        dispatchStatus: _strOrNull(j['dispatchStatus']),
        sellerDueAt: _date(j['sellerDueAt']),
        sellerRespondedAt: _date(j['sellerRespondedAt']),
        sellerReason: _strOrNull(j['sellerReason']),
        deliveryTaskId: _strOrNull(j['deliveryTaskId']),
        deliveredAt: _date(j['deliveredAt']),
        disputeId: _strOrNull(j['disputeId']),
        createdAt: _date(j['createdAt']),
        updatedAt: _date(j['updatedAt']),
      );
}

/// An exchange request (another option of the same product).
class ExchangeView {
  const ExchangeView({
    required this.id,
    this.reference = '',
    this.orderId = '',
    this.orderReference = '',
    this.sellerId,
    this.fromSku = '',
    this.fromName = '',
    this.fromNameFr = '',
    this.fromVariant,
    this.toSku = '',
    this.toName = '',
    this.toNameFr = '',
    this.toVariant,
    this.qty = 1,
    this.priceDiffUsd = 0,
    this.heldUsd = 0,
    this.reason = '',
    this.status = 'requested',
    this.sellerDueAt,
    this.sellerRespondedAt,
    this.sellerReason,
    this.deliveryTaskId,
    this.deliveredAt,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String reference;
  final String orderId;
  final String orderReference;
  final String? sellerId;
  final String fromSku;
  final String fromName;
  final String fromNameFr;
  final String? fromVariant;
  final String toSku;
  final String toName;
  final String toNameFr;
  final String? toVariant;
  final int qty;

  /// (price of the new item now - price paid) x qty; positive = the customer pays, negative = refunded.
  final double priceDiffUsd;
  final double heldUsd;
  final String reason;

  /// `requested` | `approved` | `received` | `ready` | `dispatched` | `delivered` | `rejected`.
  final String status;
  final DateTime? sellerDueAt;
  final DateTime? sellerRespondedAt;
  final String? sellerReason;
  final String? deliveryTaskId;
  final DateTime? deliveredAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String displayFromName(String lang) => pickLang(lang, fromName, fromNameFr);
  String displayToName(String lang) => pickLang(lang, toName, toNameFr);
  bool get isRejected => status == 'rejected';
  bool get isDone => status == 'delivered' || status == 'rejected';
  bool get isOpen => !isDone;

  factory ExchangeView.fromJson(Map<String, dynamic> j) => ExchangeView(
        id: _str(j['id']),
        reference: _str(j['reference']),
        orderId: _str(j['orderId']),
        orderReference: _str(j['orderReference']),
        sellerId: _strOrNull(j['sellerId']),
        fromSku: _str(j['fromSku']),
        fromName: _str(j['fromName']),
        fromNameFr: _str(j['fromNameFr']),
        fromVariant: _strOrNull(j['fromVariant']),
        toSku: _str(j['toSku']),
        toName: _str(j['toName']),
        toNameFr: _str(j['toNameFr']),
        toVariant: _strOrNull(j['toVariant']),
        qty: _int(j['qty']) <= 0 ? 1 : _int(j['qty']),
        priceDiffUsd: _num(j['priceDiffUsd']),
        heldUsd: _num(j['heldUsd']),
        reason: _str(j['reason']),
        status: _str(j['status']).isEmpty ? 'requested' : _str(j['status']),
        sellerDueAt: _date(j['sellerDueAt']),
        sellerRespondedAt: _date(j['sellerRespondedAt']),
        sellerReason: _strOrNull(j['sellerReason']),
        deliveryTaskId: _strOrNull(j['deliveryTaskId']),
        deliveredAt: _date(j['deliveredAt']),
        createdAt: _date(j['createdAt']),
        updatedAt: _date(j['updatedAt']),
      );
}
