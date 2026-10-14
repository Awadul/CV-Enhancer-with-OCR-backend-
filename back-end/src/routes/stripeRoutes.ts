import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Router, Request, Response } from 'express';
import { AccessRequest, requireUser } from '../middleware/aiAccess';
import { billingUser, billingOrigin, checkoutPolicy, BillingPolicyError } from '../utils/billingPolicy';


let stripe: Stripe | null = null;
let supabase: any = null;

function getStripe(): Stripe {
  if (!stripe) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16' as any, // specify apiVersion compatible with the installed packages if needed
    });
  }
  return stripe;
}

function getSupabase() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

// Billing identity always comes from the verified token, never from body metadata.
router.post('/stripe/create-checkout', requireUser, async (req: AccessRequest, res: Response) => {
  try {
    const userId = billingUser(req);
    const { priceId, successUrl, cancelUrl } = checkoutPolicy(req.body || {});
    const sb = getSupabase();
    const { data: subscription, error: lookupError } = await sb.from('user_subscriptions')
      .select('stripe_customer_id').eq('user_id', userId).maybeSingle();
    if (lookupError) throw lookupError;
    const s = getStripe();
    let customerId = subscription?.stripe_customer_id;
    if (!customerId) {
      const customer = await s.customers.create({
        email: req.userEmail || undefined,
        metadata: { userId },
      }, { idempotencyKey: `customer:${userId}` });
      customerId = customer.id;
      // Do not overwrite an existing paid plan or subscription status.
      const { error } = await sb.from('user_subscriptions').upsert({
        user_id: userId, stripe_customer_id: customerId,
      }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    const session = await s.checkout.sessions.create({
      customer: customerId, mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl, cancel_url: cancelUrl, metadata: { userId },
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout failed:', error);
    const policy = error instanceof BillingPolicyError;
    res.status(policy ? error.status : 503).json({ error: policy ? error.message : 'Billing is temporarily unavailable.' });
  }
});

router.post('/stripe/customer-portal', requireUser, async (req: AccessRequest, res: Response) => {
  try {
    const userId = billingUser(req);
    const { data: subscription, error } = await getSupabase().from('user_subscriptions')
      .select('stripe_customer_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!subscription?.stripe_customer_id) return res.status(404).json({ error: 'No billing account was found for your account.' });
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${billingOrigin()}/app/dashboard`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal failed:', error);
    const policy = error instanceof BillingPolicyError;
    res.status(policy ? error.status : 503).json({ error: policy ? error.message : 'Billing is temporarily unavailable.' });
  }
});

// Stripe Webhook (listens for subscription changes)
router.post('/stripe/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log(`[Webhook] Received Stripe webhook event notification. Target Supabase URL: ${process.env.SUPABASE_URL}`);

  if (!webhookSecret) {
    console.error('[Webhook Error] STRIPE_WEBHOOK_SECRET is not configured on the server.');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!sig) {
    console.error('[Webhook Error] stripe-signature header is missing in request.');
    return res.status(400).json({ error: 'Stripe signature is missing' });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`[Webhook] Event signature verified successfully. Event ID: ${event.id}, Type: ${event.type}`);
  } catch (err: any) {
    console.error('[Webhook Error] Event signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const sb = getSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        console.log(`[Webhook] Processing checkout.session.completed. userId: ${userId}, customerId: ${session.customer}, subscription: ${session.subscription}`);

        if (userId && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

          console.log(`[Webhook] Retrieving subscription details for ID: ${subscriptionId}`);
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          console.log(`[Webhook] Stripe Subscription retrieved. Status is: "${subscription.status}"`);

          // Retrieve full price details to access nickname and product name
          const priceDetails = await getStripe().prices.retrieve(
            subscription.items.data[0]?.price?.id,
            { expand: ['product'] }
          );
          const priceNickname = priceDetails.nickname || '';
          const productName = (priceDetails.product as any)?.name || '';
          const rawPlanId = priceDetails.metadata?.plan_id || '';

          // Determine plan_id: metadata first, then nickname/product name, then fallback
          let planId: string;
          if (rawPlanId && ['starter', 'pro', 'premium', 'enterprise'].includes(rawPlanId)) {
            planId = rawPlanId;
          } else {
            const searchStr = (rawPlanId + ' ' + priceNickname + ' ' + productName).toLowerCase();
            if (searchStr.includes('premium')) planId = 'premium';
            else if (searchStr.includes('enterprise')) planId = 'enterprise';
            else if (searchStr.includes('pro')) planId = 'pro';
            else planId = 'pro'; // safe paid-tier default
          }
          console.log(`[Webhook] Resolved plan_id: "${planId}" (metadata: "${rawPlanId}", nickname: "${priceNickname}", product: "${productName}")`);

          let status = subscription.status;
          const allowedStatuses = ['active', 'canceled', 'past_due', 'trialing'];
          if (!allowedStatuses.includes(status)) {
            const originalStatus = status;
            if (status === 'incomplete' || status === 'unpaid' || status === 'incomplete_expired' || status === 'paused') {
              status = 'past_due';
            } else {
              status = 'active';
            }
            console.log(`[Webhook] status "${originalStatus}" normalized to "${status}" to satisfy DB constraints.`);
          }

          const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id || '';

          const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
          if (uuidRegex.test(userId)) {
            console.log(`[Webhook] Upserting subscription record into Supabase for user_id: ${userId}`);
            
            const upsertPayload: any = {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan_id: planId,
              status: status,
            };

            if (subscription.current_period_start) {
              upsertPayload.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
            }
            if (subscription.current_period_end) {
              upsertPayload.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
            }

            const { error: dbErr } = await sb.from('user_subscriptions').upsert(upsertPayload, { onConflict: 'user_id' });

            if (dbErr) {
              throw new Error(`Database upsert failed: ${dbErr.message} (Code: ${dbErr.code})`);
            }
            console.log('[Webhook] Database upsert completed successfully.');
          } else {
            console.warn(`[Webhook] User ID "${userId}" is not a valid UUID. Skipping database upsert.`);
          }
        } else {
          console.warn('[Webhook] Missing userId metadata or subscription in checkout session event data.');
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
        console.log(`[Webhook] Processing subscription status update. Customer ID: ${customerId}, New Status: "${subscription.status}"`);

        const { data: userSub, error: findErr } = await sb
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (findErr) {
          throw new Error(`Failed to query user subscription: ${findErr.message}`);
        }

        if (userSub?.user_id) {
          // Retrieve full price details to access nickname and product name
          const priceDetails = await getStripe().prices.retrieve(
            subscription.items.data[0]?.price?.id,
            { expand: ['product'] }
          );
          const priceNickname = priceDetails.nickname || '';
          const productName = (priceDetails.product as any)?.name || '';
          const rawPlanId = priceDetails.metadata?.plan_id || '';

          let planId: string;
          if (rawPlanId && ['starter', 'pro', 'premium', 'enterprise'].includes(rawPlanId)) {
            planId = rawPlanId;
          } else {
            const searchStr = (rawPlanId + ' ' + priceNickname + ' ' + productName).toLowerCase();
            if (searchStr.includes('premium')) planId = 'premium';
            else if (searchStr.includes('enterprise')) planId = 'enterprise';
            else if (searchStr.includes('pro')) planId = 'pro';
            else planId = 'starter';
          }
          console.log(`[Webhook] Resolved plan_id: "${planId}" (metadata: "${rawPlanId}", nickname: "${priceNickname}", product: "${productName}")`);

          let status = subscription.status;
          const allowedStatuses = ['active', 'canceled', 'past_due', 'trialing'];
          if (!allowedStatuses.includes(status)) {
            if (status === 'incomplete' || status === 'unpaid' || status === 'incomplete_expired' || status === 'paused') {
              status = 'past_due';
            } else {
              status = 'active';
            }
          }

          console.log(`[Webhook] Updating subscription record in Supabase for user_id: ${userSub.user_id}`);
          const updatePayload: any = {
            plan_id: subscription.status === 'active' ? planId : 'starter',
            status: status,
          };

          if (subscription.current_period_start) {
            updatePayload.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
          }
          if (subscription.current_period_end) {
            updatePayload.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
          }

          const { error: updateErr } = await sb.from('user_subscriptions').update(updatePayload).eq('user_id', userSub.user_id);

          if (updateErr) {
            throw new Error(`Database update failed: ${updateErr.message}`);
          }
          console.log('[Webhook] Database update completed successfully.');
        } else {
          console.log(`[Webhook] No user found matching customer ID: ${customerId}`);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook Error] Error processing webhook event:', err.message || err);
    res.status(500).json({ error: err.message || 'Failed to process webhook event' });
  }
});

export default router;
