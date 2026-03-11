import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { getRequestId } from "./requestContext";
import { isInternalAdminUser } from "./internalAdmin";
import { sdk } from "./sdk";

export type AuthenticatedUser = User & {
  isInternalAdmin: boolean;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthenticatedUser | null;
  requestId: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    const authenticatedUser = await sdk.authenticateRequest(opts.req);
    user = {
      ...authenticatedUser,
      isInternalAdmin: isInternalAdminUser(authenticatedUser),
    };
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const requestId = getRequestId() ?? nanoid(12);

  return {
    req: opts.req,
    res: opts.res,
    user,
    requestId,
  };
}
