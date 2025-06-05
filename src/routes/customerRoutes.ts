

import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';
interface RouterOptions {
  supabase: SupabaseClient;
}

export const createCustomerRouter = ({ supabase }: RouterOptions) => {
  const router = express.Router();

  // GET all customers
  router.get('/', asyncHandler(async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('customer')
        .select('*');

      if (error) {
        console.error('Error fetching customers:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.json(data);
      return;
    } catch (error: any) {
      console.error('Unexpected error in GET /api/customers:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new customer
  router.post('/', asyncHandler(async (req, res) => {
    const { firstname,lastname, email, phone, currency,company, billingAddress, shippingAddress } = req.body;
  console.log("DEBUG: [customerRoutes.ts] Received data for new customer:", req.body);
const fullName = `${firstname} ${lastname}`.trim();
    try {
      const { data, error } = await supabase
        .from('customer')
        .insert([{
          firstname,
          lastname,
          name:fullName,
          company,
          email,
          phone,
          currency,
          "billingAddress": billingAddress,
          "shippingAddress": shippingAddress
        }])
        .select();

      if (error) {
        console.error('Error creating customer:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(201).json(data[0]);
      return; 
    } catch (error: any) {
      console.error('Unexpected error in POST /api/customers:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // Example: GET customer by ID (assuming 'id' is a UUID)
  router.get('/:id', asyncHandler(async (req, res) => {
    
    const customerId = req.params.id;
     console.log(`[Backend] Attempting to find customer with ID: ${customerId}`);
    try {
      const { data, error } = await supabase
        .from('customer')
        .select('*')
        .eq('id', customerId)
        .single();
        console.log(`[Backend] Database query result for ID ${customerId}:`, data);
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json({ error: 'Customer not found.' });
          return; 
        } else {
          console.error(`Error fetching customer ${customerId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
        return; 
      }
    } catch (error: any) {
      console.error('Unexpected error in GET /api/customers/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));


  router.put('/:id', asyncHandler(async (req, res) => {
    const customerId = req.params.id;
  const { firstname,lastname, email, phone, currency,company, billingAddress, shippingAddress } = req.body;
      const updateData = {
        firstname,
        lastname,
        email,
        phone,
        currency,
        company,
        // यहाँ camelCase को snake_case में मैप करें यदि Supabase ऐसे कॉलम नामों का उपयोग करता है
        billingAddress: billingAddress,
        shippingAddress: shippingAddress,
        // यदि आपके पास अन्य फ़ील्ड हैं, तो उन्हें यहाँ जोड़ें
    };
    try {
      const { data, error } = await supabase
        .from('customer')
        .update(updateData)
        .eq('id', customerId)
        .select();

      if (error) {
        console.error(`Error updating customer ${customerId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        res.status(404).json({ error: 'Customer not found or no changes made.' });
        return; 
      }
      res.json(data[0]);
      return; 
    } catch (error: any) {
      console.error('Unexpected error in PUT /api/customers/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

    // DELETE customer by ID - CORRECTED COLUMN NAME
    router.delete('/:id', asyncHandler(async (req, res) => {
        const customerId = req.params.id;
        console.log(`[Backend] Attempting to delete customer with ID: ${customerId}`);

        try {
            // Step 1: Check for associated invoices
            // Using "customerId" as per your CREATE TABLE statement for invoice
            const { count: invoiceCount, error: invoiceError } = await supabase
                .from('invoice')
                .select('id', { count: 'exact' })
                .eq('customerId', customerId); // <--- CORRECTED: Using "customerId"

            if (invoiceError) {
                console.error(`Error checking invoices for customer ${customerId}:`, invoiceError.message);
                res.status(500);
                throw new Error(invoiceError.message);
            }

            // Step 2: Check for associated order forms
            // You need to confirm the actual column name for customer ID in your 'orderform' table.
            // Assuming it's also "customerId" based on common naming conventions,
            // but VERIFY THIS IN YOUR SUPABASE orderform TABLE.
            const { count: orderFormCount, error: orderFormError } = await supabase
                .from('order_form')
                .select('id', { count: 'exact' })
                .eq('customerId', customerId); // <--- ASSUMPTION: Using "customerId" for orderform as well. VERIFY THIS!

            if (orderFormError) {
                console.error(`Error checking order forms for customer ${customerId}:`, orderFormError.message);
                res.status(500);
                throw new Error(orderFormError.message);
            }

            // If any linked record is found (either invoices or order forms)
            if ((invoiceCount && invoiceCount > 0) || (orderFormCount && orderFormCount > 0)) {
                console.log(`Customer ${customerId} has linked invoices or order forms. Cannot delete.`);
                res.status(409).json({ // 409 Conflict is appropriate here
                    error: 'Cannot delete customer: Linked orders exist.'
                });
                return;
            }

            // Step 3: If no linked records, proceed with deletion
            const { error: deleteError } = await supabase
                .from('customer')
                .delete()
                .eq('id', customerId);

            if (deleteError) {
                console.error(`Error deleting customer ${customerId}:`, deleteError.message);
                res.status(500);
                throw new Error(deleteError.message);
            }

            console.log(`Customer ${customerId} successfully deleted.`);
            res.status(200).json({ message: 'Customer successfully deleted.' });
            return;

        } catch (error: any) {
            console.error('Unexpected error in DELETE /api/customers/:id:', error.message);
            if (!res.headersSent) {
                res.status(500);
            }
            throw new Error('Internal server error.');
        }
    }));

    return router;
};