"use strict";
// src/routes/orderFormRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderFormRouter = void 0;
const express_1 = __importDefault(require("express"));
const express_async_handler_1 = __importDefault(require("express-async-handler")); // Ensures async errors are caught
// Helper function to calculate totals
const calculations_1 = require("../utils/calculations"); // <-- Make sure this path is correct
const createOrderFormRouter = ({ supabase }) => {
    const router = express_1.default.Router();
    // GET all order forms
    router.get('/', (0, express_async_handler_1.default)(async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('order_form')
                .select('*');
            if (error) {
                console.error('Error fetching order forms:', error.message);
                return void res.status(500).json({ error: 'Failed to fetch order forms.', details: error.message });
            }
            return void res.json(data);
        }
        catch (error) {
            console.error('Unexpected error in GET /api/order-forms:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // GET order form by ID
    router.get('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const orderFormId = req.params.id;
        try {
            const { data, error } = await supabase
                .from('order_form')
                .select('*')
                .eq('id', orderFormId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') { // No rows found
                    return void res.status(404).json({ error: 'Order Form not found.' });
                }
                else {
                    console.error(`Error fetching order form ${orderFormId}:`, error.message);
                    return void res.status(500).json({ error: 'Failed to fetch order form.', details: error.message });
                }
            }
            else {
                return void res.json(data);
            }
        }
        catch (error) {
            console.error('Unexpected error in GET /api/order-forms/:id:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // POST a new order form
    router.post('/', (0, express_async_handler_1.default)(async (req, res) => {
        // Destructure all expected fields from the request body
        const { customerId, orderFormNumber, issueDate, validUntilDate, items, additionalCharges, taxRate, discountEnabled, discountDescription, discountType, discountValue, msaContent, msaCoverPageTemplateId, termsAndConditions, status, paymentTerms, customPaymentTerms, commitmentPeriod, customCommitmentPeriod, paymentFrequency, customPaymentFrequency, serviceStartDate, serviceEndDate } = req.body;
        try {
            // 1. Fetch customer details (name and currency)
            const { data: customer, error: customerError } = await supabase
                .from('customer')
                .select('name, currency')
                .eq('id', customerId)
                .single();
            if (customerError || !customer) {
                console.error("Error fetching customer for order form:", customerError?.message || "Customer not found.");
                return void res.status(400).json({ error: 'Customer not found or invalid customer ID provided.' });
            }
            // 2. Calculate financial totals
            const { subtotal, discountAmount, taxAmount, grandTotal } = (0, calculations_1.calculateOrderFormTotal)(items, additionalCharges, taxRate, { enabled: discountEnabled, type: discountType, value: discountValue });
            // 3. Prepare data for Supabase insertion
            const orderFormToInsert = {
                customerId,
                customerActualName: customer.name,
                orderFormNumber,
                issueDate,
                validUntilDate,
                items: JSON.stringify(items),
                additionalCharges: JSON.stringify(additionalCharges),
                taxRate,
                discountEnabled,
                discountDescription: discountDescription || null,
                discountType,
                discountValue,
                discountAmount, // Add the calculated 'discountAmount' here
                msaContent,
                msaCoverPageTemplateId: msaCoverPageTemplateId === '' ? null : msaCoverPageTemplateId,
                termsAndConditions,
                status,
                paymentTerms,
                customPaymentTerms: customPaymentTerms || null, // Include custom field, assuming it's in DB
                commitmentPeriod,
                customCommitmentPeriod: customCommitmentPeriod || null, // Include custom field, assuming it's in DB
                paymentFrequency,
                customPaymentFrequency: customPaymentFrequency || null, // Include custom field, already in DB
                serviceStartDate,
                serviceEndDate,
                subtotal,
                taxAmount,
                total: grandTotal,
                currencyCode: customer.currency || 'USD',
            };
            console.log("DEBUG: orderFormToInsert payload for Supabase:", orderFormToInsert);
            // Insert into Supabase
            const { data, error } = await supabase
                .from('order_form')
                .insert([orderFormToInsert])
                .select()
                .single();
            if (error) {
                console.error('Supabase insert error for new order form:', error.message);
                if (error.code === '23505') {
                    return void res.status(409).json({ error: 'Duplicate order form number or other unique constraint violation.', details: error.message });
                }
                return void res.status(500).json({ error: 'Failed to create order form in database.', details: error.message });
            }
            console.log("DEBUG: New Order Form created successfully:", data);
            return void res.status(201).json(data);
        }
        catch (error) {
            console.error('Unexpected error in POST /api/order-forms:', error.message, error.stack);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // PUT (Update) order form by ID
    router.put('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const orderFormId = req.params.id;
        // Destructure all fields that could potentially be updated
        const { customerId, orderFormNumber, issueDate, validUntilDate, items, additionalCharges, taxRate, discountEnabled, discountDescription, discountType, discountValue, msaContent, msaCoverPageTemplateId, termsAndConditions, status, paymentTerms, customPaymentTerms, commitmentPeriod, customCommitmentPeriod, paymentFrequency, customPaymentFrequency, serviceStartDate, serviceEndDate, } = req.body;
        try {
            // Fetch existing order form to get current values for recalculations and fallbacks
            const { data: existingOrderForm, error: fetchError } = await supabase
                .from('order_form')
                .select(`
          customerId, items, additionalCharges, taxRate,
          discountEnabled, discountType, discountValue,discountDescription,
          paymentTerms, customPaymentTerms, commitmentPeriod, customCommitmentPeriod, paymentFrequency, customPaymentFrequency,
          msaContent, msaCoverPageTemplateId, termsAndConditions, status,
          orderFormNumber, issueDate, validUntilDate, serviceStartDate, serviceEndDate
        `) // Select all fields needed for potential fallbacks
                .eq('id', orderFormId)
                .single();
            if (fetchError || !existingOrderForm) {
                console.error("Error fetching existing order form for update:", fetchError?.message || "Order form not found.");
                return void res.status(404).json({ error: 'Order Form not found for update.' });
            }
            // Determine customerId to use (from updateData or existing form)
            const currentCustomerId = customerId || existingOrderForm.customerId;
            const { data: customer, error: customerError } = await supabase
                .from('customer')
                .select('name, currency')
                .eq('id', currentCustomerId)
                .single();
            if (customerError || !customer) {
                console.error("Error fetching customer for order form update:", customerError?.message || "Customer not found.");
                return void res.status(400).json({ error: 'Customer not found or invalid customer ID provided for update.' });
            }
            // Recalculate totals for update, using the updated data or existing if not provided
            const { subtotal, discountAmount, taxAmount, grandTotal } = (0, calculations_1.calculateOrderFormTotal)(items || existingOrderForm.items, additionalCharges || existingOrderForm.additionalCharges, taxRate ?? existingOrderForm.taxRate, // Use nullish coalescing for numbers
            {
                enabled: discountEnabled ?? existingOrderForm.discountEnabled,
                type: discountType || existingOrderForm.discountType,
                value: discountValue ?? existingOrderForm.discountValue
            });
            const orderFormToUpdate = {
                customerId: currentCustomerId,
                customerActualName: customer.name,
                currencyCode: customer.currency || 'USD',
                // Fields from req.body, with fallback to existing data if not provided in the request
                // Use nullish coalescing (??) for numbers/booleans where `0` or `false` are valid values.
                // Use logical OR (||) for strings where empty string might be a valid value from client, but null for DB.
                orderFormNumber: orderFormNumber ?? existingOrderForm.orderFormNumber,
                issueDate: issueDate ?? existingOrderForm.issueDate,
                validUntilDate: validUntilDate ?? existingOrderForm.validUntilDate,
                items: items ? JSON.stringify(items) : JSON.stringify(existingOrderForm.items),
                additionalCharges: additionalCharges ? JSON.stringify(additionalCharges) : JSON.stringify(existingOrderForm.additionalCharges),
                taxRate: taxRate ?? existingOrderForm.taxRate,
                discountEnabled: discountEnabled ?? existingOrderForm.discountEnabled,
                discountDescription: discountDescription || existingOrderForm.discountDescription || null,
                discountType: discountType || existingOrderForm.discountType || null,
                discountValue: discountValue ?? existingOrderForm.discountValue,
                discountAmount: discountAmount, // Calculated value
                msaContent: msaContent || existingOrderForm.msaContent || null,
                msaCoverPageTemplateId: (msaCoverPageTemplateId === '' || msaCoverPageTemplateId === undefined) ? (existingOrderForm.msaCoverPageTemplateId || null) : msaCoverPageTemplateId,
                termsAndConditions: termsAndConditions || existingOrderForm.termsAndConditions || null,
                status: status || existingOrderForm.status,
                // Specific fields to keep as is (directly from req.body or existing)
                paymentTerms: paymentTerms || existingOrderForm.paymentTerms || null,
                customPaymentTerms: customPaymentTerms || existingOrderForm.customPaymentTerms || null,
                commitmentPeriod: commitmentPeriod || existingOrderForm.commitmentPeriod || null,
                customCommitmentPeriod: customCommitmentPeriod || existingOrderForm.customCommitmentPeriod || null,
                paymentFrequency: paymentFrequency || existingOrderForm.paymentFrequency || null,
                customPaymentFrequency: customPaymentFrequency || existingOrderForm.customPaymentFrequency || null,
                serviceStartDate: serviceStartDate ?? existingOrderForm.serviceStartDate,
                serviceEndDate: serviceEndDate ?? existingOrderForm.serviceEndDate,
                // Calculated totals
                subtotal: subtotal,
                taxAmount: taxAmount,
                total: grandTotal,
            };
            console.log("DEBUG: orderFormToUpdate payload for Supabase:", orderFormToUpdate);
            const { data, error } = await supabase
                .from('order_form')
                .update(orderFormToUpdate)
                .eq('id', orderFormId)
                .select()
                .single();
            if (error) {
                console.error(`Supabase update error for order form ${orderFormId}:`, error.message);
                if (error.code === '23505') {
                    return void res.status(409).json({ error: 'Duplicate order form number or other unique constraint violation.', details: error.message });
                }
                return void res.status(500).json({ error: 'Failed to update order form in database.', details: error.message });
            }
            if (!data) {
                return void res.status(404).json({ error: 'Order Form not found or no changes made.' });
            }
            console.log("DEBUG: Order Form updated successfully:", data);
            return void res.json(data);
        }
        catch (error) {
            console.error('Unexpected error in PUT /api/order-forms/:id:', error.message, error.stack);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // DELETE order form by ID
    router.delete('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const orderFormId = req.params.id;
        try {
            // Supabase delete operation. The count of affected rows is returned directly.
            const { error, count } = await supabase
                .from('order_form')
                .delete()
                .eq('id', orderFormId); // No .select() needed here to get count
            if (error) {
                console.error(`Error deleting order form ${orderFormId}:`, error.message);
                return void res.status(500).json({ error: 'Failed to delete order form.', details: error.message });
            }
            // Check if a row was actually deleted using 'count'
            if (count === 0) {
                return void res.status(404).json({ error: 'Order Form not found or already deleted.' });
            }
            return void res.status(204).send(); // 204 No Content for successful deletion
        }
        catch (error) {
            console.error('Unexpected error in DELETE /api/order-forms/:id:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    return router;
};
exports.createOrderFormRouter = createOrderFormRouter;
