import type { RiderTask } from "./rider";
import type { DeliveryEntity } from "./warehouse-entities";

export type DeliveryProduct = {
  productId: number | string;
  name: string;
  sku: string;
  variant: string;
  qty: number;
  image: string;
};

export type DeliveryTimelineEvent = {
  time: string;
  label: string;
  done?: boolean;
  detail?: string;
};

export type DeliveryDetailData = {
  id: string;
  orderId: string;
  status: string;
  eta: string;
  zone: string;
  paymentType: string;
  currentStop?: number;
  totalStops?: number;
  customer: { name: string; phone: string; address: string; id?: number | string };
  seller: { name: string; store: string; phone: string; id?: number | string };
  products: DeliveryProduct[];
  timeline: DeliveryTimelineEvent[];
  detailHref?: string;
};

export function riderTaskToDeliveryDetail(task: RiderTask): DeliveryDetailData {
  return {
    id: task.id,
    orderId: task.orderId,
    status: task.status,
    eta: task.eta,
    zone: task.zone,
    paymentType: task.paymentType,
    customer: {
      name: task.customer,
      phone: task.phone,
      address: task.address,
    },
    seller: {
      name: task.sellerName,
      store: task.sellerStore,
      phone: task.sellerPhone,
    },
    products: task.products,
    timeline: task.timeline,
    detailHref: `/rider/tasks/${task.id}`,
  };
}

export function deliveryEntityToDetail(delivery: DeliveryEntity): DeliveryDetailData {
  return {
    id: delivery.id,
    orderId: delivery.orderId,
    status: delivery.status,
    eta: delivery.eta,
    zone: delivery.zone,
    paymentType: delivery.paymentType,
    currentStop: delivery.currentStop,
    totalStops: delivery.totalStops,
    customer: {
      id: delivery.customerId,
      name: delivery.customer,
      phone: delivery.customerPhone,
      address: delivery.customerAddress,
    },
    seller: {
      id: delivery.sellerId,
      name: delivery.seller,
      store: delivery.sellerStore,
      phone: delivery.sellerPhone,
    },
    products: delivery.products,
    timeline: delivery.timeline,
    detailHref: `/warehouse/deliveries/${delivery.id}`,
  };
}
