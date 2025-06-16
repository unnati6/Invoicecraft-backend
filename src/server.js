// server.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

import asyncHandler from 'express-async-handler';

// Route files import - Ensure .js extensions
import { createCustomerRouter } from './routes/customerRoutes.js';
import { createInvoiceRouter } from './routes/invoiceRoutes.js';
import { createOrderFormRouter } from './routes/orderFormRoutes.js';
import { createBrandingSettingsRouter } from './routes/brandingSettingsRoutes.js';
import { createCoverPageTemplateRouter } from './routes/templateRoutes/coverPageTemplateRoutes.js';
import { createMsaTemplateRouter } from './routes/templateRoutes/msaTemplateRoutes.js';
import { createTermsTemplateRouter } from './routes/templateRoutes/termsTemplateRoutes.js';
import { createItemRepositoryRouter } from './routes/itemrepositort.js';
import { createAuthRouter } from './routes/authenticationRoute.js';
import { createPurchaseOrderRouter } from './routes/purchaseOrderRoutes.js';
import { authenticateToken } from './middleware/authenticateToken.js'; // Import the middleware function

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:9002', 'https://invoicecraft-murex.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

let supabase;
let supabaseAdmin;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL, Anon Key, or Service Role Key in environment variables. Please check your .env file.');
  process.exit(1);
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    }
  });
  console.log('Supabase (Anon) client initialized.');

  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  console.log('Supabase (Admin) client initialized.');

  async function testSupabaseConnection() {
    try {
      const { data, error } = await supabaseAdmin.from('customer').select('id').limit(1);
      if (error) throw error;
      console.log('Supabase connection test: Fetched sample customer data.');
    } catch (error) {
      console.error('Supabase connection test failed:', error.message);
    }
  }
  testSupabaseConnection();
}

app.use((req, res, next) => {
  console.log(`[BACKEND REQUEST] ${req.method} ${req.originalUrl}`);
  console.log(`[BACKEND REQUEST] Headers: ${JSON.stringify(req.headers)}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`[BACKEND REQUEST] Body: ${JSON.stringify(req.body)}`);
  }
  next();
});

// API Routes Define
app.get('/api/status', (req, res) => {
  res.status(200).json({ message: 'InvoiceCraft Backend API is running!', timestamp: new Date() });
})

app.get('/', (req, res) => {
  res.send('InvoiceCraft Backend API is running!');
});

// Login and Authentication routes
app.use('/api/authentication', createAuthRouter({ supabase: supabase, supabaseAdmin: supabaseAdmin }));

// Protected routes - now passing the supabase client to authenticateToken
// Each protected route group will now use authenticateToken({ supabase })
app.use('/api/customers', authenticateToken({ supabase }), createCustomerRouter({ supabase }));
app.use('/api/invoices', authenticateToken({ supabase }), createInvoiceRouter({ supabase }));
app.use('/api/order-forms', authenticateToken({ supabase }), createOrderFormRouter({ supabase }));
app.use('/api/branding-settings', authenticateToken({ supabase }), createBrandingSettingsRouter({ supabase }));
app.use('/api/item-route', authenticateToken({ supabase }), createItemRepositoryRouter({ supabase }));
app.use('/api/cover-page-templates', authenticateToken({ supabase }), createCoverPageTemplateRouter({ supabase }));
app.use('/api/msa-templates', authenticateToken({ supabase }), createMsaTemplateRouter({ supabase }));
app.use('/api/terms-templates', authenticateToken({ supabase }), createTermsTemplateRouter({ supabase }));
app.use('/api/Purchaseorder', authenticateToken({ supabase }), createPurchaseOrderRouter({ supabase }));

//Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(res.statusCode || 500).json({
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});


//Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
});
