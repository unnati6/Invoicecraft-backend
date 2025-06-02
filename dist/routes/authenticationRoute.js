"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = void 0;
const express_1 = __importDefault(require("express"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const createAuthRouter = ({ supabase }) => {
    const router = express_1.default.Router();
    // SIGNUP route
    router.post('/signup', (0, express_async_handler_1.default)(async (req, res) => {
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
                    id: user.id, // link to auth.users
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
    router.post('/login', (0, express_async_handler_1.default)(async (req, res) => {
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
exports.createAuthRouter = createAuthRouter;
