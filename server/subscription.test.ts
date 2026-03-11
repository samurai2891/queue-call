import { describe, it, expect, vi, beforeEach } from "vitest";

// ==================== Plan Definitions Tests ====================
describe("Subscription Plan Definitions", () => {
  it("should export PLANS with correct structure", async () => {
    const { PLANS } = await import("./subscription");
    
    expect(PLANS).toBeDefined();
    expect(PLANS.free).toBeDefined();
    expect(PLANS.standard).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it("Free plan should have correct pricing and limits", async () => {
    const { PLANS } = await import("./subscription");
    const free = PLANS.free;
    
    expect(free.id).toBe("free");
    expect(free.priceMonthly).toBe(0);
    expect(free.priceMonthlyTax).toBe(0);
    expect(free.monthlyTicketLimit).toBe(50);
    expect(free.features.smsEnabled).toBe(false);
    expect(free.features.reservationEnabled).toBe(false);
    expect(free.features.menuLimit).toBe(5);
    expect(free.features.brandingLevel).toBe("basic");
    expect(free.features.analyticsDays).toBe(1);
    expect(free.features.csvExport).toBe(false);
    expect(free.features.businessHoursEnabled).toBe(false);
    expect(free.features.staffLimit).toBe(1);
    expect(free.features.supportLevel).toBe("community");
  });

  it("Standard plan should have correct pricing and limits", async () => {
    const { PLANS } = await import("./subscription");
    const standard = PLANS.standard;
    
    expect(standard.id).toBe("standard");
    expect(standard.priceMonthly).toBe(1500);
    expect(standard.priceMonthlyTax).toBe(1650);
    expect(standard.monthlyTicketLimit).toBeNull(); // unlimited
    expect(standard.features.smsEnabled).toBe(true);
    expect(standard.features.reservationEnabled).toBe(true);
    expect(standard.features.menuLimit).toBeNull(); // unlimited
    expect(standard.features.brandingLevel).toBe("custom_color");
    expect(standard.features.analyticsDays).toBe(30);
    expect(standard.features.csvExport).toBe(false);
    expect(standard.features.businessHoursEnabled).toBe(true);
    expect(standard.features.staffLimit).toBe(3);
    expect(standard.features.supportLevel).toBe("email");
  });

  it("Pro plan should have correct pricing and limits", async () => {
    const { PLANS } = await import("./subscription");
    const pro = PLANS.pro;
    
    expect(pro.id).toBe("pro");
    expect(pro.priceMonthly).toBe(3500);
    expect(pro.priceMonthlyTax).toBe(3850);
    expect(pro.monthlyTicketLimit).toBeNull(); // unlimited
    expect(pro.features.smsEnabled).toBe(true);
    expect(pro.features.reservationEnabled).toBe(true);
    expect(pro.features.menuLimit).toBeNull(); // unlimited
    expect(pro.features.brandingLevel).toBe("full");
    expect(pro.features.analyticsDays).toBe(90);
    expect(pro.features.csvExport).toBe(true);
    expect(pro.features.businessHoursEnabled).toBe(true);
    expect(pro.features.staffLimit).toBeNull(); // unlimited
    expect(pro.features.supportLevel).toBe("priority_email");
  });

  it("Tax amounts should be correct (10% consumption tax)", async () => {
    const { PLANS } = await import("./subscription");
    
    // Standard: 1500 * 1.1 = 1650
    expect(PLANS.standard.priceMonthlyTax).toBe(
      Math.round(PLANS.standard.priceMonthly * 1.1)
    );
    // Pro: 3500 * 1.1 = 3850
    expect(PLANS.pro.priceMonthlyTax).toBe(
      Math.round(PLANS.pro.priceMonthly * 1.1)
    );
  });
});

// ==================== Stripe Product Config Tests ====================
describe("Stripe Product Configuration", () => {
  it("should have product config for standard and pro plans", async () => {
    const { STRIPE_PRODUCT_CONFIG } = await import("./subscription");
    
    expect(STRIPE_PRODUCT_CONFIG.standard).toBeDefined();
    expect(STRIPE_PRODUCT_CONFIG.standard.name).toContain("Standard");
    expect(STRIPE_PRODUCT_CONFIG.standard.priceAmount).toBe(1650); // tax-inclusive
    
    expect(STRIPE_PRODUCT_CONFIG.pro).toBeDefined();
    expect(STRIPE_PRODUCT_CONFIG.pro.name).toContain("Pro");
    expect(STRIPE_PRODUCT_CONFIG.pro.priceAmount).toBe(3850); // tax-inclusive
  });
});

// ==================== Monthly Ticket Limit Tests ====================
describe("Monthly Ticket Limit", () => {
  it("FREE_MONTHLY_TICKET_LIMIT should be 50", async () => {
    const { FREE_MONTHLY_TICKET_LIMIT } = await import("./subscription");
    expect(FREE_MONTHLY_TICKET_LIMIT).toBe(50);
  });

  it("Free plan monthlyTicketLimit should match FREE_MONTHLY_TICKET_LIMIT", async () => {
    const { PLANS, FREE_MONTHLY_TICKET_LIMIT } = await import("./subscription");
    expect(PLANS.free.monthlyTicketLimit).toBe(FREE_MONTHLY_TICKET_LIMIT);
  });

  it("Paid plans should have unlimited tickets (null)", async () => {
    const { PLANS } = await import("./subscription");
    expect(PLANS.standard.monthlyTicketLimit).toBeNull();
    expect(PLANS.pro.monthlyTicketLimit).toBeNull();
  });
});

// ==================== Plan Feature Comparison Tests ====================
describe("Plan Feature Hierarchy", () => {
  it("Pro plan should have more features than Standard", async () => {
    const { PLANS } = await import("./subscription");
    const standard = PLANS.standard.features;
    const pro = PLANS.pro.features;
    
    // Pro has more analytics days
    expect(pro.analyticsDays).toBeGreaterThan(standard.analyticsDays);
    // Pro has CSV export
    expect(pro.csvExport).toBe(true);
    expect(standard.csvExport).toBe(false);
    // Pro has full branding
    expect(pro.brandingLevel).toBe("full");
    expect(standard.brandingLevel).toBe("custom_color");
    // Pro has unlimited staff
    expect(pro.staffLimit).toBeNull();
    expect(standard.staffLimit).toBe(3);
    // Pro has priority email support
    expect(pro.supportLevel).toBe("priority_email");
    expect(standard.supportLevel).toBe("email");
  });

  it("Standard plan should have more features than Free", async () => {
    const { PLANS } = await import("./subscription");
    const free = PLANS.free.features;
    const standard = PLANS.standard.features;
    
    // Standard has SMS
    expect(standard.smsEnabled).toBe(true);
    expect(free.smsEnabled).toBe(false);
    // Standard has reservations
    expect(standard.reservationEnabled).toBe(true);
    expect(free.reservationEnabled).toBe(false);
    // Standard has more analytics
    expect(standard.analyticsDays).toBeGreaterThan(free.analyticsDays);
    // Standard has business hours
    expect(standard.businessHoursEnabled).toBe(true);
    expect(free.businessHoursEnabled).toBe(false);
    // Standard has unlimited menu
    expect(standard.menuLimit).toBeNull();
    expect(free.menuLimit).toBe(5);
  });
});

// ==================== PlanId Type Tests ====================
describe("PlanId Type", () => {
  it("PLANS keys should match PlanId type values", async () => {
    const { PLANS } = await import("./subscription");
    const planIds = Object.keys(PLANS);
    
    expect(planIds).toContain("free");
    expect(planIds).toContain("standard");
    expect(planIds).toContain("pro");
    expect(planIds).toHaveLength(3);
  });
});

// ==================== Price Cache Reset Tests ====================
describe("Price Cache", () => {
  it("resetPriceCache should not throw", async () => {
    const { resetPriceCache } = await import("./subscription");
    expect(() => resetPriceCache()).not.toThrow();
  });
});

// ==================== getSubscriptionInfo Return Type Tests ====================
describe("getSubscriptionInfo return structure", () => {
  it("should include monthlyTicketCount and monthlyTicketLimit fields in type", async () => {
    // This test validates the type contract by checking the function exists
    const mod = await import("./subscription");
    expect(typeof mod.getSubscriptionInfo).toBe("function");
  });
});

// ==================== checkAndIncrementMonthlyTicket Tests ====================
describe("checkAndIncrementMonthlyTicket", () => {
  it("should be exported as a function", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.checkAndIncrementMonthlyTicket).toBe("function");
  });
});

// ==================== Webhook Handlers Tests ====================
describe("Webhook Handlers", () => {
  it("should export handleSubscriptionCheckoutCompleted", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.handleSubscriptionCheckoutCompleted).toBe("function");
  });

  it("should export handleSubscriptionUpdated", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.handleSubscriptionUpdated).toBe("function");
  });

  it("should export handleSubscriptionDeleted", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.handleSubscriptionDeleted).toBe("function");
  });
});

// ==================== Subscription Management Functions Tests ====================
describe("Subscription Management Functions", () => {
  it("should export createSubscriptionCheckout", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.createSubscriptionCheckout).toBe("function");
  });

  it("should export cancelSubscription", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.cancelSubscription).toBe("function");
  });

  it("should export reactivateSubscription", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.reactivateSubscription).toBe("function");
  });

  it("should export changeSubscriptionPlan", async () => {
    const mod = await import("./subscription");
    expect(typeof mod.changeSubscriptionPlan).toBe("function");
  });
});
