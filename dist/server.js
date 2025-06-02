"use strict";
// server.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const supabase_js_1 = require("@supabase/supabase-js");
const admin = __importStar(require("firebase-admin"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
// Route files import
const customerRoutes_1 = require("./routes/customerRoutes");
const invoiceRoutes_1 = require("./routes/invoiceRoutes");
const orderFormRoutes_1 = require("./routes/orderFormRoutes");
const brandingSettingsRoutes_1 = require("./routes/brandingSettingsRoutes");
const coverPageTemplateRoutes_1 = require("./routes/templateRoutes/coverPageTemplateRoutes");
const msaTemplateRoutes_1 = require("./routes/templateRoutes/msaTemplateRoutes");
const termsTemplateRoutes_1 = require("./routes/templateRoutes/termsTemplateRoutes");
const itemrepositort_1 = require("./routes/itemrepositort");
const authenticationRoute_1 = require("./routes/authenticationRoute");
const purchaseOrderRoutes_1 = require("./routes/purchaseOrderRoutes");
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (serviceAccountPath) {
    try {
        const serviceAccount = require(serviceAccountPath);
        console.log('DEBUG: Service account loaded successfully.');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin SDK initialized.');
    }
    catch (error) {
        console.error('Error initializing Firebase Admin SDK. Check FIREBASE_SERVICE_ACCOUNT_PATH:', error);
    }
}
else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set. Firebase authentication features will be unavailable.');
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'https://your-firebase-project-id.web.app',
        'https://9000-firebase-studio-1747723924581.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev',
        'http://localhost:9002',
        '*'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
let supabase;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key is not set in environment variables. Please check your .env file.');
    process.exit(1);
}
else {
    supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized.');
    async function testSupabaseConnection() {
        try {
            const { data, error } = await supabase.from('customer').select('id').limit(1);
            if (error)
                throw error;
            console.log('Supabase connection test: Fetched sample customer data.');
        }
        catch (error) {
            console.error('Supabase connection test failed:', error.message);
        }
    }
    testSupabaseConnection();
}
// Authentication Middleware
const authenticateToken = (0, express_async_handler_1.default)(async (req, res, next) => {
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
    }
    catch (error) {
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
app.get('/api/status', (req, res) => {
    res.status(200).json({ message: 'InvoiceCraft Backend API is running!', timestamp: new Date() });
});
app.get('/', (req, res) => {
    res.send('InvoiceCraft Backend API is running!');
});
//Login 
app.use('/api/authentication', (0, authenticationRoute_1.createAuthRouter)({ supabase }));
// Customer routes
app.use('/api/customers', (0, customerRoutes_1.createCustomerRouter)({ supabase }));
// Invoice routes
app.use('/api/invoices', (0, invoiceRoutes_1.createInvoiceRouter)({ supabase }));
// Order Form routes
app.use('/api/order-forms', (0, orderFormRoutes_1.createOrderFormRouter)({ supabase }));
// Branding Settings routes
app.use('/api/branding-settings', (0, brandingSettingsRoutes_1.createBrandingSettingsRouter)({ supabase }));
// Item routes
app.use('/api/item-route', (0, itemrepositort_1.createItemRepositoryRouter)({ supabase }));
// Template routes
app.use('/api/cover-page-templates', (0, coverPageTemplateRoutes_1.createCoverPageTemplateRouter)({ supabase /*, authenticateToken */ }));
app.use('/api/msa-templates', (0, msaTemplateRoutes_1.createMsaTemplateRouter)({ supabase /*, authenticateToken */ }));
app.use('/api/terms-templates', (0, termsTemplateRoutes_1.createTermsTemplateRouter)({ supabase /*, authenticateToken */ }));
//Po Routes
app.use('/api/Purchaseorder', (0, purchaseOrderRoutes_1.createPurchaseOrderRouter)({ supabase }));
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
