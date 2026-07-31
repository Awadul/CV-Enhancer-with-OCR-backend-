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
    let customerId: string | undefined;

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const isUuid = uuidRegex.test(userId);

    if (isUuid) {
      const sb = getSupabase();

      // Get or create Stripe customer
      try {
        const { data: subscription } = await sb
          .from('user_subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', userId)
          .maybeSingle();

        customerId = subscription?.stripe_customer_id;
      } catch (dbErr) {
        console.warn('Database query failed (non-blocking for checkout):', dbErr);
      }

      if (!customerId) {
        let email: string | undefined;
        try {
          const { data: user } = await sb.auth.admin.getUserById(userId);
          email = user?.user?.email;
        } catch (authErr) {
          console.warn('Auth user query failed (non-blocking for checkout):', authErr);
        }

        const customer = await s.customers.create({
          email: email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;

        try {
          await sb.from('user_subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            plan_id: 'starter',
            status: 'active',
          });
        } catch (dbErr) {
          console.warn('Database upsert failed (non-blocking for checkout):', dbErr);
        }
      }
    } else {
      // Mock user fallback
      console.log(`Mock user detected: ${userId}. Creating Stripe customer without Supabase lookup.`);
      const customer = await s.customers.create({
        email: `${userId}@example.com`,
        metadata: { userId },
      });
      customerId = customer.id;
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

    const s = getStripe();
    let customerId: string | undefined;

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const isUuid = uuidRegex.test(userId);

    if (isUuid) {
      const sb = getSupabase();
      try {
        const { data: subscription } = await sb
          .from('user_subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', userId)
          .maybeSingle();

        customerId = subscription?.stripe_customer_id;
      } catch (dbErr) {
        console.error('Portal: Database query failed:', dbErr);
      }
    } else {
      // Mock user fallback
      console.log(`Portal: Mock user detected: ${userId}. Searching for customer by metadata.`);
      try {
        const customers = await s.customers.search({
          query: `metadata['userId']:'${userId}'`,
          limit: 1,
        });
        customerId = customers.data[0]?.id;
      } catch (searchErr) {
        console.error('Portal: Customer search failed:', searchErr);
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const session = await s.billingPortal.sessions.create({
      customer: customerId,
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

        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        if (uuidRegex.test(userId)) {
          await sb.from('user_subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: planId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });
        } else {
          console.log(`Webhook: Mock user checkout completed for: ${userId}. Bypassing database sync.`);
        }
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

      try {
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
      } catch (dbErr) {
        console.warn('Webhook: Subscription update database check failed (non-blocking):', dbErr);
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;
