import express from 'express';
import asyncHandler from 'express-async-handler';

// Helper function to calculate totals - Ensure .js extension for local imports
import { calculateOrderFormTotal } from '../utils/calculations.js';

// No need for declare module or interface RouterOptions in plain JavaScript.
// The 'req.user' property is assumed to be added by the 'authenticateToken' middleware.

export const createOrderFormRouter = ({ supabase }) => {
  const router = express.Router();

  // Helper function for safe JSONB parsing (from invoiceRoutes, helpful here too)
  const safeParseJsonb = (jsonbInput) => {
    if (jsonbInput === null || jsonbInput === undefined) {
      return [];
    }
    if (typeof jsonbInput === 'string') {
      try {
        const parsed = JSON.parse(jsonbInput);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("Failed to parse JSONB string:", e);
        return [];
      }
    }
    return Array.isArray(jsonbInput) ? jsonbInput : [];
  };

  // GET all order forms for the authenticated user
  router.get('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated; req.user is set by the middleware
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/order-forms');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    try {
      const { data, error } = await supabase
        .from('order_form')
        .select('*')
        .eq('user_id', userId); // IMPORTANT: Filter by user_id

      if (error) {
        console.error('Error fetching order forms:', error.message);
        return res.status(500).json({ error: 'Failed to fetch order forms.', details: error.message });
      }
      return res.json(data);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in GET /api/order-forms:', error.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

   // NEW: GET the next available order form number for the authenticated user
  // This endpoint uses your existing get_next_order_form_sequence RPC.
  // Since your RPC only *reads* the max number and adds 1 (without persistently incrementing a database sequence),
  // it's safe to call this for displaying the next number without creating gaps.
  router.get('/next-number', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/order-forms/next-number');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    let orderFormPrefix = 'OF-'; // Default prefix

    try {
      // --- Get Prefix from Branding Settings ---
      // This is crucial to ensure the correct prefix is used for number generation.
      const { data: brandingSettings, error: brandingError } = await supabase
        .from('branding_settings')
        .select('orderFormPrefix')
        .eq('user_id', userId)
        .single();

      if (brandingError || !brandingSettings || !brandingSettings.orderFormPrefix) {
        console.warn(`Branding settings or custom order form prefix not found for user ${userId}. Using default prefix 'OF-'. Error: ${brandingError?.message}`);
        // No need to create default branding settings here, as the prefix is just for generation.
        // The user will typically set branding settings once.
      } else {
        orderFormPrefix = brandingSettings.orderFormPrefix; // Use retrieved prefix
      }

      // --- Call your existing get_next_order_form_sequence RPC Function ---
      // This function determines the next available number based on existing order forms.
      const { data: nextNumber, error: rpcError } = await supabase.rpc('get_next_order_form_sequence', {
        p_user_id: userId,
        p_prefix: orderFormPrefix
      });

      if (rpcError) {
        console.error('Error calling get_next_order_form_sequence RPC for next-number:', rpcError.message);
        return res.status(500).json({ error: 'Failed to generate next order form number.', details: rpcError.message });
      }

      // The RPC returns a bigint, format it with padding and prefix
      const formattedNumber = String(nextNumber).padStart(3, '0'); // Pad with leading zeros (e.g., 1 -> "001")
      const generatedOrderFormNumber = `${orderFormPrefix}${formattedNumber}`;

      return res.status(200).json({ nextOrderFormNumber: generatedOrderFormNumber });

    } catch (error) {
      console.error('Unexpected error in GET /api/order-forms/next-number:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));
  // GET order form by ID for the authenticated user
  router.get('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/order-forms/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const orderFormId = req.params.id;
    try {
      const { data, error } = await supabase
        .from('order_form')
        .select('*')
        .eq('id', orderFormId)
        .eq('user_id', userId) // IMPORTANT: Filter by user_id
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) { // No rows found or not owned by user
          return res.status(404).json({ error: 'Order Form not found or not accessible by this user.' });
        } else {
          console.error(`Error fetching order form ${orderFormId} for user ${userId}:`, error.message);
          return res.status(500).json({ error: 'Failed to fetch order form.', details: error.message });
        }
      } else {
        return res.json(data);
      }
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in GET /api/order-forms/:id:', error.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // POST a new order form for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for POST /api/order-forms');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const {
      customerId,
      // orderFormNumber - We will generate this on the backend
      issueDate,
      validUntilDate,
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      msaCoverPageTemplateId,
      termsAndConditions,
      status,
      paymentTerms,
      customPaymentTerms,
      commitmentPeriod,
      customCommitmentPeriod,
      paymentFrequency,
      customPaymentFrequency,
      serviceStartDate,
      serviceEndDate
    } = req.body;

    let generatedOrderFormNumber;
    let orderFormPrefix = 'OF-'; // Default prefix

    try {
        // --- Get Prefix from Branding Settings ---
        const { data: brandingSettings, error: brandingError } = await supabase
            .from('branding_settings')
            .select('orderFormPrefix')
            .eq('user_id', userId)
            .single();

        if (brandingError || !brandingSettings) {
            console.warn(`Branding settings not found for user ${userId}. Using default order form prefix 'OF-'. Error: ${brandingError?.message}`);
            // No need to create default branding settings here, as the prefix is just for generation.
            // The user will typically set branding settings once.
        } else {
            orderFormPrefix = brandingSettings.orderFormPrefix || 'OF-'; // Use retrieved prefix or default
        }

        // --- Generate Next Order Form Number using RPC Function ---
        const { data: nextNumber, error: rpcError } = await supabase.rpc('get_next_order_form_sequence', {
            p_user_id: userId,
            p_prefix: orderFormPrefix
        });

        if (rpcError) {
            console.error('Error calling get_next_order_form_sequence RPC:', rpcError.message);
            return res.status(500).json({ error: 'Failed to generate next order form number.', details: rpcError.message });
        }

        const newOrderFormNumberValue = nextNumber; // The RPC already returns the incremented value
        const formattedNumber = String(newOrderFormNumberValue).padStart(3, '0'); // Pad with leading zeros
        generatedOrderFormNumber = `${orderFormPrefix}${formattedNumber}`;

        console.log(`Generated Order Form Number for user ${userId}: ${generatedOrderFormNumber}`);

        // --- Rest of your original POST logic ---
        // 1. Fetch customer details (name and currency) for the current user
        const { data: customer, error: customerError } = await supabase
            .from('customer')
            .select('name, currency')
            .eq('id', customerId)
            .eq('user_id', userId)
            .single();

        if (customerError || !customer) {
            console.error("Error fetching customer for order form:", customerError?.message || "Customer not found.");
            return res.status(400).json({ error: 'Customer not found or not accessible by your account.' });
        }

        // 2. Calculate financial totals
        const { subtotal, discountAmount, taxAmount, grandTotal } = calculateOrderFormTotal(
            items,
            additionalCharges,
            taxRate,
            { enabled: discountEnabled, type: discountType, value: discountValue }
        );

        // 3. Prepare data for Supabase insertion
        const orderFormToInsert = {
            customerId,
            customerActualName: customer.name,
            orderFormNumber: generatedOrderFormNumber, // Use the generated number
            issueDate,
            validUntilDate,
            items: JSON.stringify(items),
            additionalCharges: JSON.stringify(additionalCharges),
            taxRate,
            discountEnabled,
            discountDescription: discountDescription || null,
            discountType,
            discountValue,
            discountAmount,
            msaContent,
            msaCoverPageTemplateId: msaCoverPageTemplateId === '' ? null : msaCoverPageTemplateId,
            termsAndConditions,
            status,
            paymentTerms,
            customPaymentTerms: customPaymentTerms || null,
            commitmentPeriod,
            customCommitmentPeriod: customCommitmentPeriod || null,
            paymentFrequency,
            customPaymentFrequency: customPaymentFrequency || null,
            serviceStartDate,
            serviceEndDate,
            subtotal,
            taxAmount,
            total: grandTotal,
            currencyCode: customer.currency || 'USD',
            user_id: userId
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
            // The unique constraint on orderFormNumber in your table will prevent duplicates
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Generated order form number already exists. Please try again.', details: error.message });
            }
            return res.status(500).json({ error: 'Failed to create order form in database.', details: error.message });
        }

        console.log("DEBUG: New Order Form created successfully:", data);
        return res.status(201).json(data);
    } catch (error) {
        console.error('Unexpected error in POST /api/order-forms:', error.message, error.stack);
        return res.status(500).json({ error: 'Internal server error.' });
    }
  }));
 



  // PUT (Update) order form by ID for the authenticated user
  router.put('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for PUT /api/order-forms/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const orderFormId = req.params.id;
    // Destructure all fields that could potentially be updated
    const {
      customerId,
      orderFormNumber,
      issueDate,
      validUntilDate,
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      msaCoverPageTemplateId,
      termsAndConditions,
      status,
      paymentTerms,
      customPaymentTerms,
      commitmentPeriod,
      customCommitmentPeriod,
      paymentFrequency,
      customPaymentFrequency,
      serviceStartDate,
      serviceEndDate,
    } = req.body;

    try {
      // Fetch existing order form to get current values for recalculations and fallbacks
      // Filter by order form ID AND user ID
      const { data: existingOrderForm, error: fetchError } = await supabase
        .from('order_form')
       .select('*')
        .eq('id', orderFormId)
        .eq('user_id', userId) // IMPORTANT: Verify ownership
        .single();

      if (fetchError || !existingOrderForm) {
        console.error("Error fetching existing order form for update:", fetchError?.message || "Order form not found.");
        return res.status(404).json({ error: 'Order Form not found or not accessible by this user.' });
      }

      // Determine customerId to use (from updateData or existing form)
      const currentCustomerId = customerId || existingOrderForm.customerId;

      // Ensure the selected customer belongs to the same user
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('name, currency')
        .eq('id', currentCustomerId)
        .eq('user_id', userId) // IMPORTANT: Ensure customer belongs to this user
        .single();

      if (customerError || !customer) {
        console.error("Error fetching customer for order form update:", customerError?.message || "Customer not found.");
        return res.status(400).json({ error: 'Customer not found or not accessible by your account for update.' });
      }

      // Ensure JSONB fields are parsed from existing data before merging/calculating
      const parsedExistingItems = safeParseJsonb(existingOrderForm.items);
      const parsedExistingAdditionalCharges = safeParseJsonb(existingOrderForm.additionalCharges);

      // Recalculate totals for update, using the updated data or existing if not provided
      const { subtotal, discountAmount, taxAmount, grandTotal } = calculateOrderFormTotal(
        items !== undefined ? items : parsedExistingItems, // Use incoming or parsed existing
        additionalCharges !== undefined ? additionalCharges : parsedExistingAdditionalCharges, // Use incoming or parsed existing
        parseFloat(taxRate ?? existingOrderForm.taxRate) || 0, // Ensure numeric, fallback to existing or 0
        {
          enabled: discountEnabled ?? existingOrderForm.discountEnabled,
          type: discountType || existingOrderForm.discountType || null,
          value: parseFloat(discountValue ?? existingOrderForm.discountValue) || 0
        }
      );

      const orderFormToUpdate = {
        customerId: currentCustomerId,
        customerActualName: customer.name,
        currencyCode: customer.currency || 'USD',

        orderFormNumber: orderFormNumber ?? existingOrderForm.orderFormNumber,
        issueDate: issueDate ?? existingOrderForm.issueDate,
        validUntilDate: validUntilDate ?? existingOrderForm.validUntilDate,
        items: items !== undefined ? JSON.stringify(items) : JSON.stringify(parsedExistingItems),
        additionalCharges: additionalCharges !== undefined ? JSON.stringify(additionalCharges) : JSON.stringify(parsedExistingAdditionalCharges),
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

        paymentTerms: paymentTerms || existingOrderForm.paymentTerms || null,
        customPaymentTerms: customPaymentTerms || existingOrderForm.customPaymentTerms || null,
        commitmentPeriod: commitmentPeriod || existingOrderForm.commitmentPeriod || null,
        customCommitmentPeriod: customCommitmentPeriod || existingOrderForm.customCommitmentPeriod || null,
        paymentFrequency: paymentFrequency || existingOrderForm.paymentFrequency || null,
        customPaymentFrequency: customPaymentFrequency || existingOrderForm.customPaymentFrequency || null,

        serviceStartDate: serviceStartDate ?? existingOrderForm.serviceStartDate,
        serviceEndDate: serviceEndDate ?? existingOrderForm.serviceEndDate,

        subtotal: subtotal,
        taxAmount: taxAmount,
        total: grandTotal,
        user_id: userId // IMPORTANT: Ensure user_id is included in the update payload for security
      };

      console.log("DEBUG: orderFormToUpdate payload for Supabase:", orderFormToUpdate);

      const { data, error } = await supabase
        .from('order_form')
        .update(orderFormToUpdate)
        .eq('id', orderFormId)
        .eq('user_id', userId) // IMPORTANT: Ensure update is for order form owned by this user
        .select()
        .single();

      if (error) {
        console.error(`Supabase update error for order form ${orderFormId} (user ${userId}):`, error.message);
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Duplicate order form number or other unique constraint violation.', details: error.message });
        }
        return res.status(500).json({ error: 'Failed to update order form in database.', details: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: 'Order Form not found or no changes made, or not accessible by this user.' });
      }
      console.log("DEBUG: Order Form updated successfully:", data);
      return res.json(data);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in PUT /api/order-forms/:id:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // DELETE order form by ID for the authenticated user
  router.delete('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for DELETE /api/order-forms/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const orderFormId = req.params.id;
    try {
      // Delete only if the order form belongs to the authenticated user
      const { error, count } = await supabase
        .from('order_form')
        .delete()
        .eq('id', orderFormId)
        .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

      if (error) {
        // If the error code indicates no row was found (e.g., if ID or user_id didn't match)
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
            console.error(`Order Form ${orderFormId} not found or not owned by user ${userId}:`, error.message);
            return res.status(404).json({ error: 'Order Form not found or not accessible by this user for deletion.' });
        }
        console.error(`Error deleting order form ${orderFormId} for user ${userId}:`, error.message);
        return res.status(500).json({ error: 'Failed to delete order form.', details: error.message });
      }

      // Check if a row was actually deleted using 'count'
      if (count === 0) { // This check is mostly for clarity; the 404 above handles the main case.
        return res.status(404).json({ error: 'Order Form not found or already deleted.' });
      }

      return res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in DELETE /api/order-forms/:id:', error.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  return router;
};
