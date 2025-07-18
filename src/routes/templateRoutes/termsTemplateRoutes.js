import express from 'express';
import asyncHandler from 'express-async-handler';

// No need for declare module or interface RouterOptions in plain JavaScript.
// The 'req.user' property is assumed to be added by the 'authenticateToken' middleware.

export const createTermsTemplateRouter = ({ supabase }) => {
  const router = express.Router();

  // GET all Terms Templates for the authenticated user
  router.get('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated; req.user is set by the middleware
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/terms-templates');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    try {
      // Filter templates by the authenticated user's ID
      const { data, error } = await supabase.from('terms_template')
        .select('*')
        .eq('user_id', userId); // IMPORTANT: Filter by user_id

      if (error) {
        console.error('Error fetching Terms templates:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.json(data);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in GET /api/terms-templates:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // GET Terms Template by ID for the authenticated user
  router.get('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for GET /api/terms-templates/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const templateId = req.params.id;
    try {
      // Filter by template ID AND user ID
      const { data, error } = await supabase
        .from('terms_template')
        .select('*')
        .eq('id', templateId)
        .eq('user_id', userId) // IMPORTANT: Filter by user_id
        .single();

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) { // No rows found or not owned by user
          res.status(404).json({ error: 'Terms Template not found or not accessible by this user.' });
          return;
        } else {
          console.error(`Error fetching Terms template ${templateId} for user ${userId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
      }
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in GET /api/terms-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new Terms Template for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for POST /api/terms-templates');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const newTemplate = {
      ...req.body,
      user_id: userId // IMPORTANT: Associate the new template with the authenticated user
    };
    try {
      const { data, error } = await supabase.from('terms_template').insert([newTemplate]).select();
      if (error) {
        console.error('Error creating Terms template:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(201).json(data[0]);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in POST /api/terms-templates:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // PUT (Update) Terms Template by ID for the authenticated user
  router.put('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for PUT /api/terms-templates/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const templateId = req.params.id;
    const updateData = {
      ...req.body,
      user_id: userId // Ensure user_id is included in the update payload for security
    };
    try {
      // Update by template ID AND user ID
      const { data, error } = await supabase
        .from('terms_template')
        .update(updateData)
        .eq('id', templateId)
        .eq('user_id', userId) // IMPORTANT: Ensure update is for template owned by this user
        .select();

      if (error) {
        console.error(`Error updating Terms template ${templateId} for user ${userId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        // If no data returned, it means either template wasn't found or wasn't owned by this user
        res.status(404).json({ error: 'Terms Template not found or not accessible by this user.' });
        return;
      }
      res.json(data[0]);
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in PUT /api/terms-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // DELETE Terms Template by ID for the authenticated user
  router.delete('/:id', asyncHandler(async (req, res) => {
    // Ensure the user is authenticated
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for DELETE /api/terms-templates/:id');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const templateId = req.params.id;
    try {
      // Delete only if the template belongs to the authenticated user
      const { error, count } = await supabase
        .from('terms_template')
        .delete()
        .eq('id', templateId)
        .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

      if (error) {
        // If the error code indicates no row was found (e.g., if ID or user_id didn't match)
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          console.error(`Terms Template ${templateId} not found or not owned by user ${userId}:`, error.message);
          return res.status(404).json({ error: 'Terms Template not found or not accessible by this user for deletion.' });
        }
        console.error(`Error deleting Terms template ${templateId} for user ${userId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }

      // Check if a row was actually deleted using 'count'
      if (count === 0) { // This check is mostly for clarity; the 404 above handles the main case.
        return res.status(404).json({ error: 'Terms Template not found or already deleted.' });
      }

      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) { // Removed type annotation
      console.error('Unexpected error in DELETE /api/terms-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  return router;
};
