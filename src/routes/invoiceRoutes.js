import express from 'express';
import asyncHandler from 'express-async-handler';
import { calculateOrderFormTotal } from '../utils/calculations.js'; // Ensure .js extension for local imports

// No need for declare module or interface RouterOptions in plain JavaScript.
// The 'req.user' property is assumed to be added by the 'authenticateToken' middleware.

export const createInvoiceRouter = ({ supabase }) => {
  const router = express.Router();

  // GET all invoices for the authenticated user
  router.get('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated; req.user is set by the middleware
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/invoices');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    console.log('[BACKEND REQUEST] GET /api/invoices for user:', userId);
    console.log('[BACKEND REQUEST] Headers:', req.headers);

    try {
      // Filter invoices by the authenticated user's ID
      const { data, error } = await supabase.from('invoice')
        .select('*')
        .eq('user_id', userId); // IMPORTANT: Filter by user_id

      if (error) {
        console.error('⛔️ [Backend ERROR] Error fetching invoices from Supabase:', error.message);
        return res.status(500).json({ error: 'Failed to fetch invoices from database', details: error.message });
      }

      if (!data || data.length === 0) {
        console.log('✅ [Backend SUCCESS] No invoices found for user. Returning empty array.');
        return res.status(200).json([]);
      }

      console.log(`✅ [Backend SUCCESS] Successfully fetched ${data.length} invoices for user ${userId}.`);
      return res.status(200).json(data);
    } catch (unexpectedError) { // Removed type annotation
      console.error('🔥 [Backend FATAL ERROR] Unexpected error in GET /api/invoices route:', unexpectedError.message);
      return res.status(500).json({ error: 'Internal server error occurred while fetching invoices.' });
    }
  }));

  // GET invoice by ID for the authenticated user
  router.get('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    console.log(`[Backend] Attempting to find invoice with ID: ${invoiceId} for user: ${userId}`);
    try {
      // Filter by invoice ID AND user ID
      const { data, error } = await supabase
        .from('invoice')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', userId) // IMPORTANT: Filter by user_id
        .single();

      console.log(`[Backend] Database query result for ID ${invoiceId} (user ${userId}):`, data);
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          res.status(404).json({ error: 'Invoice not found or not accessible by this user.' });
          return;
        } else {
          console.error(`Error fetching invoice ${invoiceId} for user ${userId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
        return;
      }
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in GET /api/invoices/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new invoice for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for POST /api/invoices');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    console.log('[BACKEND DEBUG] Received POST /api/invoices body:', req.body);
    console.log('[BACKEND DEBUG] Type of items:', typeof req.body.items, 'Value:', req.body.items);
    console.log('[BACKEND DEBUG] Type of additionalCharges:', typeof req.body.additionalCharges, 'Value:', req.body.additionalCharges);

    const {
      customerId,
      invoiceNumber,
      issueDate,
      dueDate,
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      msacoverpagetemplateid,
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

    try {
      // 1. Fetch customer details (name and currency) for the current user
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('name, currency')
        .eq('id', customerId)
        .eq('user_id', userId) // IMPORTANT: Ensure customer belongs to this user
        .single();

      if (customerError || !customer) {
        console.error("Error fetching customer for invoice:", customerError?.message || "Customer not found.");
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
      const invoiceToInsert = {
        customerId,
        customerActualName: customer.name,
        invoiceNumber,
        issueDate,
        dueDate,
        items: items || [],
        additionalCharges: additionalCharges || [],
        taxRate,
        discountEnabled,
        discountDescription: discountDescription || null,
        discountType,
        discountValue,
        discountAmount, // Add the calculated 'discountAmount' here
        msaContent,
        msacoverpagetemplateid: msacoverpagetemplateid === '' ? null : msacoverpagetemplateid,
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
        user_id: userId // IMPORTANT: Associate invoice with the authenticated user
      };

      console.log("DEBUG: invoiceToInsert payload for Supabase:", invoiceToInsert);

      // Insert into Supabase
      const { data, error } = await supabase
        .from('invoice')
        .insert([invoiceToInsert])
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error for new invoice form:', error.message);
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Duplicate invoice form number or other unique constraint violation.', details: error.message });
        }
        return res.status(500).json({ error: 'Failed to create invoice in database.', details: error.message });
      }

      console.log("DEBUG: New invoice Form created successfully:", data);
      return res.status(201).json(data);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in POST /api/invoice:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // Helper function for safe JSONB parsing
  const safeParseJsonb = (jsonbInput) => { // Removed type annotation
    if (jsonbInput === null || jsonbInput === undefined) {
      return []; // Explicitly return empty array for null or undefined
    }
    if (typeof jsonbInput === 'string') {
      try {
        const parsed = JSON.parse(jsonbInput);
        // Ensure that if the parsed result is not an array, we still return an array (e.g., if it parsed to a scalar or object)
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("Failed to parse JSONB string:", e);
        return []; // Return an empty array on parse error
      }
    }
    // If it's already an array or object, return it as is, but ensure it's an array
    return Array.isArray(jsonbInput) ? jsonbInput : [];
  };

  // PUT (Update) invoice by ID for the authenticated user
  router.put('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for PUT /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    // Destructure all fields that could potentially be updated
    const {
      customerId,
      invoiceNumber,
      issueDate,
      dueDate,
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      msacoverpagetemplateid,
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
      // Exclude customerName and currencyCode as they are derived/handled by backend
      customerName, // Removed as it's not used in update and might be passed from client
      currencyCode, // Removed as it's not used in update and might be passed from client
      ...restOfBody // Capture any other fields if necessary
    } = req.body;

    try {
      // Fetch existing invoice to get current values for recalculations and fallbacks
      // Filter by invoice ID AND user ID
      const { data: existingInvoice, error: fetchError } = await supabase
        .from('invoice')
        .select(`
          customerId, items, additionalCharges, taxRate,
          discountEnabled, discountType, discountValue, discountDescription,
          paymentTerms, customPaymentTerms, commitmentPeriod, customCommitmentPeriod, paymentFrequency, customPaymentFrequency,
          msaContent, msacoverpagetemplateid, termsAndConditions, status,
          invoiceNumber, issueDate, dueDate, serviceStartDate, serviceEndDate,
          customerActualName, currencyCode, subtotal, taxAmount, discountAmount, total,
          user_id // Ensure user_id is selected to verify ownership
        `)
        .eq('id', invoiceId)
        .eq('user_id', userId) // IMPORTANT: Verify ownership
        .single();

      if (fetchError || !existingInvoice) {
        console.error("Error fetching existing invoice for update:", fetchError?.message || "Invoice not found.");
        return res.status(404).json({ error: 'Invoice not found or not accessible by this user.' });
      }

      // Determine customerId to use (from updateData or existing form)
      const currentCustomerId = customerId || existingInvoice.customerId;

      // Ensure the selected customer belongs to the same user
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('name, currency')
        .eq('id', currentCustomerId)
        .eq('user_id', userId) // IMPORTANT: Ensure customer belongs to this user
        .single();

      if (customerError || !customer) {
        console.error("Error fetching customer for invoice update:", customerError?.message || "Customer not found.");
        return res.status(400).json({ error: 'Customer not found or not accessible by your account for update.' });
      }

      // Ensure JSONB fields are parsed from existing data before merging/calculating
      const parsedExistingItems = safeParseJsonb(existingInvoice.items);
      const parsedExistingAdditionalCharges = safeParseJsonb(existingInvoice.additionalCharges);

      // Use incoming items/additionalCharges if provided, else use parsed existing ones
      const itemsForCalculation = items !== undefined ? items : parsedExistingItems;
      const additionalChargesForCalculation = additionalCharges !== undefined ? additionalCharges : parsedExistingAdditionalCharges;


      // Recalculate totals, ensuring numeric types for taxRate and discountValue
      const { subtotal, discountAmount, taxAmount, grandTotal } = calculateOrderFormTotal(
        itemsForCalculation,
        additionalChargesForCalculation,
        parseFloat(taxRate ?? existingInvoice.taxRate) || 0, // Ensure numeric, fallback to existing or 0
        {
          enabled: discountEnabled ?? existingInvoice.discountEnabled, // Boolean, fallback to existing
          type: discountType || existingInvoice.discountType || null, // String, fallback to existing or null
          value: parseFloat(discountValue ?? existingInvoice.discountValue) || 0 // Numeric, fallback to existing or 0
        }
      );

      // Prepare the object to update in the database
      const invoiceToUpdate = {
        customerId: currentCustomerId,
        customerActualName: customer.name,
        currencyCode: customer.currency || 'USD',

        // Fields from req.body, with fallback to existing data if not provided
        invoiceNumber: invoiceNumber ?? existingInvoice.invoiceNumber,
        issueDate: issueDate ?? existingInvoice.issueDate,
        dueDate: dueDate ?? existingInvoice.dueDate,

        // Stringify items and additionalCharges for DB storage
        items: items !== undefined ? JSON.stringify(items) : JSON.stringify(parsedExistingItems),
        additionalCharges: additionalCharges !== undefined ? JSON.stringify(additionalCharges) : JSON.stringify(parsedExistingAdditionalCharges),

        taxRate: parseFloat(taxRate ?? existingInvoice.taxRate) || 0,
        discountEnabled: discountEnabled ?? existingInvoice.discountEnabled,
        discountDescription: discountDescription || existingInvoice.discountDescription || null,
        discountType: discountType || existingInvoice.discountType || null,
        discountValue: parseFloat(discountValue ?? existingInvoice.discountValue) || 0,
        discountAmount: discountAmount, // Calculated value

        msaContent: msaContent || existingInvoice.msaContent || null,
        // Handle msacoverpagetemplateid: if incoming is '', set to null; otherwise use incoming or existing
        msacoverpagetemplateid: (msacoverpagetemplateid === '' || msacoverpagetemplateid === undefined)
          ? (existingInvoice.msacoverpagetemplateid || null)
          : msacoverpagetemplateid,
        termsAndConditions: termsAndConditions || existingInvoice.termsAndConditions || null,
        status: status || existingInvoice.status,

        paymentTerms: paymentTerms || existingInvoice.paymentTerms || null,
        customPaymentTerms: customPaymentTerms || existingInvoice.customPaymentTerms || null,
        commitmentPeriod: commitmentPeriod || existingInvoice.commitmentPeriod || null,
        customCommitmentPeriod: customCommitmentPeriod || existingInvoice.customCommitmentPeriod || null,
        paymentFrequency: paymentFrequency || existingInvoice.paymentFrequency || null,
        customPaymentFrequency: customPaymentFrequency || existingInvoice.customPaymentFrequency || null,

        serviceStartDate: serviceStartDate ?? existingInvoice.serviceStartDate,
        serviceEndDate: serviceEndDate ?? existingInvoice.serviceEndDate,

        // Calculated totals
        subtotal: subtotal,
        taxAmount: taxAmount,
        total: grandTotal,
        user_id: userId // IMPORTANT: Ensure user_id is included in the update payload for security
      };

      console.log("DEBUG: invoiceToUpdate payload for Supabase:", invoiceToUpdate);

      const { data, error } = await supabase
        .from('invoice')
        .update(invoiceToUpdate)
        .eq('id', invoiceId)
        .eq('user_id', userId) // IMPORTANT: Ensure update is for invoice owned by this user
        .select()
        .single();

      if (error) {
        console.error(`Supabase update error for invoice ${invoiceId} (user ${userId}):`, error.message);
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Duplicate invoice number or other unique constraint violation.', details: error.message });
        }
        return res.status(500).json({ error: 'Failed to update invoice in database.', details: error.message });
      }
      if (!data) { // If data is null, it means no row was found or updated (e.g., if ID or user_id didn't match)
        return res.status(404).json({ error: 'Invoice not found or no changes made, or not accessible by this user.' });
      }
      console.log("DEBUG: Invoice updated successfully:", data);
      return res.json(data);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in PUT /api/invoices/:id:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // DELETE invoice by ID for the authenticated user
  router.delete('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for DELETE /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    console.log(`[Backend] Attempting to delete invoice with ID: ${invoiceId} for user: ${userId}`);

    try {
      // Delete only if the invoice belongs to the authenticated user
      const { error } = await supabase
        .from('invoice')
        .delete()
        .eq('id', invoiceId)
        .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

      if (error) {
        // If the error code indicates no row was found (e.g., if ID or user_id didn't match)
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
            console.error(`Invoice ${invoiceId} not found or not owned by user ${userId}:`, error.message);
            return res.status(404).json({ error: 'Invoice not found or not accessible by this user for deletion.' });
        }
        console.error(`Error deleting invoice ${invoiceId} for user ${userId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      console.log(`Invoice ${invoiceId} for user ${userId} successfully deleted.`);
      res.status(204).send();
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in DELETE /api/invoices/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  return router;
};
