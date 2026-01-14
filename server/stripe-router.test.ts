import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

vi.mock('./db', () => ({
  getStoreById: vi.fn(),
}));

vi.mock('./stripe', () => ({
  createCheckoutSession: vi.fn(),
  getSmsBalance: vi.fn(),
  getSmsTransactions: vi.fn(),
  CHARGE_PLANS: [],
  SMS_COST_PER_MESSAGE: 20,
}));

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    loginMethod: 'manus',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext['res'],
  };
}

describe('Stripe Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a checkout session for custom amount', async () => {
    const { getStoreById } = await import('./db');
    const { createCheckoutSession } = await import('./stripe');

    (getStoreById as any).mockResolvedValue({
      id: 1,
      ownerId: 1,
      name: 'Test Store',
    });

    (createCheckoutSession as any).mockResolvedValue({
      sessionId: 'sess_123',
      url: 'https://example.com/checkout',
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stripe.createCheckoutSession({ storeId: 1, amount: 500 });

    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        storeName: 'Test Store',
        amount: 500,
      })
    );
    expect(result).toEqual({ sessionId: 'sess_123', url: 'https://example.com/checkout' });
  });

  it('rejects amounts below minimum', async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stripe.createCheckoutSession({ storeId: 1, amount: 400 }))
      .rejects.toThrow('Too small: expected number to be >=500');
  });
});
