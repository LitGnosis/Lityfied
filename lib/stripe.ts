import 'server-only';
import Stripe from 'stripe';

const secretKey = process.env.LG_STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;
