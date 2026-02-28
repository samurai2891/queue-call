import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Stripe Webhook Implementation", () => {
  const indexPath = resolve(__dirname, "_core/index.ts");
  const indexContent = readFileSync(indexPath, "utf-8");

  describe("Registration order", () => {
    it("should register Stripe webhook route BEFORE express.json()", () => {
      const webhookPos = indexContent.indexOf("app.post('/api/stripe/webhook'");
      const jsonPos = indexContent.indexOf("app.use(express.json(");
      expect(webhookPos).toBeGreaterThan(-1);
      expect(jsonPos).toBeGreaterThan(-1);
      expect(webhookPos).toBeLessThan(jsonPos);
    });

    it("should use express.raw() for webhook route", () => {
      expect(indexContent).toContain(
        "app.post('/api/stripe/webhook', express.raw({ type: 'application/json' })"
      );
    });
  });

  describe("Webhook handler", () => {
    it("should check for STRIPE_WEBHOOK_SECRET", () => {
      expect(indexContent).toContain("process.env.STRIPE_WEBHOOK_SECRET");
    });

    it("should return 500 if webhook secret is missing", () => {
      expect(indexContent).toContain("res.status(500).json({ error: 'Webhook secret not configured' })");
    });

    it("should read stripe-signature header", () => {
      expect(indexContent).toContain("req.headers['stripe-signature']");
    });

    it("should call constructWebhookEvent for signature verification", () => {
      expect(indexContent).toContain("constructWebhookEvent(req.body, signature, webhookSecret)");
    });

    it("should handle test events with evt_test_ prefix", () => {
      expect(indexContent).toContain("event.id.startsWith('evt_test_')");
    });

    it("should return { verified: true } for test events", () => {
      expect(indexContent).toContain("res.json({ verified: true })");
    });

    it("should handle checkout.session.completed event", () => {
      expect(indexContent).toContain("case 'checkout.session.completed':");
      expect(indexContent).toContain("handleCheckoutCompleted(event.data.object");
    });

    it("should return { received: true } on success", () => {
      expect(indexContent).toContain("res.json({ received: true })");
    });

    it("should return 400 on webhook error", () => {
      expect(indexContent).toContain("res.status(400).json({ error: `Webhook Error:");
    });
  });
});

describe("Stripe Module", () => {
  const stripePath = resolve(__dirname, "stripe.ts");
  const stripeContent = readFileSync(stripePath, "utf-8");

  it("should export constructWebhookEvent function", () => {
    expect(stripeContent).toContain("export function constructWebhookEvent");
  });

  it("should use stripe.webhooks.constructEvent for verification", () => {
    expect(stripeContent).toContain("stripe.webhooks.constructEvent(payload, signature, webhookSecret)");
  });

  it("should accept Buffer payload for raw body", () => {
    expect(stripeContent).toContain("payload: Buffer");
  });

  it("should export handleCheckoutCompleted function", () => {
    expect(stripeContent).toContain("export async function handleCheckoutCompleted");
  });
});
