import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';

interface RouterOptions {
  supabase: SupabaseClient;
}

export const createAuthRouter = ({ supabase }: RouterOptions) => {
  const router = express.Router();

  // SIGNUP route
  router.post('/signup', asyncHandler(async (req, res) => {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      res.status(400);
      throw new Error('Name, email, and password are required.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error('Signup error:', authError.message);
      res.status(400);
      throw new Error(authError.message);
    }

    const user = authData.user;
    if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: user.id,        // link to auth.users
            full_name: fullName,
            email,
          },
        ]);

      if (profileError) {
        console.error('Profile creation error:', profileError.message);
        res.status(500);
        throw new Error(profileError.message);
      }
    }

    res.status(201).json({
      message: 'Signup successful. Please check your email for confirmation.',
      user,
    });
  }));

   router.post('/login', asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400);
            throw new Error('Email and password are required.');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error('Login error:', error.message);
            res.status(401);
            // Map Supabase error messages to more user-friendly ones if desired
            let errorMessage = error.message;
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Invalid email or password.';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Please confirm your email address before logging in.';
            }
            throw new Error(errorMessage); // Throwing the mapped error
        }

        // Ensure session and user data exist after successful login
        if (!data.session || !data.user) {
            console.error('Login successful with Supabase but no session or user data returned.');
            res.status(500);
            throw new Error('Internal server error: Failed to retrieve user session.');
        }

        // --- CORRECTED RESPONSE HERE ---
        res.status(200).json({
            message: 'Login successful.',
            accessToken: data.session.access_token, // <--- Access token directly
            refreshToken: data.session.refresh_token, // <--- Refresh token directly
            user: { // You can still include the user object if needed
                id: data.user.id,
                email: data.user.email,
                // Add any other user properties you want from data.user here
                // e.g., full_name: data.user.user_metadata?.full_name,
            },
        });
    }));

    return router;
};