import express from 'express';
import asyncHandler from 'express-async-handler';

// Import the calculation utility - Ensure .js extension
import { calculatePurchaseOrderTotal } from '../utils/purchaseOrderCalculations.js';

// Helper to safely parse JSON strings from request body or DB
const safeParseJson = (jsonString) => {
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
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/purchase-orders');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('user_id', userId);

            if (error) {
                console.error('Error fetching purchase orders:', error.message);
                return res.status(500).json({ error: 'Failed to fetch purchase orders.', details: error.message });
            }

            const formattedData = data.map(po => ({
                ...po,
                id: po.id,
                poNumber: po.po_number, // Map from DB column name
                vendorName: po.vendor_name,
                issueDate: po.issue_date,
                items: safeParseJson(po.items),
                status: po.status,
                currencyCode: po.currency_code,
                orderFormId: po.order_form_id,
                orderFormNumber: po.order_form_number,
                totalAmount: po.total_amount,
                createdAt: po.created_at,
                updatedAt: po.updated_at,
            }));

            return res.json(formattedData);
        } catch (error) {
            console.error('Unexpected error in GET /api/purchase-orders:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));
    router.get('/next-po-number', asyncHandler(async (req, res) => {
        // You might want to add authentication here if only logged-in users can see next PO numbers
        // const userId = req.user?.id;
        // if (!userId) {
        //     return res.status(401).json({ message: 'User not authenticated.' });
        // }

        try {
            // Call the PostgreSQL function directly via Supabase RPC, or a raw query to nextval()
            // Make sure your Supabase service role key (if used on backend) or RLS allows this.
            // Option 1: Using rpc if you define a function in Supabase for this (recommended for complex logic)
            // const { data, error } = await supabase.rpc('get_next_po_number'); // Assuming you have such an RPC function
            // if (error) throw error;
            // const nextPoNum = data; // Assuming RPC returns just the number

            // Option 2: Raw SQL query to get nextval from the sequence (simpler if just nextval)
            const { data, error } = await supabase.from('purchase_orders').select('po_number').order('created_at', { ascending: false }).limit(1);

            if (error) {
                console.error('Error fetching next PO number from DB:', error.message);
                return res.status(500).json({ error: 'Failed to fetch next PO number.', details: error.message });
            }

            let nextPoNum = '';
            if (data && data.length > 0 && data[0].po_number) {
                const lastPoNumber = data[0].po_number;
                // Extract number, increment, and format
                const match = lastPoNumber.match(/PO-(\d+)/);
                if (match) {
                    const currentNum = parseInt(match[1], 10);
                    const nextNum = currentNum + 1;
                    nextPoNum = 'PO-' + String(nextNum).padStart(2, '0'); // Pad with leading zeros
                } else {
                    nextPoNum = 'PO-01'; // Default if no valid POs found or format mismatch
                }
            } else {
                nextPoNum = 'PO-01'; // Default for the very first PO
            }


            // The backend returns the next formatted PO number
            return res.json({ nextPoNumber: nextPoNum });

        } catch (error) {
            console.error('Unexpected error in GET /api/purchase-orders/next-po-number:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));


    // GET purchase order by ID for the authenticated user
    router.get('/:id', asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/purchase-orders/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('id', poId)
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
                    return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user.' });
                } else {
                    console.error(`Error fetching purchase order ${poId} for user ${userId}:`, error.message);
                    return res.status(500).json({ error: 'Failed to fetch purchase order.', details: error.message });
                }
            }

            const formattedData = {
                ...data,
                id: data.id,
                poNumber: data.po_number, // Map from DB column name
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

            return res.json(formattedData);
        } catch (error) {
            console.error('Unexpected error in GET /api/purchase-orders/:id:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // POST a new purchase order for the authenticated user
    router.post('/', asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for POST /api/purchase-orders');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        // Removed poNumber from destructuring - it will be generated by the DB
        const {
            vendorName,
            issueDate,
            items,
            status,
            currencyCode,
            orderFormId,
            orderFormNumber,
        } = req.body;

        try {
            const parsedItems = safeParseJson(items);
            const { totalAmount } = calculatePurchaseOrderTotal(parsedItems);

            const purchaseOrderToInsert = {
                // po_number is no longer sent from the client; the DB trigger handles it
                vendor_name: vendorName,
                issue_date: issueDate,
                items: parsedItems,
                status: status || 'Draft',
                currency_code: currencyCode || 'USD',
                order_form_id: orderFormId || null,
                order_form_number: orderFormNumber || null,
                total_amount: totalAmount,
                user_id: userId
            };

            console.log("DEBUG: purchaseOrderToInsert payload for Supabase:", purchaseOrderToInsert);

            const { data, error } = await supabase
                .from('purchase_orders')
                .insert([purchaseOrderToInsert])
                .select() // Use .select() to get the inserted row back, including the auto-generated po_number
                .single();

            if (error) {
                console.error('Supabase insert error for new purchase order:', error.message);
                if (error.code === '23505') {
                    return res.status(409).json({ error: 'Unique constraint violation (e.g., duplicate PO number if manually set elsewhere).', details: error.message });
                }
                return res.status(500).json({ error: 'Failed to create purchase order in database.', details: error.message });
            }

            console.log("DEBUG: New Purchase Order created successfully:", data);
            const formattedResponse = {
                ...data,
                id: data.id,
                poNumber: data.po_number, // The auto-generated po_number will be in 'data' from .select()
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
        } catch (error) {
            console.error('Unexpected error in POST /api/purchase-orders:', error.message, error.stack);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // PUT (Update) a purchase order by ID for the authenticated user
    router.put('/:id', asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for PUT /api/purchase-orders/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        const {
            poNumber, // Keep poNumber here if you want to allow manual updates to it
            vendorName,
            issueDate,
            items,
            status,
            currencyCode,
            orderFormId,
            orderFormNumber,
        } = req.body;

        try {
            const { data: existingPo, error: fetchError } = await supabase
                .from('purchase_orders')
                .select('*')
                .eq('id', poId)
                .eq('user_id', userId)
                .single();

            if (fetchError || !existingPo) {
                console.error("Error fetching existing purchase order for update:", fetchError?.message || "Purchase Order not found.");
                return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user.' });
            }

            const parsedItemsFromReq = safeParseJson(items);
            const existingItemsParsed = safeParseJson(existingPo.items);

            const itemsForCalculation = parsedItemsFromReq.length > 0 ? parsedItemsFromReq : existingItemsParsed;
            const { totalAmount } = calculatePurchaseOrderTotal(itemsForCalculation);

            const purchaseOrderToUpdate = {
                // po_number can be updated here if provided, otherwise it keeps its existing value
                po_number: poNumber ?? existingPo.po_number,
                vendor_name: vendorName ?? existingPo.vendor_name,
                issue_date: issueDate ?? existingPo.issue_date,
                items: itemsForCalculation,
                status: status ?? existingPo.status,
                currency_code: currencyCode ?? existingPo.currency_code,
                order_form_id: orderFormId === '' ? null : (orderFormId ?? existingPo.order_form_id),
                order_form_number: orderFormNumber === '' ? null : (orderFormNumber ?? existingPo.order_form_number),
                total_amount: totalAmount,
                user_id: userId // Crucial for RLS/security if user_id is part of the update payload
            };

            console.log("DEBUG: purchaseOrderToUpdate payload for Supabase:", purchaseOrderToUpdate);

            const { data, error } = await supabase
                .from('purchase_orders')
                .update(purchaseOrderToUpdate)
                .eq('id', poId)
                .eq('user_id', userId) // Ensure update is for PO owned by this user
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
                poNumber: data.po_number, // Map from DB column name
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
        } catch (error) {
            console.error('Unexpected error in PUT /api/purchase-orders/:id:', error.message, error.stack);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    // DELETE a purchase order by ID for the authenticated user
    router.delete('/:id', asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for DELETE /api/purchase-orders/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const poId = req.params.id;
        try {
            const { error, count } = await supabase
                .from('purchase_orders')
                .delete()
                .eq('id', poId)
                .eq('user_id', userId);

            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
                    console.error(`Purchase Order ${poId} not found or not owned by user ${userId}:`, error.message);
                    return res.status(404).json({ error: 'Purchase Order not found or not accessible by this user for deletion.' });
                }
                console.error(`Error deleting purchase order ${poId} for user ${userId}:`, error.message);
                return res.status(500).json({ error: 'Failed to delete purchase order.', details: error.message });
            }

            if (count === 0) {
                return res.status(404).json({ error: 'Purchase Order not found or already deleted.' });
            }

            return res.status(204).send();
        } catch (error) {
            console.error('Unexpected error in DELETE /api/purchase-orders/:id:', error.message);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }));

    return router;
};