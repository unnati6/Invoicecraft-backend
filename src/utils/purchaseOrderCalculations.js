/**
 * @typedef {Object} PurchaseOrderItem
 * @property {string} description
 * @property {number} quantity
 * @property {number} rate
 * @property {number} procurementPrice
 * @property {string} [id]
 */

/**
 * Calculates the total amount for a purchase order.
 * For purchase orders, the total is usually a simple sum of item quantity * procurementPrice.
 * This function assumes there are no complex discounts or additional charges like in order forms.
 * If your POs have discounts/taxes/additional charges, you'd extend this.
 * @param {PurchaseOrderItem[]} items - Array of purchase order items.
 * @returns {Object} An object containing the total amount.
 */
export function calculatePurchaseOrderTotal(
    items // Removed type annotation
) {
    let total = items.reduce((sum, item) => sum + item.quantity * item.procurementPrice, 0);

    return {
        totalAmount: total,
    };
}
