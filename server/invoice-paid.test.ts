import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { handleInvoicePaid } from "./stripe";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import type Stripe from "stripe";

describe("handleInvoicePaid", () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();

  const mockDb = {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Chain: db.select().from().where().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    // Chain: db.update().set().where()
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    // Chain: db.insert().values()
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);

    (getDb as any).mockResolvedValue(mockDb);
  });

  function createMockInvoice(overrides: Partial<{
    id: string;
    amount_paid: number;
    metadata: Record<string, string>;
    parentMetadata: Record<string, string>;
    payments: any[];
  }> = {}): Stripe.Invoice {
    const {
      id = "in_test_123",
      amount_paid = 5000,
      metadata = {},
      parentMetadata = { store_id: "1" },
      payments = [{ payment: { payment_intent: "pi_test_abc", type: "payment_intent" } }],
    } = overrides;

    return {
      id,
      object: "invoice",
      amount_paid,
      metadata,
      parent: {
        subscription_details: {
          metadata: parentMetadata,
          subscription: "sub_test_123",
        },
        quote_details: null,
        type: "subscription_details",
      },
      payments: {
        data: payments,
        has_more: false,
        object: "list",
        url: "/v1/invoices/in_test_123/payments",
      },
    } as unknown as Stripe.Invoice;
  }

  it("should charge SMS balance when invoice.paid with valid store_id", async () => {
    const mockStore = { id: 1, name: "テスト店舗", smsBalance: 3000 };
    // First call: store lookup, Second call: duplicate check
    mockLimit
      .mockResolvedValueOnce([mockStore]) // store lookup
      .mockResolvedValueOnce([]); // no duplicate

    const invoice = createMockInvoice({ amount_paid: 5000 });
    await handleInvoicePaid(invoice);

    // Verify balance update
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ smsBalance: 8000 }); // 3000 + 5000

    // Verify transaction record
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        type: "charge",
        amount: 5000,
        balanceAfter: 8000,
        stripePaymentIntentId: "pi_test_abc",
      })
    );

    // Verify owner notification
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "サブスクリプション支払いが完了しました",
      })
    );
  });

  it("should skip when no store_id in metadata", async () => {
    const invoice = createMockInvoice({
      parentMetadata: {},
      metadata: {},
    });

    await handleInvoicePaid(invoice);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should skip when amount_paid is zero", async () => {
    const invoice = createMockInvoice({ amount_paid: 0 });

    await handleInvoicePaid(invoice);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should skip when amount_paid is negative", async () => {
    const invoice = createMockInvoice({ amount_paid: -100 });

    await handleInvoicePaid(invoice);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should skip when store not found", async () => {
    mockLimit.mockResolvedValueOnce([]); // store not found

    const invoice = createMockInvoice();
    await handleInvoicePaid(invoice);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should skip duplicate payment_intent", async () => {
    const mockStore = { id: 1, name: "テスト店舗", smsBalance: 3000 };
    mockLimit
      .mockResolvedValueOnce([mockStore]) // store found
      .mockResolvedValueOnce([{ id: 99 }]); // duplicate exists

    const invoice = createMockInvoice();
    await handleInvoicePaid(invoice);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should use invoice.metadata.store_id as fallback", async () => {
    const mockStore = { id: 2, name: "別の店舗", smsBalance: 1000 };
    mockLimit
      .mockResolvedValueOnce([mockStore])
      .mockResolvedValueOnce([]);

    const invoice = createMockInvoice({
      amount_paid: 3000,
      parentMetadata: {}, // no subscription metadata
      metadata: { store_id: "2" }, // fallback to invoice metadata
    });

    await handleInvoicePaid(invoice);

    expect(mockSet).toHaveBeenCalledWith({ smsBalance: 4000 }); // 1000 + 3000
  });

  it("should use invoice.id as fallback when no payment_intent", async () => {
    const mockStore = { id: 1, name: "テスト店舗", smsBalance: 2000 };
    mockLimit
      .mockResolvedValueOnce([mockStore])
      .mockResolvedValueOnce([]); // no duplicate (won't be checked since no paymentIntentId)

    const invoice = createMockInvoice({
      id: "in_fallback_123",
      amount_paid: 1000,
      payments: [], // no payments data
    });

    await handleInvoicePaid(invoice);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "in_fallback_123",
      })
    );
  });

  it("should throw when database is not available", async () => {
    (getDb as any).mockResolvedValue(null);

    const invoice = createMockInvoice();
    await expect(handleInvoicePaid(invoice)).rejects.toThrow("Database not available");
  });

  it("should handle payment_intent as expanded object", async () => {
    const mockStore = { id: 1, name: "テスト店舗", smsBalance: 5000 };
    // Reset and re-setup mock chain to ensure clean state
    mockLimit.mockReset();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit
      .mockResolvedValueOnce([mockStore]) // store lookup
      .mockResolvedValueOnce([]); // duplicate check

    const invoice = createMockInvoice({
      amount_paid: 10000,
      payments: [{
        payment: {
          payment_intent: { id: "pi_expanded_obj", object: "payment_intent" },
          type: "payment_intent",
        },
      }],
    });

    await handleInvoicePaid(invoice);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: "pi_expanded_obj",
        amount: 10000,
        balanceAfter: 15000,
      })
    );
  });
});

describe("Webhook handler - invoice.paid routing", () => {
  it("should have invoice.paid case in webhook switch statement", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");

    expect(indexContent).toContain("case 'invoice.paid':");
    expect(indexContent).toContain("handleInvoicePaid");
  });

  it("should import handleInvoicePaid in index.ts", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");

    expect(indexContent).toContain("handleInvoicePaid");
    expect(indexContent).toMatch(/import.*handleInvoicePaid.*from.*stripe/);
  });
});
