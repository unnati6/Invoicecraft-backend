/**
 * @typedef {Object} OrderFormItem
 * @property {string} description
 * @property {number} quantity
 * @property {number} rate
 * @property {number} [procurementPrice]
 * @property {string} [vendorName]
 * @property {string} [id]
 */

/**
 * @typedef {Object} AdditionalChargeFormData
 * @property {string} name
 * @property {'fixed' | 'percentage'} valueType
 * @property {number} value
 * @property {string} [id]
 */

/**
 * @typedef {Object} Discount
 * @property {boolean} enabled
 * @property {'fixed' | 'percentage'} type
 * @property {number} value
 */

/**
 * Calculates the subtotal, discount amount, tax amount, and grand total for an order form.
 * @param {OrderFormItem[]} items - Array of order form items.
 * @param {AdditionalChargeFormData[]} additionalCharges - Array of additional charges.
 * @param {number} taxRate - The tax rate as a percentage (e.g., 10 for 10%).
 * @param {Discount} discount - Discount details.
 * @returns {Object} An object containing subtotal, discountAmount, taxAmount, and grandTotal.
 */
export function calculateOrderFormTotal(
    items, // Removed type annotation
    additionalCharges, // Removed type annotation
    taxRate, // Removed type annotation
    discount // Removed type annotation
) {
    let mainItemsSubtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    let actualDiscountAmount = 0;

    if (discount.enabled && discount.value > 0) {
        if (discount.type === 'fixed') {
            actualDiscountAmount = discount.value;
        } else if (discount.type === 'percentage') {
            actualDiscountAmount = (mainItemsSubtotal * discount.value) / 100;
        }
    }

    const subtotalAfterDiscount = mainItemsSubtotal - actualDiscountAmount;

    let additionalChargesTotal = 0;
    for (const charge of additionalCharges) {
        if (charge.valueType === 'fixed') {
            additionalChargesTotal += charge.value;
        } else if (charge.valueType === 'percentage') {
            additionalChargesTotal += (subtotalAfterDiscount * charge.value) / 100;
        }
    }

    const subtotalBeforeTax = subtotalAfterDiscount + additionalChargesTotal;
    const taxAmount = (subtotalBeforeTax * taxRate) / 100;
    const grandTotal = subtotalBeforeTax + taxAmount;

    return {
        subtotal: mainItemsSubtotal, // This is the subtotal of items BEFORE discounts/additional charges
        discountAmount: actualDiscountAmount,
        taxAmount,
        grandTotal,
    };
}
