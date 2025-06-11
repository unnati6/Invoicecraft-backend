    import nodemailer from 'nodemailer';
    import dotenv from 'dotenv';

    dotenv.config();

    const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true for port 465, false for 587
    auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
    },
    });

    interface SignupEmailOptions {
    to: string;
    name: string;
    token: string;
    }

    export const sendSignupConfirmationEmail = async ({
    to,
    name,
    token,
    }: SignupEmailOptions): Promise<void> => {
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

    interface PasswordResetEmailOptions {
    to: string;
    token: string;
    }

    export const sendPasswordResetEmail = async ({
    to,
    token,
    }: PasswordResetEmailOptions): Promise<void> => {
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
