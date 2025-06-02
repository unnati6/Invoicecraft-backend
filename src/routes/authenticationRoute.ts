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
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
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
            full_name: name,
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

  // LOGIN route
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
      throw new Error(error.message);
    }

    res.status(200).json({
      message: 'Login successful.',
      session: data.session,
      user: data.user,
    });
  }));

  return router;
};
