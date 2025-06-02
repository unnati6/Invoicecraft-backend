// server.ts

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import asyncHandler from 'express-async-handler';

// Route files import
import { createCustomerRouter } from './routes/customerRoutes';
import { createInvoiceRouter } from './routes/invoiceRoutes';
import { createOrderFormRouter } from './routes/orderFormRoutes';
import { createBrandingSettingsRouter } from './routes/brandingSettingsRoutes';
import { createCoverPageTemplateRouter } from './routes/templateRoutes/coverPageTemplateRoutes'; 
import { createMsaTemplateRouter } from './routes/templateRoutes/msaTemplateRoutes';         
import { createTermsTemplateRouter } from './routes/templateRoutes/termsTemplateRoutes';      
import { createItemRepositoryRouter } from  './routes/itemrepositort';
import { createAuthRouter } from './routes/authenticationRoute';
import { createPurchaseOrderRouter } from './routes/purchaseOrderRoutes';
declare module 'express-serve-static-core' {
  interface Request {
    user?: admin.auth.DecodedIdToken;
  }
}

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (serviceAccountPath) {
  try {
    const serviceAccount = require(serviceAccountPath);
    console.log('DEBUG: Service account loaded successfully.');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized.');
  } catch (error : any) {
    console.error('Error initializing Firebase Admin SDK. Check FIREBASE_SERVICE_ACCOUNT_PATH:', error);
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set. Firebase authentication features will be unavailable.');
}


const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3000', 'https://your-firebase-project-id.web.app'
     ,'https://9000-firebase-studio-1747723924581.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev'
    ,'http://localhost:9002'
     ,'https://invoicecraft-frontend.vercel.app'
  ],
  
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
}));

let supabase: SupabaseClient;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is not set in environment variables. Please check your .env file.');
  process.exit(1);
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized.');

  async function testSupabaseConnection() {
    try {
      const { data, error } = await supabase.from('customer').select('id').limit(1);
      if (error) throw error;
      console.log('Supabase connection test: Fetched sample customer data.');
    } catch (error: any) {
      console.error('Supabase connection test failed:', error.message);
    }
  }
  testSupabaseConnection();
}

// Authentication Middleware
const authenticateToken = asyncHandler(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401);
    throw new Error('Authorization header missing or invalid format.');
  }

  const idToken = authHeader.split('Bearer ')[1];

  if (!admin.apps.length) {
      res.status(500);
      throw new Error('Firebase Admin SDK not initialized. Authentication is unavailable.');
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error.message);
    res.status(403);
    throw new Error('Unauthorized: Invalid or expired token.');
  }
});

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

//Login 
app.use('/api/authentication',createAuthRouter({supabase}));
// Customer routes
app.use('/api/customers',createCustomerRouter({ supabase })); 


// Invoice routes
app.use('/api/invoices',  createInvoiceRouter({ supabase  }));

// Order Form routes
app.use('/api/order-forms', createOrderFormRouter({ supabase  }));

// Branding Settings routes
app.use('/api/branding-settings', createBrandingSettingsRouter({ supabase  }));

// Item routes
app.use('/api/item-route',createItemRepositoryRouter({supabase}));
// Template routes
app.use('/api/cover-page-templates', createCoverPageTemplateRouter({ supabase /*, authenticateToken */ })); 
app.use('/api/msa-templates', createMsaTemplateRouter({ supabase /*, authenticateToken */ }));            
app.use('/api/terms-templates', createTermsTemplateRouter({ supabase /*, authenticateToken */ }));         
//Po Routes
app.use('/api/Purchaseorder', createPurchaseOrderRouter({supabase}))
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