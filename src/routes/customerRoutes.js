import express from 'express';
import asyncHandler from 'express-async-handler';

// The 'req.user' property will still be available because the 'authenticateToken'
// middleware dynamically adds it to the request object at runtime.
// No 'declare module' is needed or valid in plain JavaScript.

export const createCustomerRouter = ({ supabase }) => {
  const router = express.Router();

  // GET all customers for the authenticated user
  router.get('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated; req.user is set by the middleware
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/customers');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    try {
      // Filter customers by the authenticated user's ID
      const { data, error } = await supabase
        .from('customer')
        .select('*')
        .eq('user_id', userId); // IMPORTANT: Filter by user_id

      if (error) {
        console.error('Error fetching customers:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.json(data);
    } catch (error) {
      console.error('Unexpected error in GET /api/customers:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new customer for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for POST /api/customers');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const { firstname, lastname, email, phone, currency, company, billingAddress, shippingAddress } = req.body;
    console.log("DEBUG: [customerRoutes.js] Received data for new customer:", req.body);
    const fullName = `${firstname} ${lastname}`.trim();

    try {
      // Check if a customer already exists with this email for THIS USER
      const { data: existingCustomer, error: emailCheckError } = await supabase
        .from('customer')
        .select('id')
        .eq('email', email)
        .eq('user_id', userId) // IMPORTANT: Also check by user_id
        .maybeSingle();

      if (emailCheckError) {
        console.error('Error checking existing email for user:', emailCheckError.message);
        res.status(500);
        throw new Error(emailCheckError.message);
      }

      if (existingCustomer) {
        // If customer already exists with that email for this user
        return res.status(409).json({ error: 'A customer with this email already exists for your account.' });
      }

      // If email is unique for this user, insert new customer
      const { data, error } = await supabase
        .from('customer')
        .insert([{
          firstname,
          lastname,
          name: fullName,
          company,
          email,
          phone,
          currency,
          billingAddress,
          shippingAddress,
          user_id: userId // IMPORTANT: Associate the new customer with the authenticated user
        }])
        .select();

      if (error) {
        console.error('Error creating customer:', error.message);
        res.status(500);
        throw new Error(error.message);
      }

      res.status(201).json(data[0]);

    } catch (error) {
      console.error('Unexpected error in POST /api/customers:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // GET customer by ID for the authenticated user
  router.get('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/customers/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const customerId = req.params.id;
    console.log(`[Backend] Attempting to find customer with ID: ${customerId} for user: ${userId}`);
    try {
      // Filter by customer ID AND user ID
      const { data, error } = await supabase
        .from('customer')
        .select('*')
        .eq('id', customerId)
        .eq('user_id', userId) // IMPORTANT: Filter by user_id
        .single();

      console.log(`[Backend] Database query result for ID ${customerId} (user ${userId}):`, data);
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          res.status(404).json({ error: 'Customer not found or not accessible by this user.' });
          return;
        } else {
          console.error(`Error fetching customer ${customerId} for user ${userId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
      }
    } catch (error) {
      console.error('Unexpected error in GET /api/customers/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // PUT (update) customer by ID for the authenticated user
  router.put('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for PUT /api/customers/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const customerId = req.params.id;
    const { firstname, lastname, email, phone, currency, company, billingAddress, shippingAddress } = req.body;
    const updateData = {
      firstname,
      lastname,
      name: `${firstname} ${lastname}`.trim(),
      email,
      phone,
      currency,
      company,
      billingAddress,
      shippingAddress,
    };

    try {
      // Update by customer ID AND user ID
      const { data, error } = await supabase
        .from('customer')
        .update(updateData)
        .eq('id', customerId)
        .eq('user_id', userId) // IMPORTANT: Ensure update is for customer owned by this user
        .select();

      if (error) {
        console.error(`Error updating customer ${customerId} for user ${userId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        res.status(404).json({ error: 'Customer not found or not accessible by this user.' });
        return;
      }
      res.json(data[0]);
    } catch (error) {
      console.error('Unexpected error in PUT /api/customers/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // DELETE customer by ID for the authenticated user
  router.delete('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for DELETE /api/customers/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const customerId = req.params.id;
    console.log(`[Backend] Attempting to delete customer with ID: ${customerId} for user: ${userId}`);

    try {
      // Step 1: Check if the customer exists and belongs to the authenticated user
      const { data: customerToDelete, error: customerCheckError } = await supabase
        .from('customer')
        .select('id')
        .eq('id', customerId)
        .eq('user_id', userId) // IMPORTANT: Verify ownership before checking linked documents
        .single();

      if (customerCheckError || !customerToDelete) {
        if (customerCheckError && customerCheckError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Customer not found or not accessible by this user.' });
        }
        console.error(`Error verifying customer ${customerId} for user ${userId}:`, customerCheckError?.message);
        return res.status(500).json({ message: 'Failed to verify customer ownership.' });
      }

      // Step 2: Check for associated invoices owned by the same user
      const { count: invoiceCount, error: invoiceError } = await supabase
        .from('invoice')
        .select('id', { count: 'exact' })
        .eq('customerId', customerId)
        .eq('user_id', userId); // IMPORTANT: Check for invoices linked to this customer AND user

      if (invoiceError) {
        console.error(`Error checking invoices for customer ${customerId} (user ${userId}):`, invoiceError.message);
        return res.status(500).json({ message: invoiceError.message });
      }

      // Step 3: Check for associated order forms owned by the same user
      const { count: orderFormCount, error: orderFormError } = await supabase
        .from('order_form')
        .select('id', { count: 'exact' })
        .eq('customerId', customerId)
        .eq('user_id', userId); // IMPORTANT: Check for order forms linked to this customer AND user

      if (orderFormError) {
        console.error(`Error checking order forms for customer ${customerId} (user ${userId}):`, orderFormError.message);
        return res.status(500).json({ message: orderFormError.message });
      }

      // If any linked record is found (either invoices or order forms for this user/customer pair)
      if ((invoiceCount && invoiceCount > 0) || (orderFormCount && orderFormCount > 0)) {
        console.log(`Customer ${customerId} (user ${userId}) has linked invoices or order forms. Cannot delete.`);
        return res.status(409).json({
          error: 'Cannot delete customer: Linked invoices or order forms exist for your account.'
        });
      }

      // Step 4: If no linked records for this user, proceed with deletion
      const { error: deleteError } = await supabase
        .from('customer')
        .delete()
        .eq('id', customerId)
        .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

      if (deleteError) {
        console.error(`Error deleting customer ${customerId} for user ${userId}:`, deleteError.message);
        return res.status(500).json({ message: deleteError.message });
      }

      console.log(`Customer ${customerId} for user ${userId} successfully deleted.`);
      res.status(204).send();
    } catch (error) {
      console.error('Unexpected error in DELETE /api/customers/:id:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Internal server error.' });
      }
    }
  }));

  return router;
};
