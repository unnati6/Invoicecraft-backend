// src/utils/purchaseOrderCalculations.ts

interface PurchaseOrderItem {
    description: string;
    quantity: number;
    rate: number; // Assuming 'rate' is used for calculation here, even if it's called 'procurementPrice' in Zod schema
    procurementPrice: number; // Sticking to the Zod schema's name for clarity
    id?: string;
}

/**
 * Calculates the total amount for a purchase order.
 * For purchase orders, the total is usually a simple sum of item quantity * procurementPrice.
 * This function assumes there are no complex discounts or additional charges like in order forms.
 * If your POs have discounts/taxes/additional charges, you'd extend this.
 * @param items - Array of purchase order items.
 * @returns An object containing the total amount.
 */
export function calculatePurchaseOrderTotal(
    items: PurchaseOrderItem[]
) {
    let total = items.reduce((sum, item) => sum + item.quantity * item.procurementPrice, 0);

    return {
        totalAmount: total,
    };
}