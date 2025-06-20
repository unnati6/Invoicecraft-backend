import express from 'express';
import asyncHandler from 'express-async-handler';
// Make sure this path is correct for your calculations utility
import { calculateOrderFormTotal } from '../utils/calculations.js';
// Assuming you'll have a specific sendInvoiceEmail function
import { sendInvoiceEmail } from '../utils/sendEmail.js'; // You'll need to create/adapt this
import dotenv from 'dotenv';

export const createInvoiceRouter = ({ supabase }) => {
  const router = express.Router();

  // Helper function for safe JSONB parsing (from orderFormRoutes)
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

  // GET all invoices for the authenticated user
  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for GET /api/invoices');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    try {
      const { data, error } = await supabase
        .from('invoice')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching invoices:', error.message);
        return res.status(500).json({ error: 'Failed to fetch invoices.', details: error.message });
      }
      return res.json(data);
    } catch (error) {
      console.error('Unexpected error in GET /api/invoices:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // GET the next available invoice number for the authenticated user
  router.get('/next-number', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for GET /api/invoices/next-number');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    let invoicePrefix = 'INV-'; // Default prefix for invoices

    try {
      // --- Get Prefix from Branding Settings ---
      const { data: brandingSettings, error: brandingError } = await supabase
        .from('branding_settings')
        .select('invoicePrefix') // Make sure this column exists in branding_settings
        .eq('user_id', userId)
        .single();

      if (brandingError || !brandingSettings || !brandingSettings.invoicePrefix) {
        console.warn(`Branding settings or custom invoice prefix not found for user ${userId}. Using default prefix 'INV-'. Error: ${brandingError?.message}`);
      } else {
        invoicePrefix = brandingSettings.invoicePrefix;
      }

      // --- Call get_next_invoice_sequence RPC Function ---
      const { data: nextNumber, error: rpcError } = await supabase.rpc('get_next_invoice_sequence', {
        p_user_id: userId,
        p_prefix: invoicePrefix
      });

      if (rpcError) {
        console.error('Error calling get_next_invoice_sequence RPC:', rpcError.message);
        return res.status(500).json({ error: 'Failed to generate next invoice number.', details: rpcError.message });
      }

      const formattedNumber = String(nextNumber).padStart(3, '0');
      const generatedInvoiceNumber = `${invoicePrefix}${formattedNumber}`;

      return res.status(200).json({ nextInvoiceNumber: generatedInvoiceNumber });

    } catch (error) {
      console.error('Unexpected error in GET /api/invoices/next-number:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // GET invoice by ID for the authenticated user
  router.get('/:id', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for GET /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    try {
      const { data, error } = await supabase
        .from('invoice')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          return res.status(404).json({ error: 'Invoice not found or not accessible by this user.' });
        } else {
          console.error(`Error fetching invoice ${invoiceId} for user ${userId}:`, error.message);
          return res.status(500).json({ error: 'Failed to fetch invoice.', details: error.message });
        }
      } else {
        return res.json(data);
      }
    } catch (error) {
      console.error('Unexpected error in GET /api/invoices/:id:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // POST a new invoice for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for POST /api/invoices');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const {
      customerId,
      // invoiceNumber - We will generate this on the backend
      issueDate,
      validUntilDate, // Renamed from dueDate
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      linkedMsaTemplateId, // Corrected casing
      msaCoverPageTemplateId, // Corrected casing
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

    let generatedInvoiceNumber;
    let invoicePrefix = 'INV-'; // Default prefix

    try {
      // --- Get Prefix from Branding Settings ---
      const { data: brandingSettings, error: brandingError } = await supabase
        .from('branding_settings')
        .select('invoicePrefix')
        .eq('user_id', userId)
        .single();

      if (brandingError || !brandingSettings) {
        console.warn(`Branding settings not found for user ${userId}. Using default invoice prefix 'INV-'. Error: ${brandingError?.message}`);
      } else {
        invoicePrefix = brandingSettings.invoicePrefix || 'INV-';
      }

      // --- Generate Next Invoice Number using RPC Function ---
      const { data: nextNumber, error: rpcError } = await supabase.rpc('get_next_invoice_sequence', {
        p_user_id: userId,
        p_prefix: invoicePrefix
      });

      if (rpcError) {
        console.error('Error calling get_next_invoice_sequence RPC:', rpcError.message);
        return res.status(500).json({ error: 'Failed to generate next invoice number.', details: rpcError.message });
      }

      const newInvoiceNumberValue = nextNumber;
      const formattedNumber = String(newInvoiceNumberValue).padStart(3, '0');
      generatedInvoiceNumber = `${invoicePrefix}${formattedNumber}`;

      console.log(`Generated Invoice Number for user ${userId}: ${generatedInvoiceNumber}`);

      // 1. Fetch customer details (name and currency)
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('name, currency')
        .eq('id', customerId)
        .eq('user_id', userId)
        .single();

      if (customerError || !customer) {
        console.error("Error fetching customer for invoice:", customerError?.message || "Customer not found.");
        return res.status(400).json({ error: 'Customer not found or not accessible by your account.' });
      }

      // 2. Calculate financial totals (using the same calculation logic for consistency)
      const { subtotal, discountAmount, taxAmount, grandTotal } = calculateOrderFormTotal( // Reusing calculateOrderFormTotal
        items,
        additionalCharges,
        taxRate,
        { enabled: discountEnabled, type: discountType, value: discountValue }
      );

      // 3. Prepare data for Supabase insertion
      const invoiceToInsert = {
        customerId,
        customerActualName: customer.name,
        invoiceNumber: generatedInvoiceNumber,
        issueDate,
        validUntilDate, // Renamed from dueDate
        items: JSON.stringify(items),
        additionalCharges: JSON.stringify(additionalCharges),
        taxRate,
        discountEnabled,
        discountDescription: discountDescription || null,
        discountType,
        discountValue,
        discountAmount, // Calculated
        msaContent,
        linkedMsaTemplateId: linkedMsaTemplateId === '' ? null : linkedMsaTemplateId, // Corrected casing, handle empty string
        msaCoverPageTemplateId: msaCoverPageTemplateId === '' ? null : msaCoverPageTemplateId, // Corrected casing, handle empty string
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
        taxAmount, // Calculated
        total: grandTotal, // Calculated
        currencyCode: customer.currency || 'USD',
        user_id: userId
      };

      console.log("DEBUG: invoiceToInsert payload for Supabase:", invoiceToInsert);

      // Insert into Supabase
      const { data, error } = await supabase
        .from('invoice')
        .insert([invoiceToInsert])
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error for new invoice:', error.message);
        if (error.code === '23505') { // Unique constraint violation
          return res.status(409).json({ error: 'Generated invoice number already exists. Please try again.', details: error.message });
        }
        return res.status(500).json({ error: 'Failed to create invoice in database.', details: error.message });
      }

      console.log("DEBUG: New Invoice created successfully:", data);
      return res.status(201).json(data);
    } catch (error) {
      console.error('Unexpected error in POST /api/invoices:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // PUT (Update) invoice by ID for the authenticated user
  router.put('/:id', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for PUT /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    const {
      customerId,
      invoiceNumber, // Allow updating number if needed, but usually generated
      issueDate,
      validUntilDate, // Renamed from dueDate
      items,
      additionalCharges,
      taxRate,
      discountEnabled,
      discountDescription,
      discountType,
      discountValue,
      msaContent,
      linkedMsaTemplateId, // Corrected casing
      msaCoverPageTemplateId, // Corrected casing
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
      // Fetch existing invoice to get current values for recalculations and fallbacks
      const { data: existingInvoice, error: fetchError } = await supabase
        .from('invoice')
        .select('*')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !existingInvoice) {
        console.error("Error fetching existing invoice for update:", fetchError?.message || "Invoice not found.");
        return res.status(404).json({ error: 'Invoice not found or not accessible by this user.' });
      }

      const currentCustomerId = customerId || existingInvoice.customerId;

      // Ensure the selected customer belongs to the same user
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('name, currency')
        .eq('id', currentCustomerId)
        .eq('user_id', userId)
        .single();

      if (customerError || !customer) {
        console.error("Error fetching customer for invoice update:", customerError?.message || "Customer not found.");
        return res.status(400).json({ error: 'Customer not found or not accessible by your account for update.' });
      }

      // Ensure JSONB fields are parsed from existing data before merging/calculating
      const parsedExistingItems = safeParseJsonb(existingInvoice.items);
      const parsedExistingAdditionalCharges = safeParseJsonb(existingInvoice.additionalCharges);

      // Recalculate totals for update
      const { subtotal, discountAmount, taxAmount, grandTotal } = calculateOrderFormTotal( // Reusing calculateOrderFormTotal
        items !== undefined ? items : parsedExistingItems,
        additionalCharges !== undefined ? additionalCharges : parsedExistingAdditionalCharges,
        parseFloat(taxRate ?? existingInvoice.taxRate) || 0,
        {
          enabled: discountEnabled ?? existingInvoice.discountEnabled,
          type: discountType || existingInvoice.discountType || null,
          value: parseFloat(discountValue ?? existingInvoice.discountValue) || 0
        }
      );

      const invoiceToUpdate = {
        customerId: currentCustomerId,
        customerActualName: customer.name,
        currencyCode: customer.currency || 'USD',

        invoiceNumber: invoiceNumber ?? existingInvoice.invoiceNumber,
        issueDate: issueDate ?? existingInvoice.issueDate,
        validUntilDate: validUntilDate ?? existingInvoice.validUntilDate, // Renamed from dueDate
        items: items !== undefined ? JSON.stringify(items) : JSON.stringify(parsedExistingItems),
        additionalCharges: additionalCharges !== undefined ? JSON.stringify(additionalCharges) : JSON.stringify(parsedExistingAdditionalCharges),
        taxRate: taxRate ?? existingInvoice.taxRate,
        discountEnabled: discountEnabled ?? existingInvoice.discountEnabled,
        discountDescription: discountDescription || existingInvoice.discountDescription || null,
        discountType: discountType || existingInvoice.discountType || null,
        discountValue: discountValue ?? existingInvoice.discountValue,
        discountAmount: discountAmount, // Calculated value

        msaContent: msaContent || existingInvoice.msaContent || null,
        linkedMsaTemplateId: (linkedMsaTemplateId === '' || linkedMsaTemplateId === undefined) ? (existingInvoice.linkedMsaTemplateId || null) : linkedMsaTemplateId, // Corrected casing, handle empty string
        msaCoverPageTemplateId: (msaCoverPageTemplateId === '' || msaCoverPageTemplateId === undefined) ? (existingInvoice.msaCoverPageTemplateId || null) : msaCoverPageTemplateId, // Corrected casing, handle empty string
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

        subtotal: subtotal,
        taxAmount: taxAmount,
        total: grandTotal,
        user_id: userId
      };

      console.log("DEBUG: invoiceToUpdate payload for Supabase:", invoiceToUpdate);

      const { data, error } = await supabase
        .from('invoice')
        .update(invoiceToUpdate)
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error(`Supabase update error for invoice ${invoiceId} (user ${userId}):`, error.message);
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Duplicate invoice number or other unique constraint violation.', details: error.message });
        }
        return res.status(500).json({ error: 'Failed to update invoice in database.', details: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: 'Invoice not found or no changes made, or not accessible by this user.' });
      }
      console.log("DEBUG: Invoice updated successfully:", data);
      return res.json(data);
    } catch (error) {
      console.error('Unexpected error in PUT /api/invoices/:id:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // DELETE invoice by ID for the authenticated user
  router.delete('/:id', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found for DELETE /api/invoices/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const invoiceId = req.params.id;
    try {
      const { error, count } = await supabase
        .from('invoice')
        .delete()
        .eq('id', invoiceId)
        .eq('user_id', userId);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          console.error(`Invoice ${invoiceId} not found or not owned by user ${userId}:`, error.message);
          return res.status(404).json({ error: 'Invoice not found or not accessible by this user for deletion.' });
        }
        console.error(`Error deleting invoice ${invoiceId} for user ${userId}:`, error.message);
        return res.status(500).json({ error: 'Failed to delete invoice.', details: error.message });
      }

      if (count === 0) {
        return res.status(404).json({ error: 'Invoice not found or already deleted.' });
      }

      return res.status(204).send();
    } catch (error) {
      console.error('Unexpected error in DELETE /api/invoices/:id:', error.message, error.stack);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }));

  // NEW: API to send invoice via email
  router.post('/:id/send-email',
    // Apply express.json with a larger limit here if necessary,
    // assuming main app.js also has a general express.json middleware.
    express.json({ limit: '50mb' }),
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      if (!userId) {
        console.error('Authentication error: User ID not found for POST /api/invoices/:id/send-email');
        return res.status(401).json({ message: 'User not authenticated.' });
      }

      const invoiceId = req.params.id;
      const { to, cc,bcc,subject, body: htmlBody, pdfBufferBase64, senderName,senderEmail } = req.body;

     if (!to || !subject || !pdfBufferBase64 || !invoiceId) {
  return res.status(400).json({
    success: false,
    message: 'Missing required fields: to, subject, pdfBufferBase64, or invoiceId.'
  });
}

if (!process.env.SMTP_USER) {
  return res.status(500).json({
    success: false,
    message: 'SMTP_USER is not configured on the server. Email cannot be sent.'
  });
}

      try {
        // 2. Verify ownership of the invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoice')
          .select('id, invoiceNumber') // Only need ID and number for verification/attachment name
          .eq('id', invoiceId)
          .eq('user_id', userId)
          .single();

        if (invoiceError || !invoice) {
          console.error(`Invoice ${invoiceId} not found or not owned by user ${userId} for email sending:`, invoiceError?.message);
          return res.status(404).json({ error: 'Invoice not found or not accessible by this user.' });
        }

        // 3. Send the email using the imported service function
        // You need to adapt sendEmail.js to have a sendInvoiceEmail function.
        await sendInvoiceEmail({
          to,
          cc, // CC पास करें
            bcc, // BCC पास करें
          subject,
          htmlBody,
          pdfBufferBase64,
          invoiceNumber: invoice.invoiceNumber, // Use the actual invoice number from DB
          senderName: senderName || process.env.SENDER_NAME || 'InvoiceCraft',
          senderEmail:process.env.SMTP_USER 
        });

        res.status(200).json({ success: true, message: 'Invoice email sent successfully!' });

      } catch (error) {
        console.error('Error sending invoice email:', error.message, error.stack);
        if (error.message.includes('Authentication failed') || error.message.includes('Invalid login')) {
          return res.status(500).json({ success: false, message: 'Email service authentication failed. Please check server SMTP credentials.' });
        }
        return res.status(500).json({ success: false, message: 'Failed to send invoice email.', details: error.message });
      }
    })
  );


  return router;
};