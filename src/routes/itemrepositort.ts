// src/routes/itemRepositoryRoutes.ts

import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';

interface RouterOptions {
    supabase: SupabaseClient;
    // authenticateToken: express.RequestHandler; // uncomment when adding auth
}

export const createItemRepositoryRouter = ({ supabase }: RouterOptions) => {
    const router = express.Router();

    // GET all Items
    router.get('/', asyncHandler(async (req, res) => {
        try {
            const { data, error } = await supabase.from('item_repository').select('*').order('name', { ascending: true }); // Adding order by name as a common practice

            if (error) {
                console.error('Error fetching items:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.json(data);
            return;
        } catch (error: any) {
            console.error('Unexpected error in GET /api/items:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // GET Item by ID
    router.get('/:id', asyncHandler(async (req, res) => {
        const itemId = req.params.id;
        try {
            const { data, error } = await supabase
                .from('item_repository')
                .select('*')
                .eq('id', itemId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // No rows found
                    res.status(404).json({ error: 'Item not found.' });
                    return;
                } else {
                    console.error(`Error fetching item ${itemId}:`, error.message);
                    res.status(500);
                    throw new Error(error.message);
                }
            } else {
                res.json(data);
                return;
            }
        } catch (error: any) {
            console.error('Unexpected error in GET /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // POST a new Item
    router.post('/', asyncHandler(async (req, res) => {
        const newItem = req.body; // Direct use of req.body, assuming it matches DB schema
       
          if (!newItem.currencyCode) { // Checks for null, undefined, empty string etc.
        newItem.currencyCode = 'USD'; // Set default if not provided
    }
    // You could also specifically delete the property if it's null,
    // so Supabase's default takes over implicitly.
    // if (newItem.currencyCode === null) {
    //    delete newItem.currencyCode;
    // }
         try {
            const { data, error } = await supabase.from('item_repository').insert([newItem]).select();
            if (error) {
                console.error('Error creating item:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.status(201).json(data[0]);
            return;
        } catch (error: any) {
            console.error('Unexpected error in POST /api/items:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // PUT (Update) Item by ID
    router.put('/:id', asyncHandler(async (req, res) => {
        const itemId = req.params.id;
        const updateData = req.body; // Direct use of req.body, assuming it matches DB schema
     console.log("Update data received for item", itemId, updateData);
        try {
            const { data, error } = await supabase
                .from('item_repository')
                .update(updateData)
                .eq('id', itemId)
                .select();

            if (error) {
                console.error(`Error updating item ${itemId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }
            if (!data || data.length === 0) {
                res.status(404).json({ error: 'Item not found or no changes made.' });
                return;
            }
            res.json(data[0]);
            return;
        } catch (error: any) {
            console.error('Unexpected error in PUT /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    // DELETE Item by ID
    router.delete('/:id', asyncHandler(async (req, res) => {
        const itemId = req.params.id;
        try {
            const { error, count } = await supabase
                .from('item_repository')
                .delete()
                .eq('id', itemId)
                .select() // Use select() to get a count or data back
    
            if (error) {
                console.error(`Error deleting item ${itemId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }
            // Check if any row was actually deleted (if data is empty, it means no row was found)
            if (!error && count === 0) { // If using count()
                 res.status(404).json({ message: 'Item not found for deletion' });
                 return;
            }
            res.status(204).send();
            return;
        } catch (error: any) {
            console.error('Unexpected error in DELETE /api/items/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));

    return router;
};