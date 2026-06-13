abstract class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const firstPassword = '/first-password';
  static const kyc = '/kyc';
  static const shell = '/shell';
  static const taskDetail = '/task/:id';
  static const pickupProof = '/task/:id/proof';
  static const warehouseCheckIn = '/task/:id/warehouse';
  static const batchOverview = '/batch/:id';
  static const batchComplete = '/batch/:id/complete';
  static const stopDetail = '/stop/:id';
  static const pod = '/stop/:id/pod';
  static const failedDelivery = '/stop/:id/fail';
  static const notifications = '/notifications';

  static String task(String id) => '/task/$id';
  static String taskProof(String id) => '/task/$id/proof';
  static String taskWarehouse(String id) => '/task/$id/warehouse';
  static String batch(String id) => '/batch/$id';
  static String batchDone(String id) => '/batch/$id/complete';
  static String stop(String id) => '/stop/$id';
  static String stopPod(String id) => '/stop/$id/pod';
  static String stopFail(String id) => '/stop/$id/fail';
}
