// src/routes/invoiceRoutes.ts

import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';
import { calculateOrderFormTotal } from '../utils/calculations';
interface RouterOptions {
  supabase: SupabaseClient;
  // authenticateToken: express.RequestHandler; // uncomment when adding auth
}

export const createInvoiceRouter = ({ supabase }: RouterOptions) => {
  const router = express.Router();

  // GET all invoices
  router.get('/', asyncHandler(async (req, res) => {
      console.log('[BACKEND REQUEST] GET /api/invoices');
    console.log('[BACKEND REQUEST] Headers:', req.headers);

   try {
        const { data, error } = await supabase.from('invoice').select('*');

        if (error) {
            console.error('⛔️ [Backend ERROR] Error fetching invoices from Supabase:', error.message);
            return void res.status(500).json({ error: 'Failed to fetch invoices from database', details: error.message });
        }

        if (!data || data.length === 0) {
            console.log('✅ [Backend SUCCESS] No invoices found in the database. Returning empty array.');
            return void res.status(200).json([]);
        }

        console.log(`✅ [Backend SUCCESS] Successfully fetched ${data.length} invoices.`);
        return void res.status(200).json(data); // <-- यहीं पर 'return void' का उपयोग करें
    } catch (unexpectedError: any) {
        console.error('🔥 [Backend FATAL ERROR] Unexpected error in GET /api/invoices route:', unexpectedError.message);
        return void res.status(500).json({ error: 'Internal server error occurred while fetching invoices.' });
    }
  }));

  // GET invoice by ID
  router.get('/:id', asyncHandler(async (req, res) => {
    const invoiceId = req.params.id;
    try {
      const { data, error } = await supabase
        .from('invoice')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json({ error: 'Invoice not found.' });
          return;
        } else {
          console.error(`Error fetching invoice ${invoiceId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
        return;
      }
    } catch (error: any) {
      console.error('Unexpected error in GET /api/invoices/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new invoice
   router.post('/', asyncHandler(async (req, res) => {
      // Destructure all expected fields from the request body
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
  
      try {
        // 1. Fetch customer details (name and currency)
        const { data: customer, error: customerError } = await supabase
          .from('customer')
          .select('name, currency')
          .eq('id', customerId)
          .single();
  
        if (customerError || !customer) {
          console.error("Error fetching customer for invoice:", customerError?.message || "Customer not found.");
          return void res.status(400).json({ error: 'Customer not found or invalid customer ID provided.' });
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
          items : items || [],
          additionalCharges: additionalCharges || [],
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
            return void res.status(409).json({ error: 'Duplicate invoice form number or other unique constraint violation.', details: error.message });
          }
          return void res.status(500).json({ error: 'Failed to create invoice in database.', details: error.message });
        }
  
        console.log("DEBUG: New invoice Form created successfully:", data);
        return void res.status(201).json(data);
      } catch (error: any) {
        console.error('Unexpected error in POST /api/invoice:', error.message, error.stack);
        return void res.status(500).json({ error: 'Internal server error.' });
      }
    }));
  
  // router.post('/', asyncHandler(async (req, res) => {
  //   const newInvoice = req.body; // Assuming the entire invoice object comes from the client
  //   try {
  //     const { data, error } = await supabase
  //       .from('invoice')
  //       .insert([newInvoice])
  //       .select();

  //     if (error) {
  //       console.error('Error creating invoice:', error.message);
  //       res.status(500);
  //       throw new Error(error.message);
  //     }
  //     res.status(201).json(data[0]);
  //     return;
  //   } catch (error: any) {
  //     console.error('Unexpected error in POST /api/invoices:', error.message);
  //     res.status(500);
  //     throw new Error('Internal server error.');
  //   }
  // }));

  // PUT (Update) invoice by ID
  // PUT (Update) invoice by ID
  const safeParseJsonb = (jsonbInput: any) => {
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

    router.put('/:id', asyncHandler(async (req, res) => {
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
            // Exclude customerName and currencyCode as they are derived/handled by backend
            customerName,
            currencyCode,
            ...restOfBody // Capture any other fields if necessary
        } = req.body;

        try {
            // Fetch existing invoice to get current values for recalculations and fallbacks
            const { data: existingInvoice, error: fetchError } = await supabase
                .from('invoice')
                .select(`
                    customerId, items, additionalCharges, taxRate,
                    discountEnabled, discountType, discountValue, discountDescription,
                    paymentTerms, customPaymentTerms, commitmentPeriod, customCommitmentPeriod, paymentFrequency, customPaymentFrequency,
                    msaContent, msaCoverPageTemplateId, termsAndConditions, status,
                    invoiceNumber, issueDate, dueDate, serviceStartDate, serviceEndDate,
                    customerActualName, currencyCode, subtotal, taxAmount, discountAmount, total
                `) // Select all fields needed for potential fallbacks and recalculation
                .eq('id', invoiceId)
                .single();

            if (fetchError || !existingInvoice) {
                console.error("Error fetching existing invoice for update:", fetchError?.message || "Invoice not found.");
                return void res.status(404).json({ error: 'Invoice not found for update.' });
            }

            // Determine customerId to use (from updateData or existing form)
            const currentCustomerId = customerId || existingInvoice.customerId;

            const { data: customer, error: customerError } = await supabase
                .from('customer')
                .select('name, currency')
                .eq('id', currentCustomerId)
                .single();

            if (customerError || !customer) {
                console.error("Error fetching customer for invoice update:", customerError?.message || "Customer not found.");
                return void res.status(400).json({ error: 'Customer not found or invalid customer ID provided for update.' });
            }

            // Prepare values for calculation and DB update, using nullish coalescing (??)
            // for numbers/booleans where 0/false are valid, and logical OR (||) for strings
            // or objects where empty string/null might be a valid value from client.

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
                // Handle msaCoverPageTemplateId: if incoming is '', set to null; otherwise use incoming or existing
                msaCoverPageTemplateId: (msaCoverPageTemplateId === '' || msaCoverPageTemplateId === undefined)
                                        ? (existingInvoice.msaCoverPageTemplateId || null)
                                        : msaCoverPageTemplateId,
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
            };

            console.log("DEBUG: invoiceToUpdate payload for Supabase:", invoiceToUpdate);

            const { data, error } = await supabase
                .from('invoice')
                .update(invoiceToUpdate)
                .eq('id', invoiceId)
                .select()
                .single();

            if (error) {
                console.error(`Supabase update error for invoice ${invoiceId}:`, error.message);
                if (error.code === '23505') { // Unique constraint violation
                    return void res.status(409).json({ error: 'Duplicate invoice number or other unique constraint violation.', details: error.message });
                }
                return void res.status(500).json({ error: 'Failed to update invoice in database.', details: error.message });
            }
            if (!data) { // If data is null, it means no row was found or updated
                return void res.status(404).json({ error: 'Invoice not found or no changes made.' });
            }
            console.log("DEBUG: Invoice updated successfully:", data);
            return void res.json(data);
        } catch (error: any) {
            console.error('Unexpected error in PUT /api/invoices/:id:', error.message, error.stack);
            return void res.status(500).json({ error: 'Internal server error.' });
        }
    }));

  // DELETE invoice by ID
  router.delete('/:id', asyncHandler(async (req, res) => {
    const invoiceId = req.params.id;
    try {
      const { error } = await supabase
        .from('invoice')
        .delete()
        .eq('id', invoiceId);

      if (error) {
        console.error(`Error deleting invoice ${invoiceId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(204).send();
      return;
    } catch (error: any) {
      console.error('Unexpected error in DELETE /api/invoices/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  return router;
};