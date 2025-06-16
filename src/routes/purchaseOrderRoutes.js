import express from 'express';
import asyncHandler from 'express-async-handler';

// Import the calculation utility - Ensure .js extension
import { calculatePurchaseOrderTotal } from '../utils/purchaseOrderCalculations.js';

// No need for interfaces or declare module in plain JavaScript.
// The 'req.user' property is assumed to be added by the 'authenticateToken' middleware.

// Helper to safely parse JSON strings from request body or DB
const safeParseJson = (jsonString) => { // Removed type annotation
    if (Array.isArray(jsonString)) {
        return jsonString; // Already an array, no parsing needed
    }
    if (typeof jsonString === 'string' && jsonString.trim() !== '') {
        try {
            const parsed = JSON.parse(jsonString);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Error parsing JSON string:", jsonString, e);
            return [];
        }
    }
    return []; // Default to empty array for null, undefined, or invalid non-string
};

export const createPurchaseOrderRouter = ({ supabase }) => {
    const router = express.Router();

    // GET all purchase orders for the authenticated user
    router.get('/', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/Purchaseorder');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        try {
            // Filter purchase orders by the authenticated user's ID
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('user_id', userId); // IMPORTANT: Filter by user_id

            if (error) {
                console.error('Error fetching purchase orders:', error.message);
                return res.status(500).json({ error: 'Failed to fetch purchase orders.', details: error.message });
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
                totalAmount: po.total_amount,
                createdAt: po.created_at,
                updatedAt: po.updated_at,
                // user_id: po.user_id // Optionally include if needed on frontend
            }));

            return res.json(formattedData);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in GET /api/purchase-orders:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // GET purchase order by ID for the authenticated user
    router.get('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/Purchaseorder/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        try {
            // Filter by PO ID AND user ID
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('id', poId)
                .eq('user_id', userId) // IMPORTANT: Filter by user_id
                .single();

            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) { // No rows found or not owned by user
                    return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user.' });
                } else {
                    console.error(`Error fetching purchase order ${poId} for user ${userId}:`, error.message);
                    return res.status(500).json({ error: 'Failed to fetch purchase order.', details: error.message });
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
                // user_id: data.user_id // Optionally include if needed on frontend
            };

            return res.json(formattedData);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in GET /api/purchase-orders/:id:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // POST a new purchase order for the authenticated user
    router.post('/', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for POST /api/Purchaseorder');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const {
            poNumber,
            vendorName,
            issueDate,
            items,
            status,
            currencyCode,
            orderFormId,
            orderFormNumber,
        } = req.body;

        try {
            // Ensure items are parsed
            const parsedItems = safeParseJson(items);

            // Calculate total amount
            const { totalAmount } = calculatePurchaseOrderTotal(parsedItems);

            const purchaseOrderToInsert = {
                po_number: poNumber,
                vendor_name: vendorName,
                issue_date: issueDate,
                items: parsedItems, // Store as JSONB
                status: status || 'Draft', // Default to Draft if not provided
                currency_code: currencyCode || 'USD',
                order_form_id: orderFormId || null,
                order_form_number: orderFormNumber || null,
                total_amount: totalAmount, // Store the calculated total
                user_id: userId // IMPORTANT: Associate PO with the authenticated user
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
                    return res.status(409).json({ error: 'Duplicate PO number or other unique constraint violation.', details: error.message });
                }
                return res.status(500).json({ error: 'Failed to create purchase order in database.', details: error.message });
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
            return res.status(201).json(formattedResponse);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in POST /api/purchase-orders:', error.message, error.stack);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // PUT (Update) a purchase order by ID for the authenticated user
    router.put('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for PUT /api/Purchaseorder/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        const {
            poNumber,
            vendorName,
            issueDate,
            items,
            status,
            currencyCode,
            orderFormId,
            orderFormNumber,
        } = req.body;

        try {
            // Fetch existing PO to get current values for recalculations and fallbacks
            // Filter by PO ID AND user ID
            const { data: existingPo, error: fetchError } = await supabase
                .from('purchase_orders')
                .select('*') // Select all to get all current values
                .eq('id', poId)
                .eq('user_id', userId) // IMPORTANT: Verify ownership
                .single();

            if (fetchError || !existingPo) {
                console.error("Error fetching existing purchase order for update:", fetchError?.message || "Purchase Order not found.");
                return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user.' });
            }

            // Parse items from request body and existing data
            const parsedItemsFromReq = safeParseJson(items);
            const existingItemsParsed = safeParseJson(existingPo.items);

            // Determine which items to use for calculation and storage
            const itemsForCalculation = parsedItemsFromReq.length > 0 ? parsedItemsFromReq : existingItemsParsed;

            // Recalculate total amount
            const { totalAmount } = calculatePurchaseOrderTotal(itemsForCalculation);

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
                user_id: userId // IMPORTANT: Ensure user_id is included in the update payload for security
            };

            console.log("DEBUG: purchaseOrderToUpdate payload for Supabase:", purchaseOrderToUpdate);

            const { data, error } = await supabase
                .from('purchase_orders')
                .update(purchaseOrderToUpdate)
                .eq('id', poId)
                .eq('user_id', userId) // IMPORTANT: Ensure update is for PO owned by this user
                .select()
                .single();

            if (error) {
                console.error(`Supabase update error for purchase order ${poId} (user ${userId}):`, error.message);
                if (error.code === '23505') {
                    return res.status(409).json({ error: 'Duplicate PO number or other unique constraint violation.', details: error.message });
                }
                return res.status(500).json({ error: 'Failed to update purchase order in database.', details: error.message });
            }
            if (!data) {
                return res.status(404).json({ error: 'Purchase Order not found or no changes made, or not accessible by this user.' });
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

            return res.json(formattedResponse);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in PUT /api/purchase-orders/:id:', error.message, error.stack);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // DELETE a purchase order by ID for the authenticated user
    router.delete('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for DELETE /api/Purchaseorder/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        try {
            // Delete only if the purchase order belongs to the authenticated user
            const { error, count } = await supabase
                .from('purchase_orders')
                .delete()
                .eq('id', poId)
                .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

            if (error) {
                // If the error code indicates no row was found (e.g., if ID or user_id didn't match)
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
                    console.error(`Purchase Order ${poId} not found or not owned by user ${userId}:`, error.message);
                    return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user for deletion.' });
                }
                console.error(`Error deleting purchase order ${poId} for user ${userId}:`, error.message);
                return res.status(500).json({ error: 'Failed to delete purchase order.', details: error.message });
            }

            if (count === 0) { // This check is mostly for clarity; the 404 above handles the main case.
                return res.status(404).json({ error: 'Purchase Order not found or already deleted.' });
            }

            return res.status(204).send(); // 204 No Content for successful deletion
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in DELETE /api/purchase-orders/:id:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    return router;
};
