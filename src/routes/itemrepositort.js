import express from 'express';
import asyncHandler from 'express-async-handler';

// No need for declare module or interface RouterOptions in plain JavaScript.
// The 'req.user' property is assumed to be added by the 'authenticateToken' middleware.

export const createItemRepositoryRouter = ({ supabase }) => {
    const router = express.Router();

    // GET all Items for the authenticated user
    router.get('/', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated; req.user is set by the middleware
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/item-route');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        try {
            // Filter items by the authenticated user's ID
            const { data, error } = await supabase.from('item_repository')
                .select('*')
                .eq('user_id', userId) // IMPORTANT: Filter by user_id
                .order('name', { ascending: true }); // Adding order by name as a common practice

            if (error) {
                console.error('Error fetching items:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.json(data);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in GET /api/items:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // GET Item by ID for the authenticated user
    router.get('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for GET /api/item-route/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const itemId = req.params.id;
        try {
            // Filter by item ID AND user ID
            const { data, error } = await supabase
                .from('item_repository')
                .select('*')
                .eq('id', itemId)
                .eq('user_id', userId) // IMPORTANT: Filter by user_id
                .single();

            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) { // No rows found or not owned by user
                    res.status(404).json({ error: 'Item not found or not accessible by this user.' });
                    return;
                } else {
                    console.error(`Error fetching item ${itemId} for user ${userId}:`, error.message);
                    res.status(500);
                    throw new Error(error.message);
                }
            } else {
                res.json(data);
                return;
            }
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in GET /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // POST a new Item for the authenticated user
    router.post('/', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for POST /api/item-route');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const newItem = req.body; // Direct use of req.body, assuming it matches DB schema

        // Set default currencyCode if not provided, and associate with user
        if (!newItem.currencyCode) { // Checks for null, undefined, empty string etc.
            newItem.currencyCode = 'USD'; // Set default if not provided
        }
        newItem.user_id = userId; // IMPORTANT: Associate the new item with the authenticated user

        try {
            const { data, error } = await supabase.from('item_repository').insert([newItem]).select();
            if (error) {
                console.error('Error creating item:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.status(201).json(data[0]);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in POST /api/items:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // PUT (Update) Item by ID for the authenticated user
    router.put('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for PUT /api/item-route/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const itemId = req.params.id;
        const updateData = req.body; // Direct use of req.body, assuming it matches DB schema
        console.log("Update data received for item", itemId, updateData);

        // Remove user_id from updateData if it exists, as it should not be changeable via PUT
        if (updateData.user_id) {
            delete updateData.user_id;
        }

        try {
            // Update by item ID AND user ID
            const { data, error } = await supabase
                .from('item_repository')
                .update(updateData)
                .eq('id', itemId)
                .eq('user_id', userId) // IMPORTANT: Ensure update is for item owned by this user
                .select();

            if (error) {
                console.error(`Error updating item ${itemId} for user ${userId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }
            if (!data || data.length === 0) {
                // If no data returned, it means either item wasn't found or wasn't owned by this user
                res.status(404).json({ error: 'Item not found or not accessible by this user.' });
                return;
            }
            res.json(data[0]);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in PUT /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // DELETE Item by ID for the authenticated user
    router.delete('/:id', asyncHandler(async (req, res) => {
        // Ensure the user is authenticated
        const userId = req.user?.id;
        if (!userId) {
            console.error('Authentication error: User ID not found in request for DELETE /api/item-route/:id');
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        const itemId = req.params.id;
        try {
            // Delete only if the item belongs to the authenticated user
            // Use .select() with exact count to verify deletion success
            const { data, error } = await supabase
                .from('item_repository')
                .delete()
                .eq('id', itemId)
                .eq('user_id', userId) // IMPORTANT: Delete only if owned by this user
                .select('*'); // Select * to check if any rows were returned after deletion attempt

            if (error) {
                console.error(`Error deleting item ${itemId} for user ${userId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }

            // If data is empty, it means no row was found and deleted (e.g., if ID or user_id didn't match)
            if (!data || data.length === 0) {
                res.status(404).json({ message: 'Item not found or not accessible by this user for deletion.' });
                return;
            }

            res.status(204).send(); // 204 No Content for successful deletion
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in DELETE /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    return router;
};
