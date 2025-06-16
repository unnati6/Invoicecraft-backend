import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER, // Removed '!'
    pass: process.env.SMTP_PASS, // Removed '!'
  },
});

/**
 * @typedef {Object} SignupEmailOptions
 * @property {string} to
 * @property {string} name
 * @property {string} token
 */

/**
 * Sends a signup confirmation email.
 * @param {SignupEmailOptions} options
 * @returns {Promise<void>}
 */
export const sendSignupConfirmationEmail = async ({
  to,
  name,
  token,
}) => { // Removed type annotations
  const confirmLink = `${process.env.CLIENT_URL}/confirm-email?token=${token}`;
  await transporter.sendMail({
    from: `"Revynox" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Confirm Your Email - Revynox',
    html: `
        <h2>Welcome, ${name}!</h2>
        <p>Click the link below to confirm your email:</p>
        <a href="${confirmLink}">${confirmLink}</a>
        `,
  });
};

/**
 * @typedef {Object} PasswordResetEmailOptions
 * @property {string} to
 * @property {string} token
 */

/**
 * Sends a password reset email.
 * @param {PasswordResetEmailOptions} options
 * @returns {Promise<void>}
 */
export const sendPasswordResetEmail = async ({
  to,
  token,
}) => { // Removed type annotations
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `"Revynox" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset Your Password - Revynox',
    html: `
        <h2>Password Reset Requested</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn't request this, ignore the email.</p>
        `,
  });
};
