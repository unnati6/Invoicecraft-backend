"use strict";
// src/routes/msaTemplateRoutes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMsaTemplateRouter = void 0;
const express_1 = __importDefault(require("express"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const createMsaTemplateRouter = ({ supabase }) => {
    const router = express_1.default.Router();
    // GET all MSA Templates
    router.get('/', (0, express_async_handler_1.default)(async (req, res) => {
        try {
            const { data, error } = await supabase.from('msa_template').select('*');
            if (error) {
                console.error('Error fetching MSA templates:', error.message);
                res.status(500);
                throw new Error(error.message);
            }
            res.json(data);
            return;
        }
        catch (error) {
            console.error('Unexpected error in GET /api/msa-templates:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // GET MSA Template by ID
    router.get('/:id', (0, express_async_handler_1.default)(async (req, res) => {
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
                }
                else {
                    console.error(`Error fetching MSA template ${templateId}:`, error.message);
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
            console.error('Unexpected error in GET /api/msa-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // POST a new MSA Template
    router.post('/', (0, express_async_handler_1.default)(async (req, res) => {
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
        }
        catch (error) {
            console.error('Unexpected error in POST /api/msa-templates:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // PUT (Update) MSA Template by ID
    router.put('/:id', (0, express_async_handler_1.default)(async (req, res) => {
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
        }
        catch (error) {
            console.error('Unexpected error in PUT /api/msa-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    // DELETE MSA Template by ID
    router.delete('/:id', (0, express_async_handler_1.default)(async (req, res) => {
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
        }
        catch (error) {
            console.error('Unexpected error in DELETE /api/msa-templates/:id:', error.message);
            res.status(500);
            throw new Error('Internal server error.');
        }
    }));
    return router;
};
exports.createMsaTemplateRouter = createMsaTemplateRouter;
