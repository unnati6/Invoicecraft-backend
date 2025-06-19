  import express from 'express';
  import asyncHandler from 'express-async-handler';
  import path from 'path';
  export const createCoverPageTemplateRouter = ({ supabase }) => {
    const router = express.Router();

    // GET all Cover Page Templates for the authenticated user
    router.get('/', asyncHandler(async (req, res) => {
      // Ensure the user is authenticated; req.user is set by the middleware
      const userId = req.user?.id;
      if (!userId) {
        console.error('Authentication error: User ID not found in request for GET /api/cover-page-templates');
        return res.status(401).json({ message: 'User not authenticated.' });
      }

      try {
        // Filter templates by the authenticated user's ID
        const { data, error } = await supabase.from('cover_page_template')
          .select('*')
          .eq('user_id', userId); // IMPORTANT: Filter by user_id

        if (error) {
          console.error('Error fetching cover page templates:', error.message);
          res.status(500);
          throw new Error(error.message);
        }
        res.json(data);
      } catch (error) { // Removed type annotation
        console.error('Unexpected error in GET /api/cover-page-templates:', error.message);
        res.status(500);
        throw new Error('Internal server error.');
      }
    }));

    // GET Cover Page Template by ID for the authenticated user
    router.get('/:id', asyncHandler(async (req, res) => {
      // Ensure the user is authenticated
      const userId = req.user?.id;
      if (!userId) {
        console.error('Authentication error: User ID not found in request for GET /api/cover-page-templates/:id');
        return res.status(401).json({ message: 'User not authenticated.' });
      }

      const templateId = req.params.id;
      try {
        // Filter by template ID AND user ID
        const { data, error } = await supabase
          .from('cover_page_template')
          .select('*')
          .eq('id', templateId)
          .eq('user_id', userId) // IMPORTANT: Filter by user_id
          .single();

        if (error) {
          if (error.code === 'PGRST116' || error.message.includes('0 rows')) { // No rows found or not owned by user
            res.status(404).json({ error: 'Cover Page Template not found or not accessible by this user.' });
            return;
          } else {
            console.error(`Error fetching cover page template ${templateId} for user ${userId}:`, error.message);
            res.status(500);
            throw new Error(error.message);
          }
        } else {
          res.json(data);
        }
      } catch (error) { // Removed type annotation
        console.error('Unexpected error in GET /api/cover-page-templates/:id:', error.message);
        res.status(500);
        throw new Error('Internal server error.');
      }
    }));
  // POST a new Cover Page Template for the authenticated user
  router.post('/', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      console.error('Authentication error: User ID not found in request for POST /api/cover-page-templates');
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const {
      name,
      title,
      companyLogoEnabled = true,
      clientLogoEnabled = true,
      additionalImage1Enabled = false,
      additionalImage2Enabled = false
    } = req.body;

    const imageFields = {
      companyLogoUrl: null,
      clientLogoUrl: null,
      additionalImage1Url: null,
      additionalImage2Url: null
    };

    // Handle file uploads
    const uploadFile = async (file, prefix) => {
      const filename = `${prefix}_${Date.now()}_${file.name}`;
      const filepath = `uploads/${filename}`;
      await file.mv(filepath);
      return `/uploads/${filename}`;
    };

    try {
      if (req.files?.companyLogo) {
        imageFields.companyLogoUrl = await uploadFile(req.files.companyLogo, 'companyLogo');
      }
      if (req.files?.clientLogo) {
        imageFields.clientLogoUrl = await uploadFile(req.files.clientLogo, 'clientLogo');
      }
      if (req.files?.additionalImage1) {
        imageFields.additionalImage1Url = await uploadFile(req.files.additionalImage1, 'additionalImage1');
      }
      if (req.files?.additionalImage2) {
        imageFields.additionalImage2Url = await uploadFile(req.files.additionalImage2, 'additionalImage2');
      }

      const { data, error } = await supabase.from('cover_page_template').insert([{
        name,
        title: typeof title === 'string' ? title : '',
        companyLogoEnabled,
        clientLogoEnabled,
        additionalImage1Enabled,
        additionalImage2Enabled,
        ...imageFields,
        user_id: userId
      }]).select();

      if (error) {
        console.error('Error creating cover page template:', error.message);
        return res.status(500).json({ error: error.message });
      }

      res.status(201).json(data[0]);
    } catch (err) {
      console.error('Unexpected error in POST /api/cover-page-templates:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }));


    // PUT (Update) Cover Page Template by ID for the authenticated user
    router.put('/:id', asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const templateId = req.params.id;

    const {
      name,
      title,
      companyLogoEnabled = true,
      clientLogoEnabled = true,
      additionalImage1Enabled = false,
      additionalImage2Enabled = false
    } = req.body;

    const updates = {
      name,
      title,
      companyLogoEnabled: companyLogoEnabled === 'true' || companyLogoEnabled === true,
      clientLogoEnabled: clientLogoEnabled === 'true' || clientLogoEnabled === true,
      additionalImage1Enabled: additionalImage1Enabled === 'true' || additionalImage1Enabled === true,
      additionalImage2Enabled: additionalImage2Enabled === 'true' || additionalImage2Enabled === true,
      updated_at: new Date().toISOString()
    };

    // Handle image uploads
    const uploadFile = async (file, prefix) => {
      const fileName = `${prefix}_${Date.now()}_${file.name}`;
      const uploadPath = path.join('uploads', fileName);
      await file.mv(uploadPath);
      return `/uploads/${fileName}`;
    };

    try {
      if (req.files?.companyLogo) {
        updates.companyLogoUrl = await uploadFile(req.files.companyLogo, 'companyLogo');
      }
      if (req.files?.clientLogo) {
        updates.clientLogoUrl = await uploadFile(req.files.clientLogo, 'clientLogo');
      }
      if (req.files?.additionalImage1) {
        updates.additionalImage1Url = await uploadFile(req.files.additionalImage1, 'additionalImage1');
      }
      if (req.files?.additionalImage2) {
        updates.additionalImage2Url = await uploadFile(req.files.additionalImage2, 'additionalImage2');
      }

      const { data, error } = await supabase
        .from('cover_page_template')
        .update(updates)
        .eq('id', templateId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating template:', error.message);
        return res.status(500).json({ message: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: 'Template not found or not accessible.' });
      }

      res.json(data);
    } catch (err) {
      console.error('Unexpected error in PUT /api/cover-page-templates/:id:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }));

    // DELETE Cover Page Template by ID for the authenticated user
    router.delete('/:id', asyncHandler(async (req, res) => {
      // Ensure the user is authenticated
      const userId = req.user?.id;
      if (!userId) {
        console.error('Authentication error: User ID not found in request for DELETE /api/cover-page-templates/:id');
        return res.status(401).json({ message: 'User not authenticated.' });
      }

      const templateId = req.params.id;
      try {
        // Delete only if the template belongs to the authenticated user
        const { error, count } = await supabase
          .from('cover_page_template')
          .delete()
          .eq('id', templateId)
          .eq('user_id', userId); // IMPORTANT: Delete only if owned by this user

        if (error) {
          // If the error code indicates no row was found (e.g., if ID or user_id didn't match)
          if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
            console.error(`Cover Page Template ${templateId} not found or not owned by user ${userId}:`, error.message);
            return res.status(404).json({ error: 'Cover Page Template not found or not accessible by this user for deletion.' });
          }
          console.error(`Error deleting cover page template ${templateId} for user ${userId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }

        // Check if a row was actually deleted using 'count'
        if (count === 0) { // This check is mostly for clarity; the 404 above handles the main case.
          return res.status(404).json({ error: 'Cover Page Template not found or already deleted.' });
        }

        res.status(204).send(); // 204 No Content for successful deletion
      } catch (error) { // Removed type annotation
        console.error('Unexpected error in DELETE /api/cover-page-templates/:id:', error.message);
        res.status(500);
        throw new Error('Internal server error.');
      }
    }));

    return router;
  };
