import 'package:flutter/material.dart';
import '../l10n/compliance_strings.dart';
import '../l10n/strings.dart';
import '../services/compliance_models.dart';
import '../services/compliance_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'compliance_widgets.dart';

const kVehicleRoute = 'rider/vehicle';

/// The rider's vehicle, read only: the warehouse (or the fleet team) keeps it up to date. Insurance and service dates that are
/// close or past show as reminders; nothing here blocks the rider.
class RiderVehicleScreen extends StatefulWidget {
  const RiderVehicleScreen({super.key});
  @override
  State<RiderVehicleScreen> createState() => _RiderVehicleScreenState();
}

class _RiderVehicleScreenState extends State<RiderVehicleScreen> {
  final _store = ComplianceStore.instance;

  @override
  void initState() {
    super.initState();
    _store.load();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.vehicleTitle),
      body: ListenableBuilder(
        listenable: _store,
        builder: (context, _) => RefreshIndicator(
          onRefresh: _store.load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: _children(context, s),
          ),
        ),
      ),
    );
  }

  List<Widget> _children(BuildContext context, Strings s) {
    if (!_store.vehicleLoaded) {
      if (_store.vehicleError != null) {
        return [
          SurfaceCard(
            key: const ValueKey('vehicle-error'),
            child: Column(children: [
              Text(s.docLoadFailed, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
              const SizedBox(height: 8),
              TextButton(key: const ValueKey('vehicle-retry'), onPressed: _store.load, child: Text(s.retry)),
            ]),
          ),
        ];
      }
      return const [Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))];
    }
    final v = _store.vehicle;
    final now = _store.clock();
    if (!v.exists) {
      return [
        SurfaceCard(key: const ValueKey('vehicle-none'), child: Text(s.vehicleNone, style: const TextStyle(color: AppColors.muted, height: 1.4))),
        const SizedBox(height: 10),
        Text(s.vehicleReadonly, style: const TextStyle(color: AppColors.faint, fontSize: 12.5, height: 1.4)),
      ];
    }
    final ins = v.insurance(now), svc = v.service(now);
    final warnings = <Widget>[
      if (ins.state == ExpiryState.expired) WarningStrip(s.insuranceExpired(fmtDay(s, v.insuranceValidUntil)), key: const ValueKey('warn-insurance'), color: kBadText),
      if (ins.state == ExpiryState.expiring) WarningStrip(s.insuranceExpiring(ins.daysLeft!), key: const ValueKey('warn-insurance'), color: kWarnText),
      if (svc.state == ExpiryState.expired) WarningStrip(s.serviceOverdue(fmtDay(s, v.nextServiceOn)), key: const ValueKey('warn-service'), color: kBadText),
      if (svc.state == ExpiryState.expiring) WarningStrip(s.serviceDue(svc.daysLeft!), key: const ValueKey('warn-service'), color: kWarnText),
    ];
    final title = [v.model, s.vehicleTypeName(v.type)].where((e) => e != null && e.isNotEmpty).join(' · ');
    final odometer = v.odometerKm == null ? '—' : '${_km(s, v.odometerKm!)} km';
    return [
      for (final w in warnings) ...[w, const SizedBox(height: 10)],
      SurfaceCard(
        key: const ValueKey('vehicle-card'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 28),
            const SizedBox(width: 12),
            Expanded(child: Text(title.isEmpty ? s.vehicleTitle : title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16.5))),
          ]),
          const Divider(height: 24),
          DetailRow(s.vehiclePlate, v.plate ?? '—'),
          DetailRow(s.vehicleColour, v.colour ?? '—'),
          DetailRow(s.vehicleOdometer, odometer),
          DetailRow(s.vehicleFuel, v.fuel == null ? '—' : s.fuelName(v.fuel)),
          DetailRow(s.vehicleInsurance, fmtDay(s, v.insuranceValidUntil)),
          DetailRow(s.vehicleLastService, fmtDay(s, v.lastServiceOn)),
          DetailRow(s.vehicleNextService, fmtDay(s, v.nextServiceOn)),
        ]),
      ),
      const SizedBox(height: 12),
      Text(s.vehicleReadonly, key: const ValueKey('vehicle-readonly'), style: const TextStyle(color: AppColors.faint, fontSize: 12.5, height: 1.4)),
    ];
  }

  static String _km(Strings s, int n) {
    final digits = n.toString();
    final sep = s.isFr ? ' ' : ',';
    return digits.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => sep);
  }
}
