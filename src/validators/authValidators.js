import Joi from 'joi';

export const signupSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required.',
    'string.email': 'Please enter a valid email.',
  }),
  password: Joi.string()
    .min(12)
    .pattern(new RegExp('(?=.*[a-z])'), 'lowercase letter')
    .pattern(new RegExp('(?=.*[A-Z])'), 'uppercase letter')
    .pattern(new RegExp('(?=.*[0-9])'), 'number')
    .pattern(new RegExp('(?=.*[!@#$%^&*])'), 'special character')
    .required()
    .messages({
      'string.empty': 'Password is required.',
      'string.min': 'Password must be at least 12 characters.',
      'string.pattern.name': 'Password must include at least one {#name}.',
    }),
  fullName: Joi.string().required().messages({
    'string.empty': 'Full name is required.',
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required.',
    'string.email': 'Please enter a valid email.',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required.',
  }),
});

// Since you're using named exports (export const), a default export like this
// isn't strictly necessary if you only import the named exports.
// However, if other parts of your code expect a default export, you can keep it.
// For ES Modules, it would be:
// const authValidators = {
//   signupSchema,
//   loginSchema,
// };
// export default authValidators;
// Or, simply import the named exports directly where needed.
