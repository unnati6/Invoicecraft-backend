// src/routes/msaTemplateRoutes.ts

import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';

interface RouterOptions {
  supabase: SupabaseClient;
  // authenticateToken: express.RequestHandler; // uncomment when adding auth
}

export const createMsaTemplateRouter = ({ supabase }: RouterOptions) => {
  const router = express.Router();

  // GET all MSA Templates
  router.get('/', asyncHandler(async (req, res) => {
    try {
      const { data, error } = await supabase.from('msa_template').select('*');
      if (error) {
        console.error('Error fetching MSA templates:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.json(data);
      return;
    } catch (error: any) {
      console.error('Unexpected error in GET /api/msa-templates:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // GET MSA Template by ID
  router.get('/:id', asyncHandler(async (req, res) => {
    const templateId = req.params.id;
    try {
      const { data, error } = await supabase
        .from('msa_template')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json({ error: 'MSA Template not found.' });
          return;
        } else {
          console.error(`Error fetching MSA template ${templateId}:`, error.message);
          res.status(500);
          throw new Error(error.message);
        }
      } else {
        res.json(data);
        return;
      }
    } catch (error: any) {
      console.error('Unexpected error in GET /api/msa-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // POST a new MSA Template
  router.post('/', asyncHandler(async (req, res) => {
    const newTemplate = req.body;
    try {
      const { data, error } = await supabase.from('msa_template').insert([newTemplate]).select();
      if (error) {
        console.error('Error creating MSA template:', error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(201).json(data[0]);
      return;
    } catch (error: any) {
      console.error('Unexpected error in POST /api/msa-templates:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // PUT (Update) MSA Template by ID
  router.put('/:id', asyncHandler(async (req, res) => {
    const templateId = req.params.id;
    const updateData = req.body;
    try {
      const { data, error } = await supabase
        .from('msa_template')
        .update(updateData)
        .eq('id', templateId)
        .select();

      if (error) {
        console.error(`Error updating MSA template ${templateId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        res.status(404).json({ error: 'MSA Template not found or no changes made.' });
        return;
      }
      res.json(data[0]);
      return;
    } catch (error: any) {
      console.error('Unexpected error in PUT /api/msa-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  // DELETE MSA Template by ID
  router.delete('/:id', asyncHandler(async (req, res) => {
    const templateId = req.params.id;
    try {
      const { error } = await supabase
        .from('msa_template')
        .delete()
        .eq('id', templateId);

      if (error) {
        console.error(`Error deleting MSA template ${templateId}:`, error.message);
        res.status(500);
        throw new Error(error.message);
      }
      res.status(204).send();
      return;
    } catch (error: any) {
      console.error('Unexpected error in DELETE /api/msa-templates/:id:', error.message);
      res.status(500);
      throw new Error('Internal server error.');
    }
  }));

  return router;
};