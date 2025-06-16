import express from 'express';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
//import jwt from 'jsonwebtoken'; // No longer needed for signing custom JWTs here

import { signupSchema, loginSchema } from '../validators/authValidators.js';
import { sendSignupConfirmationEmail, sendPasswordResetEmail } from '../utils/sendEmail.js';

const generateToken = () => crypto.randomBytes(32).toString('hex');

export const createAuthRouter = ({ supabase, supabaseAdmin }) => {
  const router = express.Router();

  // SIGNUP
  router.post(
    '/signup',
    asyncHandler(async (req, res) => {
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
    asyncHandler(async (req, res) => {
      const { token } = req.query;
      console.log('[Confirm Email] Received token:', token);

      if (typeof token !== 'string') {
        return res.status(400).json({ message: 'Invalid token' });
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email_confirm_token', token)
        .single();

      console.log('[Confirm Email] Supabase query result - Profile:', profile, 'Error:', error);

      if (error || !profile) {
        return res.status(400).json({ message: 'Invalid or expired token' });
      }

      if (profile.email_confirmed) {
        return res.status(200).json({ message: 'Email already confirmed' });
      }

      console.log('[Confirm Email] Updating profile ID:', profile.id);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          email_confirmed: true,
          email_confirm_token: null,
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error('[Confirm Email] Update error:', updateError);
        return res.status(500).json({ message: 'Failed to confirm email' });
      }

      return res.status(200).json({ message: 'Email successfully confirmed' });
    })
  );

  // FORGOT PASSWORD
  router.post(
    '/forgot-password',
    asyncHandler(async (req, res) => {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
      }

      const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .single();

      if (userError || !userProfile) {
        console.log(`[Forgot Password] User not found or error for email: ${email}`);
        return res.status(404).json({ message: 'User with this email does not exist.' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString();

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
    asyncHandler(async (req, res) => {
      const { token, newPassword } = req.body;

      console.log('[Reset Password] Received request for token:', token, 'with new password length:', newPassword?.length);

      if (!token || !newPassword) {
        console.log('[Reset Password] Missing token or new password.');
        return res.status(400).json({ message: 'Token and new password are required.' });
      }

      if (newPassword.length < 6) {
        console.log('[Reset Password] Password too short.');
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
      }

      const { data: userProfile, error: userError } = await supabase
        .from('profiles')
        .select('id, email, password_reset_token_expires_at')
        .eq('password_reset_token', token)
        .single();

      if (userError || !userProfile) {
        console.log('[Reset Password] Invalid or missing token found:', token, 'Error:', userError);
        return res.status(400).json({ message: 'Invalid or expired password reset token.' });
      }

      const expiryDate = new Date(userProfile.password_reset_token_expires_at);
      if (expiryDate < new Date()) {
        console.log('[Reset Password] Token expired for user ID:', userProfile.id);
        await supabase
          .from('profiles')
          .update({ password_reset_token: null, password_reset_token_expires_at: null })
          .eq('id', userProfile.id);
        return res.status(400).json({ message: 'Password reset token has expired. Please request a new one.' });
      }

      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userProfile.id, {
          password: newPassword,
      });

      if (authUpdateError) {
          console.error('[Reset Password] Error updating password in Supabase Auth:', authUpdateError);
          return res.status(500).json({ message: 'Failed to reset password in authentication system.' });
      }

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          password_reset_token: null,
          password_reset_token_expires_at: null,
        })
        .eq('id', userProfile.id);

      if (profileUpdateError) {
        console.error('[Reset Password] Error clearing reset token in profiles table:', profileUpdateError);
      }

      console.log('[Reset Password] Password successfully reset for user ID:', userProfile.id);
      return res.status(200).json({ message: 'Password has been successfully reset.' });
    })
  );

  // LOGIN ROUTE
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
      }

      // Check if user exists by email (optional, Supabase signInWithPassword handles non-existent users gracefully)
      // This is mostly for custom error messages like "User does not exist" vs "Invalid credentials"
      const { data: existingUser, error: userCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (userCheckError || !existingUser) {
        // User not found in profiles (might mean not registered or a Supabase internal issue)
        return res.status(404).json({ message: 'User does not exist.' });
      }

      // Perform Supabase authentication
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Supabase returns generic 'Invalid login credentials' for security reasons
        // We can differentiate slightly if we already checked 'existingUser'
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const user = data.user;
      const session = data.session;

      if (!user || !session) {
        return res.status(401).json({ message: 'Authentication failed.' });
      }

      // Optional: Email confirmation check
      const { data: profileData, error: profileCheckError } = await supabase
        .from('profiles')
        .select('email_confirmed')
        .eq('id', user.id)
        .single();

      if (profileCheckError || !profileData || !profileData.email_confirmed) {
        // Sign out the user immediately if email is not confirmed
        await supabase.auth.signOut();
        return res.status(401).json({ message: 'Please confirm your email address to log in.' });
      }

    // const customToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
    //     expiresIn: '24h', // Changed from '1h' to '7d' for a longer expiry
    //   });
       return res.status(200).json({
        message: 'Login successful',
        token: session.access_token,
        user: { id: user.id, email: user.email, session: session },
      });
    })
  );
  // LOGOUT Endpoint
  // Path: /api/authentication/logout
  router.post('/logout', asyncHandler(async (req, res) => {
    // JWT को blacklist mein add karein (agar aap stateless JWTs ko invalidate karna chahte hain)
    // Yeh token ki expiration tak iski punah upyog ko rokta hai.
    const tokenToInvalidate = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
    if (tokenToInvalidate) {
        // Token ki expiry time nikal kar blacklist mein add karein
        const decodedToken = jwt.decode(tokenToInvalidate);
        if (decodedToken && decodedToken.exp) {
            const expiresInMs = (decodedToken.exp * 1000) - Date.now();
            invalidatedTokens.add(tokenToInvalidate);
            // Blacklist se token ko hata dein jab woh expire ho jaye
            setTimeout(() => {
                invalidatedTokens.delete(tokenToInvalidate);
                console.log(`Token removed from blacklist after expiry: ${tokenToInvalidate}`);
            }, expiresInMs);
            console.log(`Token blacklisted: ${tokenToInvalidate} for ${expiresInMs / 1000} seconds`);
        } else {
             invalidatedTokens.add(tokenToInvalidate); // Agar exp nahi hai to hamesha ke liye blacklist
             console.log(`Token blacklisted without expiry: ${tokenToInvalidate}`);
        }
    }

    // Agar aap HTTP-only cookies ka upyog kar rahe hain authentication ke liye, toh unhe clear karein
    // Udaharan: res.clearCookie('authToken'); // Apni cookie ka naam change karein
    // res.clearCookie('refreshToken'); // Refresh token cookie bhi clear karein

    // Optional: Supabase user ke session ko force-fully sign out karein
    // Yeh useful ho sakta hai agar aapke paas Supabase admin rights hain
    // aur aap backend se kisi user ko force logout karna chahte hain.
    // NOTE: Agar aap frontend se supabase.auth.signOut() call kar rahe hain,
    // toh iski zaroorat nahi hai. Yeh tabhi useful hai jab aap server-side se
    // ek user ke session ko terminate karna chahte hain.
    // if (req.user && req.user.sub) { // req.user mein decoded token payload hota hai
    //     const userId = req.user.sub; // Supabase JWTs mein 'sub' field user ID hota hai
    //     const { error: adminSignOutError } = await supabaseAdmin.auth.admin.signOut(userId);
    //     if (adminSignOutError) {
    //         console.error("Supabase Admin SignOut Error:", adminSignOutError);
    //     } else {
    //         console.log(`Supabase user ${userId} force-signed out by admin.`);
    //     }
    // }

    // Frontend ko success response bhejein
    res.status(200).json({ message: "Logged out successfully." });
  }));
  return router;
};
