"use strict";
// src/routes/purchaseOrderRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPurchaseOrderRouter = void 0;
const express_1 = __importDefault(require("express"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
// Import the calculation utility
const purchaseOrderCalculations_1 = require("../utils/purchaseOrderCalculations");
// Helper to safely parse JSON strings from request body or DB
const safeParseJson = (jsonString) => {
    if (Array.isArray(jsonString)) {
        return jsonString; // Already an array, no parsing needed
    }
    if (typeof jsonString === 'string' && jsonString.trim() !== '') {
        try {
            const parsed = JSON.parse(jsonString);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (e) {
            console.error("Error parsing JSON string:", jsonString, e);
            return [];
        }
    }
    return []; // Default to empty array for null, undefined, or invalid non-string
};
const createPurchaseOrderRouter = ({ supabase }) => {
    const router = express_1.default.Router();
    // GET all purchase orders
    router.get('/', (0, express_async_handler_1.default)(async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*');
            if (error) {
                console.error('Error fetching purchase orders:', error.message);
                return void res.status(500).json({ error: 'Failed to fetch purchase orders.', details: error.message });
            }
            const formattedData = data.map(po => ({
                ...po,
                id: po.id,
                poNumber: po.po_number,
                vendorName: po.vendor_name,
                issueDate: po.issue_date,
                items: safeParseJson(po.items), // Parse JSONB if necessary
                status: po.status,
                currencyCode: po.currency_code,
                orderFormId: po.order_form_id,
                orderFormNumber: po.order_form_number,
                totalAmount: po.total_amount, // Assuming this column will be added/used
                createdAt: po.created_at,
                updatedAt: po.updated_at,
            }));
            return void res.json(formattedData);
        }
        catch (error) {
            console.error('Unexpected error in GET /api/purchase-orders:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // GET purchase order by ID
    router.get('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const poId = req.params.id;
        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('id', poId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return void res.status(404).json({ error: 'Purchase Order not found.' });
                }
                else {
                    console.error(`Error fetching purchase order ${poId}:`, error.message);
                    return void res.status(500).json({ error: 'Failed to fetch purchase order.', details: error.message });
                }
            }
            const formattedData = {
                ...data,
                id: data.id,
                poNumber: data.po_number,
                vendorName: data.vendor_name,
                issueDate: data.issue_date,
                items: safeParseJson(data.items),
                status: data.status,
                currencyCode: data.currency_code,
                orderFormId: data.order_form_id,
                orderFormNumber: data.order_form_number,
                totalAmount: data.total_amount,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
            };
            return void res.json(formattedData);
        }
        catch (error) {
            console.error('Unexpected error in GET /api/purchase-orders/:id:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // POST a new purchase order
    router.post('/', (0, express_async_handler_1.default)(async (req, res) => {
        const { poNumber, vendorName, issueDate, items, status, currencyCode, orderFormId, orderFormNumber, } = req.body;
        try {
            // Ensure items are parsed
            const parsedItems = safeParseJson(items);
            // Calculate total amount
            const { totalAmount } = (0, purchaseOrderCalculations_1.calculatePurchaseOrderTotal)(parsedItems);
            const purchaseOrderToInsert = {
                po_number: poNumber,
                vendor_name: vendorName,
                issue_date: issueDate, // Assuming issueDate is already 'YYYY-MM-DD' string or compatible
                items: parsedItems, // Store as JSONB
                status: status || 'Draft', // Default to Draft if not provided
                currency_code: currencyCode || 'USD',
                order_form_id: orderFormId || null,
                order_form_number: orderFormNumber || null,
                total_amount: totalAmount, // Store the calculated total
            };
            console.log("DEBUG: purchaseOrderToInsert payload for Supabase:", purchaseOrderToInsert);
            const { data, error } = await supabase
                .from('purchase_orders')
                .insert([purchaseOrderToInsert])
                .select()
                .single();
            if (error) {
                console.error('Supabase insert error for new purchase order:', error.message);
                if (error.code === '23505') { // Unique violation
                    return void res.status(409).json({ error: 'Duplicate PO number or other unique constraint violation.', details: error.message });
                }
                return void res.status(500).json({ error: 'Failed to create purchase order in database.', details: error.message });
            }
            console.log("DEBUG: New Purchase Order created successfully:", data);
            const formattedResponse = {
                ...data,
                id: data.id,
                poNumber: data.po_number,
                vendorName: data.vendor_name,
                issueDate: data.issue_date,
                items: safeParseJson(data.items),
                status: data.status,
                currencyCode: data.currency_code,
                orderFormId: data.order_form_id,
                orderFormNumber: data.order_form_number,
                totalAmount: data.total_amount,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
            };
            return void res.status(201).json(formattedResponse);
        }
        catch (error) {
            console.error('Unexpected error in POST /api/purchase-orders:', error.message, error.stack);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // PUT (Update) a purchase order by ID
    router.put('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const poId = req.params.id;
        const { poNumber, vendorName, issueDate, items, status, currencyCode, orderFormId, orderFormNumber, } = req.body;
        try {
            // Fetch existing PO to get current values for recalculations and fallbacks
            const { data: existingPo, error: fetchError } = await supabase
                .from('purchase_orders')
                .select('*') // Select all to get all current values
                .eq('id', poId)
                .single();
            if (fetchError || !existingPo) {
                console.error("Error fetching existing purchase order for update:", fetchError?.message || "Purchase Order not found.");
                return void res.status(404).json({ error: 'Purchase Order not found for update.' });
            }
            // Parse items from request body and existing data
            const parsedItemsFromReq = safeParseJson(items);
            const existingItemsParsed = safeParseJson(existingPo.items);
            // Determine which items to use for calculation and storage
            const itemsForCalculation = parsedItemsFromReq.length > 0 ? parsedItemsFromReq : existingItemsParsed;
            // Recalculate total amount
            const { totalAmount } = (0, purchaseOrderCalculations_1.calculatePurchaseOrderTotal)(itemsForCalculation);
            const purchaseOrderToUpdate = {
                po_number: poNumber ?? existingPo.po_number,
                vendor_name: vendorName ?? existingPo.vendor_name,
                issue_date: issueDate ?? existingPo.issue_date,
                items: itemsForCalculation, // Store the determined items array
                status: status ?? existingPo.status,
                currency_code: currencyCode ?? existingPo.currency_code,
                order_form_id: orderFormId === '' ? null : (orderFormId ?? existingPo.order_form_id), // Handle empty string for null
                order_form_number: orderFormNumber === '' ? null : (orderFormNumber ?? existingPo.order_form_number), // Handle empty string for null
                total_amount: totalAmount, // Store the calculated total
            };
            console.log("DEBUG: purchaseOrderToUpdate payload for Supabase:", purchaseOrderToUpdate);
            const { data, error } = await supabase
                .from('purchase_orders')
                .update(purchaseOrderToUpdate)
                .eq('id', poId)
                .select()
                .single();
            if (error) {
                console.error(`Supabase update error for purchase order ${poId}:`, error.message);
                if (error.code === '23505') {
                    return void res.status(409).json({ error: 'Duplicate PO number or other unique constraint violation.', details: error.message });
                }
                return void res.status(500).json({ error: 'Failed to update purchase order in database.', details: error.message });
            }
            if (!data) {
                return void res.status(404).json({ error: 'Purchase Order not found or no changes made.' });
            }
            console.log("DEBUG: Purchase Order updated successfully:", data);
            const formattedResponse = {
                ...data,
                id: data.id,
                poNumber: data.po_number,
                vendorName: data.vendor_name,
                issueDate: data.issue_date,
                items: safeParseJson(data.items),
                status: data.status,
                currencyCode: data.currency_code,
                orderFormId: data.order_form_id,
                orderFormNumber: data.order_form_number,
                totalAmount: data.total_amount,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
            };
            return void res.json(formattedResponse);
        }
        catch (error) {
            console.error('Unexpected error in PUT /api/purchase-orders/:id:', error.message, error.stack);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    // DELETE a purchase order by ID
    router.delete('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const poId = req.params.id;
        try {
            const { error, count } = await supabase
                .from('purchase_orders')
                .delete()
                .eq('id', poId);
            if (error) {
                console.error(`Error deleting purchase order ${poId}:`, error.message);
                return void res.status(500).json({ error: 'Failed to delete purchase order.', details: error.message });
            }
            if (count === 0) {
                return void res.status(404).json({ error: 'Purchase Order not found or already deleted.' });
            }
            return void res.status(204).send(); // 204 No Content for successful deletion
        }
        catch (error) {
            console.error('Unexpected error in DELETE /api/purchase-orders/:id:', error.message);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    return router;
};
exports.createPurchaseOrderRouter = createPurchaseOrderRouter;
