import express, { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { signupSchema, loginSchema } from '../validators/authValidators';
import { sendSignupConfirmationEmail , sendPasswordResetEmail } from '../utils/sendEmail';

interface RouterOptions {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
}

const generateToken = () => crypto.randomBytes(32).toString('hex');

export const createAuthRouter = ({ supabase , supabaseAdmin }: RouterOptions) => {
  const router = express.Router();

  // SIGNUP
  router.post(
    '/signup',
    asyncHandler(async (req: Request, res: any) => {
      const { error: validationError, value } = signupSchema.validate(req.body);
      if (validationError) {
        return res.status(400).json({ message: validationError.details[0].message });
      }

      const { email, password, fullName } = value;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        if (
          authError.message.includes('already registered') ||
          authError.message.includes('User already registered')
        ) {
          return res.status(400).json({ message: 'User already exists' });
        }
        return res.status(400).json({ message: authError.message });
      }

      const user = authData.user;
      if (user) {
        const confirmToken = generateToken();
        console.log('[Email Confirmation Token]', confirmToken);

        const { error: profileError } = await supabase.from('profiles').insert([
          {
            id: user.id,
            full_name: fullName,
            email,
            email_confirmed: false,
            email_confirm_token: confirmToken,
          },
        ]);

        if (profileError) {
          return res.status(500).json({ message: profileError.message });
        }

        await sendSignupConfirmationEmail({
          to: email,
          name: fullName,
          token: confirmToken,
        });
      }

      res.status(201).json({
        message: 'Signup successful. Please check your email to confirm your account.',
      });
    })
  );

  // CONFIRM EMAIL
router.get(
  '/confirm-email',
  asyncHandler(async (req: Request, res: any) => {
    const { token } = req.query;
    console.log('[Confirm Email] Received token:', token);

    if (typeof token !== 'string') {
      return res.status(400).json({ message: 'Invalid token' });
    }

    // Try to find the profile using the token
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email_confirm_token', token)
      .single();

    console.log('[Confirm Email] Supabase query result - Profile:', profile, 'Error:', error);

    // Case 1: No profile found with this token (either truly invalid/expired, or already used and token cleared)
    if (error || !profile) {
      // It's possible the email was already confirmed and the token cleared.
      // In a real application, you might want to differentiate this by trying to find the user by email
      // and checking their 'email_confirmed' status. But for now, treating it as invalid/expired is common.
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Case 2: Profile found with the token. Now check its confirmation status.
    if (profile.email_confirmed) {
      // The email is already confirmed. This handles the second request of a double-click scenario.
      // Since it's already confirmed, we return a success status.
      return res.status(200).json({ message: 'Email already confirmed' });
    }

    // Case 3: Profile found with the token, and email is NOT yet confirmed.
    console.log('[Confirm Email] Updating profile ID:', profile.id);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email_confirmed: true,
        email_confirm_token: null, // Critical: Clear the token after confirmation
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('[Confirm Email] Update error:', updateError);
      return res.status(500).json({ message: 'Failed to confirm email' });
    }

    // Email successfully confirmed for the first time.
    return res.status(200).json({ message: 'Email successfully confirmed' });
  })
);

// FORGOT PASSWORD
router.post(
  '/forgot-password',
  asyncHandler(async (req: Request, res: any) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    // 1. Find the user by email
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError || !userProfile) {
      // For security, always send a generic success message even if email not found.
      // This prevents enumerating valid user emails.
      console.log(`[Forgot Password] User not found or error for email: ${email}`);
      return res.status(404).json({ message: 'User with this email does not exist.' });
   
    }

    // 2. Generate a unique, time-limited token
    const resetToken = crypto.randomBytes(32).toString('hex'); // Generate a random hex string
    const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // Token valid for 1 hour

    // 3. Store this token in the profiles table
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        password_reset_token: resetToken,
        password_reset_token_expires_at: resetTokenExpiry,
      })
      .eq('id', userProfile.id);

    if (updateError) {
      console.error('[Forgot Password] Error updating reset token:', updateError);
      return res.status(500).json({ message: 'Failed to process password reset request.' });
    }

    // 4. Send the password reset email
    try {
      await sendPasswordResetEmail({
        to: userProfile.email,
        token: resetToken,
      });
      console.log(`[Forgot Password] Password reset email sent to: ${userProfile.email}`);
      return res.status(200).json({
        message:
          'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).',
      });
    } catch (emailSendError) {
      console.error('[Forgot Password] Error sending password reset email:', emailSendError);
      // Even if email fails to send, for security, still return the generic message
      return res.status(200).json({
        message:
          'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).',
      });
    }
  })
);
// RESET PASSWORD
router.post(
  '/reset-password',
  asyncHandler(async (req: Request, res: any) => {
    const { token, newPassword } = req.body;

    console.log('[Reset Password] Received request for token:', token, 'with new password length:', newPassword?.length);

    if (!token || !newPassword) {
      console.log('[Reset Password] Missing token or new password.');
      return res.status(400).json({ message: 'Token and new password are required.' });
    }

    if (newPassword.length < 12) {
      console.log('[Reset Password] Password too short.');
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    // 1. Find the user by the reset token in your profiles table (using the regular supabase client)
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email, password_reset_token_expires_at') // 'email' भी सेलेक्ट करें
      .eq('password_reset_token', token)
      .single();

    if (userError || !userProfile) {
      console.log('[Reset Password] Invalid or missing token found:', token, 'Error:', userError);
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    // 2. Check if the token has expired
    const expiryDate = new Date(userProfile.password_reset_token_expires_at);
    if (expiryDate < new Date()) {
      console.log('[Reset Password] Token expired for user ID:', userProfile.id);
      // If expired, clear the token to prevent future use
      await supabase
        .from('profiles')
        .update({ password_reset_token: null, password_reset_token_expires_at: null })
        .eq('id', userProfile.id);
      return res.status(400).json({ message: 'Password reset token has expired. Please request a new one.' });
    }

    // 3. Update the user's password in Supabase Auth (THIS IS THE CRITICAL STEP)
    // Use the supabaseAdmin client for this administrative task
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userProfile.id, {
        password: newPassword, // Supabase Auth इसे स्वचालित रूप से हैश करेगा
    });

    if (authUpdateError) {
        console.error('[Reset Password] Error updating password in Supabase Auth:', authUpdateError);
        return res.status(500).json({ message: 'Failed to reset password in authentication system.' });
    }

    // 4. Clear reset token from your profiles table (after successfully updating auth password)
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        // password: hashedPassword, // अब इस लाइन की आवश्यकता नहीं है, क्योंकि Supabase Auth पासवर्ड को प्रबंधित करता है
        password_reset_token: null,
        password_reset_token_expires_at: null,
      })
      .eq('id', userProfile.id);

    if (profileUpdateError) {
      console.error('[Reset Password] Error clearing reset token in profiles table:', profileUpdateError);
      // यह एक गंभीर error नहीं है, क्योंकि पासवर्ड auth.users में अपडेट हो गया है,
      // लेकिन इसे लॉग करना अच्छा है। आप यहां 500 error वापस नहीं करना चाहेंगे।
    }

    console.log('[Reset Password] Password successfully reset for user ID:', userProfile.id);
    return res.status(200).json({ message: 'Password has been successfully reset.' });
  })
);
 // LOGIN ROUTE
router.post(
  '/login',
  asyncHandler(async (req: Request, res: any) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // 👇 Step 1: Check if user exists by email
    const { data: existingUser, error: userCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userCheckError || !existingUser) {
      // 👈 User not found
      return res.status(404).json({ message: 'User does not exist.' });
    }

    // 👇 Step 2: Try to log in now that we know user exists
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = data.user;
    const session = data.session;

    if (!user || !session) {
      return res.status(401).json({ message: 'Authentication failed.' });
    }

    // 👇 Step 3: Optional email confirmation check
    const { data: profileData, error: profileCheckError } = await supabase
      .from('profiles')
      .select('email_confirmed')
      .eq('id', user.id)
      .single();

    if (profileCheckError || !profileData || !profileData.email_confirmed) {
      await supabase.auth.signOut();
      return res.status(401).json({ message: 'Please confirm your email address to log in.' });
    }

    const jwt = require('jsonwebtoken');
    const customToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!, {
      expiresIn: '1h',
    });

    return res.status(200).json({
      message: 'Login successful',
      token: customToken,
      user: { id: user.id, email: user.email, session: session },
    });
  })
);
  return router;
};
