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
  router.put('/:id', asyncHandler(async (req, res) => {
    const invoiceId = req.params.id;
    const updateData = req.body;
    
    try {
      const { data, error } = await supabase
        .from('invoice')
        .update(updateData)
        .eq('id', invoiceId)
        .select();

      if (error) {
        console.error(`Error updating invoice ${invoiceId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        res.status(404).json({ error: 'Invoice not found or no changes made.' });
        return;
      }
      res.json(data[0]);
      return;
    } catch (error: any) {
      console.error('Unexpected error in PUT /api/invoices/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
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