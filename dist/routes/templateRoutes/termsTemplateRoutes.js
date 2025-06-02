"use strict";
// src/routes/termsTemplateRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTermsTemplateRouter = void 0;
const express_1 = __importDefault(require("express"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const createTermsTemplateRouter = ({ supabase }) => {
    const router = express_1.default.Router();
    // GET all Terms Templates
    router.get('/', (0, express_async_handler_1.default)(async (req, res) => {
        try {
            const { data, error } = await supabase.from('terms_template').select('*');
            if (error) {
                console.error('Error fetching Terms templates:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.json(data);
            return;
        }
        catch (error) {
            console.error('Unexpected error in GET /api/terms-templates:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // GET Terms Template by ID
    router.get('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const templateId = req.params.id;
        try {
            const { data, error } = await supabase
                .from('terms_template')
                .select('*')
                .eq('id', templateId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    res.status(404).json({ error: 'Terms Template not found.' });
                    return;
                }
                else {
                    console.error(`Error fetching Terms template ${templateId}:`, error.message);
                    res.status(500);
                    throw new Error(error.message);
                }
            }
            else {
                res.json(data);
                return;
            }
        }
        catch (error) {
            console.error('Unexpected error in GET /api/terms-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // POST a new Terms Template
    router.post('/', (0, express_async_handler_1.default)(async (req, res) => {
        const newTemplate = req.body;
        try {
            const { data, error } = await supabase.from('terms_template').insert([newTemplate]).select();
            if (error) {
                console.error('Error creating Terms template:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.status(201).json(data[0]);
            return;
        }
        catch (error) {
            console.error('Unexpected error in POST /api/terms-templates:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // PUT (Update) Terms Template by ID
    router.put('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const templateId = req.params.id;
        const updateData = req.body;
        try {
            const { data, error } = await supabase
                .from('terms_template')
                .update(updateData)
                .eq('id', templateId)
                .select();
            if (error) {
                console.error(`Error updating Terms template ${templateId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }
            if (!data || data.length === 0) {
                res.status(404).json({ error: 'Terms Template not found or no changes made.' });
                return;
            }
            res.json(data[0]);
            return;
        }
        catch (error) {
            console.error('Unexpected error in PUT /api/terms-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // DELETE Terms Template by ID
    router.delete('/:id', (0, express_async_handler_1.default)(async (req, res) => {
        const templateId = req.params.id;
        try {
            const { error } = await supabase
                .from('terms_template')
                .delete()
                .eq('id', templateId);
            if (error) {
                console.error(`Error deleting Terms template ${templateId}:`, error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.status(204).send();
            return;
        }
        catch (error) {
            console.error('Unexpected error in DELETE /api/terms-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    return router;
};
exports.createTermsTemplateRouter = createTermsTemplateRouter;
