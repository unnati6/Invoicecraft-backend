"use strict";
// src/utils/purchaseOrderCalculations.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePurchaseOrderTotal = calculatePurchaseOrderTotal;
/**
 * Calculates the total amount for a purchase order.
 * For purchase orders, the total is usually a simple sum of item quantity * procurementPrice.
 * This function assumes there are no complex discounts or additional charges like in order forms.
 * If your POs have discounts/taxes/additional charges, you'd extend this.
 * @param items - Array of purchase order items.
 * @returns An object containing the total amount.
 */
function calculatePurchaseOrderTotal(items) {
    let total = items.reduce((sum, item) => sum + item.quantity * item.procurementPrice, 0);
    return {
        totalAmount: total,
    };
}
