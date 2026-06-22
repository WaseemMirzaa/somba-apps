class RiderTask {
  final String id;
  final String type;
  final String customer;
  final String address;
  final double? codAmount;
  final bool openBox;

  const RiderTask({
    required this.id,
    required this.type,
    required this.customer,
    required this.address,
    this.codAmount,
    this.openBox = false,
  });
}

const mockTasks = [
  RiderTask(id: 'TSK-8841', type: 'delivery', customer: 'Marie Dubois', address: '8 Rue de la Paix, Paris 2e', codAmount: 149.90, openBox: true),
  RiderTask(id: 'TSK-8842', type: 'pickup', customer: 'Somba&Teka Warehouse', address: 'Zone Industrielle, Lyon', openBox: false),
  RiderTask(id: 'TSK-8839', type: 'delivery', customer: 'Jean Petit', address: '45 Champs-Élysées, Paris 8e', codAmount: null, openBox: true),
  RiderTask(id: 'TSK-8835', type: 'return', customer: 'Sophie Laurent', address: 'Neuilly-sur-Seine', openBox: false),
];
