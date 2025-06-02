// src/utils/calculations.ts - CORRECTED VERSION
interface OrderFormItem {
    description: string;
    quantity: number;
    rate: number;
    procurementPrice?: number;
    vendorName?: string;
    id?: string; // Optional, if items can have IDs before saving
}

interface AdditionalChargeFormData {
    name: string;
    valueType: 'fixed' | 'percentage';
    value: number;
    id?: string; // Optional
}

interface Discount {
    enabled: boolean;
    type: 'fixed' | 'percentage';
    value: number;
}

/**
 * Calculates the subtotal, discount amount, tax amount, and grand total for an order form.
 * @param items - Array of order form items.
 * @param additionalCharges - Array of additional charges.
 * @param taxRate - The tax rate as a percentage (e.g., 10 for 10%).
 * @param discount - Discount details.
 * @returns An object containing subtotal, discountAmount, taxAmount, and grandTotal.
 */
export function calculateOrderFormTotal(
    items: OrderFormItem[],
    additionalCharges: AdditionalChargeFormData[],
    taxRate: number, // <-- taxRate is now the 3rd argument
    discount: Discount // <-- discount object is now the 4th argument
) {
    let mainItemsSubtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    let actualDiscountAmount = 0;

    if (discount.enabled && discount.value > 0) {
        if (discount.type === 'fixed') { // Use discount.type
            actualDiscountAmount = discount.value;
        } else if (discount.type === 'percentage') { // Use discount.type
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
        // You might also want to return these for more detail in the database
        // subtotalItems: mainItemsSubtotal,
        // additionalChargesTotal: additionalChargesTotal,
        // subtotalBeforeDiscount: subtotalBeforeDiscount, // if you want this
        // taxableAmount: subtotalBeforeTax // if you want this
    };
}