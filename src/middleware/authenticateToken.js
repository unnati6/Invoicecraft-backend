// middleware/authenticateToken.js
import jwt from 'jsonwebtoken'; // Still needed for general JWT operations, but main verification will use Supabase client

/**
 * Middleware to authenticate requests using a JWT from the Authorization header.
 * This version expects a Supabase-issued JWT and verifies it using the Supabase client.
 *
 * @param {object} options - Options object.
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase - The Supabase client instance (anon key).
 */
export const authenticateToken = ({ supabase }) => {
  return async (req, res, next) => { // Make the middleware function async
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[Authentication Middleware] Missing or malformed Authorization header.');
      return res.status(401).json({ message: 'Authentication token is required and must be in Bearer format.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      console.warn('[Authentication Middleware] Token missing after Bearer split.');
      return res.status(401).json({ message: 'Authentication token is missing.' });
    }

    try {
      // Use Supabase client to get the user based on the provided access token
      // This automatically verifies the Supabase-issued JWT against your Supabase instance.
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError) {
        console.error('[Authentication Middleware] Supabase JWT verification failed:', authError.message);
        // Supabase returns specific errors like 'AuthApiError: invalid jwt' or 'token expired'
        // We can map these to appropriate HTTP responses.
        if (authError.message.includes('invalid jwt') || authError.message.includes('token expired')) {
            return res.status(403).json({ message: 'Invalid or expired authentication token.' });
        }
        return res.status(500).json({ message: 'Authentication service error.' });
      }

      if (!user) {
        console.error('[Authentication Middleware] No user found for provided token.');
        return res.status(403).json({ message: 'Authentication token is invalid (no user found).' });
      }

      // Attach user information to the request object
      // We'll extract relevant fields from the Supabase user object
      req.user = {
        id: user.id,
        email: user.email,
        // Add other user properties you might need from Supabase user object
      };
      console.log(`[Authentication Middleware] User authenticated: ${user.email} (ID: ${user.id})`);
      next(); // Proceed to the next middleware or route handler

    } catch (error) {
      console.error('[Authentication Middleware] Unexpected error during token verification:', error.message);
      return res.status(500).json({ message: 'Internal server error during authentication.' });
    }
  };
};

// Note: No default export for this middleware.
// It will be imported as `import { authenticateToken } from './middleware/authenticateToken.js';`
// and used in `server.js` like `app.use('/api/customers', authenticateToken({ supabase }), createCustomerRouter({ supabase }));`
