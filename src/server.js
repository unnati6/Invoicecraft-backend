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


// fileupload - KEEP THIS IMPORT IF you use it for specific routes
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5000;

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
  // We can't log req.body here reliably if it's going to be parsed by Multer/express-fileupload
  // as the stream might not have been consumed yet.
  // The log within Multer or express.json() for specific routes is better.
  next();
});


const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log('Created uploads directory');
}
// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// API Routes Define
app.get('/api/status', (req, res) => {
  res.status(200).json({ message: 'InvoiceCraft Backend API is running!', timestamp: new Date() });
})

app.get('/', (req, res) => {
  res.send('InvoiceCraft Backend API is running!');
});

// Login and Authentication routes (expect JSON)
app.use('/api/authentication', express.json(), createAuthRouter({ supabase: supabase, supabaseAdmin: supabaseAdmin }));

// Protected routes - apply authentication and THEN the appropriate body parser
// Branding Settings: Uses Multer (defined inside createBrandingSettingsRouter)
app.use('/api/branding-settings', authenticateToken({ supabase }), createBrandingSettingsRouter({ supabase }));

// Cover Page Templates: Uses express-fileupload (apply it here)
// IMPORTANT: Make sure createCoverPageTemplateRouter's routes don't also try to use Multer.
// They should rely on req.files from express-fileupload.
app.use('/api/cover-page-templates', authenticateToken({ supabase }), fileUpload({createParentPath: true}), createCoverPageTemplateRouter({ supabase }));


// Other routes that expect JSON: Apply express.json()
app.use('/api/customers', authenticateToken({ supabase }), express.json(), createCustomerRouter({ supabase }));
app.use('/api/invoices', authenticateToken({ supabase }), express.json(), createInvoiceRouter({ supabase }));
app.use('/api/order-forms', authenticateToken({ supabase }), express.json(), createOrderFormRouter({ supabase }));
app.use('/api/item-route', authenticateToken({ supabase }), express.json(), createItemRepositoryRouter({ supabase }));
app.use('/api/msa-templates', authenticateToken({ supabase }), express.json(), createMsaTemplateRouter({ supabase }));
app.use('/api/terms-templates', authenticateToken({ supabase }), express.json(), createTermsTemplateRouter({ supabase }));
app.use('/api/Purchaseorder', authenticateToken({ supabase }), express.json(), createPurchaseOrderRouter({ supabase }));

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