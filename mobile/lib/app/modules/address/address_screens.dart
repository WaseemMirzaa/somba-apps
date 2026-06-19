import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

/// CF-20 — Address book. Pass `{'select': true}` to pick an address
/// for checkout instead of managing the list.
class AddressBookScreen extends StatelessWidget {
  const AddressBookScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>()..initAddresses();
    final selectMode = (Get.arguments as Map?)?['select'] == true;

    return Scaffold(
      appBar: AppBar(title: Text('addresses'.tr)),
      body: Obx(() {
        if (shop.addresses.isEmpty) {
          return EmptyState(
            icon: Icons.location_off_outlined,
            message: 'no_addresses'.tr,
            actionLabel: 'add_address'.tr,
            onAction: () => Get.toNamed(AppRoutes.addressForm),
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final address in shop.addresses)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  onTap: selectMode ? () => Get.back(result: address) : null,
                  leading: Icon(
                    address.label.toLowerCase().contains('bureau') ||
                            address.label.toLowerCase().contains('office')
                        ? Icons.business_outlined
                        : Icons.home_outlined,
                    color: AppColors.primary,
                  ),
                  title: Row(
                    children: [
                      Text(address.label,
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                      if (address.isDefault) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'default_address'.tr,
                            style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.primary,
                                fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ],
                  ),
                  subtitle: Text(
                      '${address.detail}\n${address.commune}, ${address.city}'),
                  isThreeLine: true,
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) {
                      switch (action) {
                        case 'edit':
                          Get.toNamed(AppRoutes.addressForm,
                              arguments: address);
                        case 'default':
                          shop.setDefault(address);
                        case 'delete':
                          shop.removeAddress(address);
                      }
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                          value: 'edit', child: Text('edit_address'.tr)),
                      PopupMenuItem(
                          value: 'default', child: Text('set_default'.tr)),
                      PopupMenuItem(
                          value: 'delete', child: Text('delete'.tr)),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Get.toNamed(AppRoutes.addressForm),
              icon: const Icon(Icons.add),
              label: Text('add_address'.tr),
            ),
          ],
        );
      }),
    );
  }
}

/// CF-21 — Address form with a Google Map pin (map pin + free text,
/// per the client's addressing answer).
class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({super.key});

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final shop = Get.find<ShopService>();
  late final Address? editing = Get.arguments as Address?;

  late final _label = TextEditingController(text: editing?.label ?? '');
  late final _detail = TextEditingController(text: editing?.detail ?? '');
  late final _phone = TextEditingController(text: editing?.phone ?? '');
  late String _commune = editing?.commune ?? 'Gombe';
  late LatLng _pin = editing?.position ??
      MockData.communePositions[_commune] ??
      MockData.warehouseKinshasa;
  bool _isDefault = false;
  String? _error;
  GoogleMapController? _map;

  @override
  void initState() {
    super.initState();
    _isDefault = editing?.isDefault ?? false;
  }

  @override
  void dispose() {
    _label.dispose();
    _detail.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _save() {
    if (_label.text.trim().isEmpty || _detail.text.trim().isEmpty) {
      setState(() => _error = 'field_required'.tr);
      return;
    }
    final address = Address(
      id: editing?.id ?? 'addr-${DateTime.now().millisecondsSinceEpoch}',
      label: _label.text.trim(),
      detail: _detail.text.trim(),
      commune: _commune,
      city: 'Kinshasa',
      phone: _phone.text.trim(),
      position: _pin,
      isDefault: _isDefault,
    );
    shop.saveAddress(address);
    Get.back();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
          title:
              Text(editing == null ? 'add_address'.tr : 'edit_address'.tr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('pin_on_map'.tr,
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          const SizedBox(height: 8),
          SizedBox(
            height: 220,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                children: [
                  GoogleMap(
                    initialCameraPosition:
                        CameraPosition(target: _pin, zoom: 14),
                    onMapCreated: (controller) => _map = controller,
                    onCameraMove: (position) => _pin = position.target,
                    myLocationButtonEnabled: false,
                    zoomControlsEnabled: false,
                  ),
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: 36),
                      child: Icon(Icons.location_pin,
                          size: 44, color: AppColors.brandRed),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.brandRedLight,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(_error!,
                  style: const TextStyle(
                      color: AppColors.danger, fontSize: 13)),
            ),
          TextField(
            controller: _label,
            decoration: InputDecoration(labelText: 'address_label'.tr),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _detail,
            maxLines: 2,
            decoration: InputDecoration(labelText: 'address_detail'.tr),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _commune,
            decoration: InputDecoration(labelText: 'commune'.tr),
            items: [
              for (final commune in MockData.communesKinshasa)
                DropdownMenuItem(value: commune, child: Text(commune)),
            ],
            onChanged: (commune) {
              if (commune == null) return;
              setState(() {
                _commune = commune;
                _pin = MockData.communePositions[commune] ?? _pin;
              });
              _map?.animateCamera(CameraUpdate.newLatLng(_pin));
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: 'phone_number'.tr),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('set_default'.tr),
            value: _isDefault,
            onChanged: (v) => setState(() => _isDefault = v),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: _save, child: Text('save_address'.tr)),
        ],
      ),
    );
  }
}
