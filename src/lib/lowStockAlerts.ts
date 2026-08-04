import { calculateConsumption, type ConsumptionPurchaseRecord } from "@/lib/consumptionRate";

// Section 12: reminder triggers when estimated days remaining drops below 5
// (not "reaches" — 5.0 itself doesn't trigger). low_stock_alert_active
// ensures only one alert per episode, resetting once it recovers above the
// threshold, avoiding daily repeat nagging.
const LOW_STOCK_THRESHOLD_DAYS = 5;

export interface ProductConsumptionCheck {
  productId: string;
  lowStockAlertActive: boolean;
  purchases: ConsumptionPurchaseRecord[];
}

export interface NewLowStockAlert {
  productId: string;
  estimatedDaysRemaining: number;
}

export interface LowStockCheckResult {
  newAlerts: NewLowStockAlert[];
  recoveries: string[];
}

export function detectLowStock(
  products: ProductConsumptionCheck[],
  today: Date
): LowStockCheckResult {
  const newAlerts: NewLowStockAlert[] = [];
  const recoveries: string[] = [];

  for (const product of products) {
    const estimate = calculateConsumption(product.purchases, today);
    if (!estimate) {
      continue;
    }

    const isLow = estimate.estimatedDaysRemaining < LOW_STOCK_THRESHOLD_DAYS;

    if (isLow && !product.lowStockAlertActive) {
      newAlerts.push({
        productId: product.productId,
        estimatedDaysRemaining: estimate.estimatedDaysRemaining,
      });
    } else if (!isLow && product.lowStockAlertActive) {
      recoveries.push(product.productId);
    }
  }

  return { newAlerts, recoveries };
}
