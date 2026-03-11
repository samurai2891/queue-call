import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";

export type RequestContext = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const headerValue = req.headers["x-request-id"];
  const requestId =
    typeof headerValue === "string" && headerValue.trim().length > 0
      ? headerValue.trim()
      : nanoid(12);

  res.setHeader("X-Request-Id", requestId);
  requestContext.run({ requestId }, () => next());
};

export const getRequestId = () => requestContext.getStore()?.requestId;
