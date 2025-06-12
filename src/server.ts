// server.ts

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import asyncHandler from 'express-async-handler';

// Route files import
import { createCustomerRouter } from './routes/customerRoutes';
import { createInvoiceRouter } from './routes/invoiceRoutes';
import { createOrderFormRouter } from './routes/orderFormRoutes';
import { createBrandingSettingsRouter } from './routes/brandingSettingsRoutes';
import { createCoverPageTemplateRouter } from './routes/templateRoutes/coverPageTemplateRoutes';
import { createMsaTemplateRouter } from './routes/templateRoutes/msaTemplateRoutes';
import { createTermsTemplateRouter } from './routes/templateRoutes/termsTemplateRoutes';
import { createItemRepositoryRouter } from './routes/itemrepositort';
import { createAuthRouter } from './routes/authenticationRoute'; // अब authenticationRoute.ts में दो क्लाइंट्स की अपेक्षा होगी
import { createPurchaseOrderRouter } from './routes/purchaseOrderRoutes';


const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:9002', 'https://invoicecraft-murex.vercel.app/'], // '*' का उपयोग प्रोडक्शन में सावधानी से करें
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Supabase क्लाइंट्स के लिए वेरिएबल्स
let supabase: SupabaseClient; // For public (anon key) access and RLS-controlled operations
let supabaseAdmin: SupabaseClient; // For service_role key access and admin operations

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // <--- सुनिश्चित करें कि आपके .env में यह है
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL, Anon Key, or Service Role Key in environment variables. Please check your .env file.');
  process.exit(1);
} else {
  // Public/anon client
  supabase = createClient(supabaseUrl, supabaseAnonKey, { // <--- anon key का उपयोग करें
    auth: {
      autoRefreshToken: true, // Auto refresh token for sessions
      persistSession: true, // Persist sessions (useful for client-side, but okay for server-side too)
    }
  });
  console.log('Supabase (Anon) client initialized.');

  // Admin client
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, { // <--- service_role key का उपयोग करें
    auth: {
      autoRefreshToken: false, // No need to refresh tokens for service_role
      persistSession: false // No need to persist session for service_role
    }
  });
  console.log('Supabase (Admin) client initialized.');


  async function testSupabaseConnection() {
    try {
      // आप यहां किसी भी क्लाइंट का उपयोग कर सकते हैं, admin क्लाइंट का उपयोग करना सुनिश्चित करेगा कि यह काम करता है
      const { data, error } = await supabaseAdmin.from('customer').select('id').limit(1);
      if (error) throw error;
      console.log('Supabase connection test: Fetched sample customer data.');
    } catch (error: any) {
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
app.get('/api/status', (req:express.Request, res: express.Response) => {
    res.status(200).json({ message: 'InvoiceCraft Backend API is running!', timestamp: new Date() });
})

app.get('/', (req: express.Request, res: express.Response) => {
  res.send('InvoiceCraft Backend API is running!');
});

// Login and Authentication routes
app.use('/api/authentication', createAuthRouter({ supabase: supabase, supabaseAdmin: supabaseAdmin })); // <--- दोनों क्लाइंट्स को पास करें

// Customer routes
app.use('/api/customers', createCustomerRouter({ supabase }));

// Invoice routes
app.use('/api/invoices', createInvoiceRouter({ supabase }));

// Order Form routes
app.use('/api/order-forms', createOrderFormRouter({ supabase }));

// Branding Settings routes
app.use('/api/branding-settings', createBrandingSettingsRouter({ supabase }));

// Item routes
app.use('/api/item-route', createItemRepositoryRouter({ supabase }));

// Template routes
app.use('/api/cover-page-templates', createCoverPageTemplateRouter({ supabase /*, authenticateToken */ }));
app.use('/api/msa-templates', createMsaTemplateRouter({ supabase /*, authenticateToken */ }));
app.use('/api/terms-templates', createTermsTemplateRouter({ supabase /*, authenticateToken */ }));

//Po Routes
app.use('/api/Purchaseorder', createPurchaseOrderRouter({ supabase }));

//Error Handling Middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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