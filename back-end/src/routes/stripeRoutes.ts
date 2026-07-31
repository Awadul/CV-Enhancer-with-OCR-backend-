import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Router, Request, Response } from 'express';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let stripe: Stripe | null = null;
let supabase: any = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16' as any, // specify apiVersion compatible with the installed packages if needed
    });
  }
  return stripe;
}

function getSupabase() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials not configured');
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

const router = Router();

// Return Stripe publishable key
router.get('/stripe/config', (_req: Request, res: Response) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return res.status(500).json({ error: 'Stripe publishable key not configured' });
  }
  res.json({ publishableKey });
});

// Create a Stripe Checkout Session
router.post('/stripe/create-checkout', async (req: Request, res: Response) => {
  try {
    const { priceId, userId, successUrl, cancelUrl } = req.body;

    if (!priceId || !userId || !successUrl || !cancelUrl) {
      return res.status(400).json({ error: 'Missing required fields: priceId, userId, successUrl, cancelUrl' });
    }

    const s = getStripe();
    const sb = getSupabase();

    // Get or create Stripe customer
    const { data: subscription } = await sb
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const { data: user } = await sb.auth.admin.getUserById(userId);
      const email = user?.user?.email;

      const customer = await s.customers.create({
        email: email || undefined,
        metadata: { userId },
      });
      customerId = customer.id;

      await sb.from('user_subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        plan_id: 'starter',
        status: 'active',
      });
    }

    const session = await s.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe create-checkout error:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

// Create Customer Portal session
router.post('/stripe/customer-portal', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sb = getSupabase();
    const s = getStripe();

    const { data: subscription } = await sb
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!subscription?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const session = await s.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${req.headers.origin || 'http://localhost:3001'}/app/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe portal error:', err);
    res.status(500).json({ error: err.message || 'Failed to create portal session' });
  }
});

// Stripe Webhook (listens for subscription changes)
router.post('/stripe/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!sig) {
    return res.status(400).json({ error: 'Stripe signature is missing' });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const sb = getSupabase();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId && session.subscription) {
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const planId = subscription.items.data[0]?.price?.metadata?.plan_id || 'pro';

        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id || '';

        await sb.from('user_subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan_id: planId,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

      const { data: userSub } = await sb
        .from('user_subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (userSub?.user_id) {
        const planId = subscription.items.data[0]?.price?.metadata?.plan_id || 'starter';
        await sb.from('user_subscriptions').update({
          plan_id: subscription.status === 'active' ? planId : 'starter',
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('user_id', userSub.user_id);
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;
