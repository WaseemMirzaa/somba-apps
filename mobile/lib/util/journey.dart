import '../services/models.dart';

/// One stop on a parcel's way to the customer: picked up from the seller -> at the seller's warehouse -> in transfer
/// (only when the parcels come from another warehouse) -> at the customer's warehouse -> out for delivery -> delivered.
/// A parcel relayed through other warehouses has one `in_transfer` step per hop, each followed by an `at_hub` step
/// at the relay warehouse (the last hop is followed by `at_destination`).
class JourneyStep {
  const JourneyStep(this.key,
      {this.done = false,
      this.current = false,
      this.at,
      this.hubId,
      this.hubIds = const [],
      this.hubNames = const [],
      this.hop,
      this.hops,
      this.drivers = const [],
      this.runs = const []});

  /// `picked_up` | `at_origin` | `in_transfer` | `at_hub` | `at_destination` | `out_for_delivery` | `delivered`.
  final String key;
  final bool done;

  /// The parcel is in this step right now.
  final bool current;

  /// When it happened, if the server said (null: unknown).
  final DateTime? at;

  /// The warehouse this step is about (`at_origin`, `at_destination`; the origin ones for `in_transfer`).
  final String? hubId;
  final List<String> hubIds;

  /// Warehouse names the server gave on the legs (a hop step names the warehouse it travels to / is at).
  final List<String> hubNames;

  /// Which hop of how many an `in_transfer` / `at_hub` step belongs to (null on a single-hop route).
  final int? hop;
  final int? hops;

  /// First names of the drivers carrying this step's transfer (each hop has its own), when the server sends them.
  final List<String> drivers;

  /// References of the transfer runs ("TR-0042") this step's parcels travel in, when the server sends them.
  final List<String> runs;

  JourneyStep asCurrent() =>
      JourneyStep(key, current: true, at: at, hubId: hubId, hubIds: hubIds, hubNames: hubNames, hop: hop, hops: hops, drivers: drivers, runs: runs);
}

/// The order's journey, from its status, its lines and (when the server sends them) its legs. Cancelled and returned
/// orders have none. Pure: the same order always gives the same steps.
List<JourneyStep> orderJourney(OrderDto o) {
  if (o.status == 'cancelled' || o.status == 'returned' || o.status == 'pending' || o.status == 'confirmed') return const [];
  final live = o.items.where((i) => !i.isCancelled).toList();
  final dest = o.destinationHubId;
  final origins = o.originHubIds.toSet().toList();
  final transfer = dest != null && origins.any((h) => h != dest);
  final delivered = o.status == 'delivered';
  final out = o.status == 'out_for_delivery' || delivered;
  final allReceived = live.isNotEmpty && live.every((i) => i.fulfilment == 'received');
  final allReady = live.isNotEmpty && live.every((i) => i.fulfilment != 'open');

  DateTime? latest(Iterable<DateTime?> times) {
    final t = times.whereType<DateTime>().toList()..sort();
    return t.isEmpty ? null : t.last;
  }

  List<OrderLeg> kind(String k) => o.legs.where((l) => l.kind == k).toList();
  bool reached(OrderLeg l) => const {'picked_up', 'in_transit', 'delivered'}.contains(l.status) || l.pickedUpAt != null;
  bool finished(OrderLeg l) => l.status == 'delivered' || l.receivedAt != null || l.deliveredAt != null;

  final pickups = kind('pickup');
  final transfers = kind('transfer');
  final deliveries = kind('delivery');

  // A parcel relayed through other warehouses: the number of hops comes from the legs (each knows `hops`) and from the
  // planned routes; with none of that the route is one hop, exactly as before.
  var hopCount = 1;
  for (final l in transfers) {
    hopCount = [hopCount, l.hops ?? 1, l.hop ?? 1].reduce((a, b) => a > b ? a : b);
  }
  for (final r in o.routeBySeller.values) {
    if (r.length - 1 > hopCount) hopCount = r.length - 1;
  }
  final multiHop = hopCount >= 2;
  int hopOf(OrderLeg l) => l.hop ?? 1;
  // Hop legs appear one by one (the next is created when the parcel is scanned in at the relay): the final hop has
  // been reached once every leg is finished and none is still waiting for its next hop.
  bool relayed(OrderLeg l) => hopOf(l) >= (l.hops ?? hopCount) || transfers.any((m) => hopOf(m) == hopOf(l) + 1);

  // Step flags, from the legs when the server sent them, else from the order's status and lines.
  final pickedUp = pickups.isNotEmpty ? pickups.every(reached) : allReceived || out;
  final atOrigin = pickups.isNotEmpty ? pickups.every(finished) : allReceived || out;
  final atDest = multiHop
      ? out || (transfers.isNotEmpty && transfers.every(finished) && transfers.every(relayed) && transfers.any((l) => hopOf(l) >= (l.hops ?? hopCount)))
      : transfers.isNotEmpty ? transfers.every(finished) : (out || (!transfer && atOrigin));
  final inTransferDone = atDest || out;
  final outDone = deliveries.isNotEmpty ? deliveries.any(reached) || out : out;

  final steps = <JourneyStep>[
    JourneyStep('picked_up',
        done: pickedUp, at: latest(pickups.map((l) => l.pickedUpAt)), hubIds: origins),
    JourneyStep('at_origin',
        done: atOrigin, at: pickups.isNotEmpty ? latest(pickups.map((l) => l.receivedAt ?? l.deliveredAt)) : latest(live.map((i) => i.receivedAt)), hubIds: origins, hubId: origins.length == 1 ? origins.first : null),
    if (multiHop)
      ...hopSteps(o, transfers, hopCount, finished: finished, done: (k, legs) => legs.isNotEmpty ? legs.every(finished) : (atDest || out || transfers.any((l) => hopOf(l) > k)), latest: latest, hopOf: hopOf)
    else if (transfer)
      JourneyStep('in_transfer',
          done: inTransferDone,
          at: latest(transfers.map((l) => l.pickedUpAt)),
          hubIds: origins,
          hubId: dest,
          hubNames: _names(transfers),
          drivers: _drivers(transfers),
          runs: _runs(transfers)),
    JourneyStep('at_destination',
        done: atDest,
        at: multiHop
            ? latest(transfers.where((l) => hopOf(l) >= (l.hops ?? hopCount)).map((l) => l.receivedAt ?? l.deliveredAt))
            : latest(transfers.map((l) => l.receivedAt ?? l.deliveredAt)) ?? (!transfer ? latest(live.map((i) => i.receivedAt)) : null),
        hubId: dest),
    JourneyStep('out_for_delivery',
        done: outDone, at: latest(deliveries.map((l) => l.pickedUpAt)) ?? (o.status == 'out_for_delivery' ? o.updatedAt : null)),
    JourneyStep('delivered', done: delivered, at: latest(deliveries.map((l) => l.deliveredAt)) ?? (delivered ? o.updatedAt : null)),
  ];

  // The current step is the first one not done once the pickup has started (or the seller has packed).
  final started = o.status == 'processing' || o.status == 'shipped' || out || allReady;
  var marked = false;
  return [
    for (final s in steps)
      if (!marked && !s.done && started)
        () {
          marked = true;
          return s.asCurrent();
        }()
      else
        s,
  ];
}

/// The steps of a relayed parcel: for every hop "in transfer to X", and, unless it is the last hop, "at X" (a relay
/// warehouse). The warehouse names come from the hop's legs, else from the order's planned routes (as ids).
List<JourneyStep> hopSteps(
  OrderDto o,
  List<OrderLeg> transfers,
  int hopCount, {
  required bool Function(OrderLeg) finished,
  required bool Function(int hop, List<OrderLeg> legs) done,
  required DateTime? Function(Iterable<DateTime?>) latest,
  required int Function(OrderLeg) hopOf,
}) {
  final steps = <JourneyStep>[];
  for (var k = 1; k <= hopCount; k++) {
    final legs = transfers.where((l) => hopOf(l) == k).toList();
    final names = _names(legs);
    final ids = <String>{
      if (names.isEmpty)
        for (final r in o.routeBySeller.values)
          if (r.length > k) r[k],
    }.toList();
    final isDone = done(k, legs);
    steps.add(JourneyStep('in_transfer',
        done: isDone, at: latest(legs.map((l) => l.pickedUpAt)), hubNames: names, hubIds: ids, hop: k, hops: hopCount, drivers: _drivers(legs), runs: _runs(legs)));
    if (k < hopCount) {
      steps.add(JourneyStep('at_hub',
          done: isDone, at: latest(legs.map((l) => l.receivedAt ?? l.deliveredAt)), hubNames: names, hubIds: ids, hop: k, hops: hopCount));
    }
  }
  return steps;
}

/// The distinct first names of the drivers on [legs], in leg order.
List<String> _drivers(Iterable<OrderLeg> legs) => <String>{for (final l in legs) if (l.driverFirstName != null) l.driverFirstName!}.toList();

/// The distinct references of the transfer runs [legs] travel in, in leg order.
List<String> _runs(Iterable<OrderLeg> legs) => <String>{for (final l in legs) if (l.runReference != null) l.runReference!}.toList();

/// The distinct names of the warehouses [legs] travel to (the flat `toHubName`, or the name inside a `toHub` object).
List<String> _names(Iterable<OrderLeg> legs) => <String>{for (final l in legs) if (l.toHubName != null) l.toHubName!}.toList();
