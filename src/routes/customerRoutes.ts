

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
    const { name, email, phone, currency, billingAddress, shippingAddress } = req.body;
  console.log("DEBUG: [customerRoutes.ts] Received data for new customer:", req.body);

    try {
      const { data, error } = await supabase
        .from('customer')
        .insert([{
          name,
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
  const { name, email, phone, currency, billingAddress, shippingAddress } = req.body;
      const updateData = {
        name,
        email,
        phone,
        currency,
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

  // Example: DELETE customer by ID
  router.delete('/:id', asyncHandler(async (req, res) => { 
    const customerId = req.params.id;
    try {
      const { error } = await supabase
        .from('customer')
        .delete()
        .eq('id', customerId);

      if (error) {
        console.error(`Error deleting customer ${customerId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(204).send().json({message:"Successfully Deleted"});
      return; 
    } catch (error: any) {
      console.error('Unexpected error in DELETE /api/customers/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  return router;
};