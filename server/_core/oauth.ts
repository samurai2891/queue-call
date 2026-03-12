import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { isMissingAuthConfigError } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type OAuthCallbackStage =
  | "callback"
  | "exchange_token"
  | "get_user_info"
  | "db_upsert"
  | "create_session";

function respondWithCallbackError(
  res: Response,
  options: {
    status: number;
    stage: OAuthCallbackStage;
    code: string;
    error: string;
  }
) {
  res.status(options.status).json({
    error: options.error,
    code: options.code,
    stage: options.stage,
  });
}

function handleCallbackFailure(
  res: Response,
  stage: Exclude<OAuthCallbackStage, "callback">,
  error: unknown
) {
  const code = isMissingAuthConfigError(error)
    ? error.code
    : "oauth_callback_failed";

  console.error(
    "[OAuth] Callback failed",
    {
      stage,
      code,
      missingKeys: isMissingAuthConfigError(error) ? error.missingKeys : undefined,
    },
    error
  );

  respondWithCallbackError(res, {
    status: 500,
    stage,
    code,
    error: "OAuth callback failed",
  });
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      respondWithCallbackError(res, {
        status: 400,
        stage: "callback",
        code: "oauth_callback_invalid_request",
        error: "code and state are required",
      });
      return;
    }

    let tokenResponse;
    try {
      tokenResponse = await sdk.exchangeCodeForToken(code, state);
    } catch (error) {
      handleCallbackFailure(res, "exchange_token", error);
      return;
    }

    let userInfo;
    try {
      userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
    } catch (error) {
      handleCallbackFailure(res, "get_user_info", error);
      return;
    }

    if (!userInfo.openId) {
      respondWithCallbackError(res, {
        status: 400,
        stage: "get_user_info",
        code: "oauth_openid_missing",
        error: "openId missing from user info",
      });
      return;
    }

    try {
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
    } catch (error) {
      handleCallbackFailure(res, "db_upsert", error);
      return;
    }

    let sessionToken: string;
    try {
      sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
    } catch (error) {
      handleCallbackFailure(res, "create_session", error);
      return;
    }

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.redirect(302, "/");
  });
}
