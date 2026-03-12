import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as db from "./db";
import { registerOAuthRoutes } from "./_core/oauth";
import { sdk } from "./_core/sdk";

async function requestCallback(
  query: string,
  init?: RequestInit
): Promise<Response> {
  const app = express();
  registerOAuthRoutes(app);

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const { port } = server.address() as AddressInfo;
    return await fetch(`http://127.0.0.1:${port}/api/oauth/callback${query}`, {
      redirect: "manual",
      ...init,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("GET /api/oauth/callback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.VITE_APP_ID = "test-app-id";
    process.env.OAUTH_SERVER_URL = "https://oauth.example.com";
    process.env.JWT_SECRET = "test-jwt-secret";
  });

  afterEach(() => {
    delete process.env.VITE_APP_ID;
    delete process.env.OAUTH_SERVER_URL;
    delete process.env.JWT_SECRET;
  });

  it("returns 400 when code or state is missing", async () => {
    const response = await requestCallback("?code=test-code");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "code and state are required",
      code: "oauth_callback_invalid_request",
      stage: "callback",
    });
  });

  it("returns a staged 500 when JWT_SECRET is missing during session creation", async () => {
    delete process.env.JWT_SECRET;

    vi.spyOn(db, "upsertUser").mockResolvedValue();
    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      scope: "openid profile",
      idToken: "id-token",
    });
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "TviD2BtLwbAxQcvLDm9fCR",
      projectId: "test-app-id",
      name: "ken yama",
      email: "ken@example.com",
      loginMethod: "manus",
      platform: "manus",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestCallback("?code=test-code&state=dGVzdA==");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "OAuth callback failed",
      code: "auth_config_missing",
      stage: "create_session",
    });
  });

  it("returns a staged 500 when VITE_APP_ID is missing before token exchange", async () => {
    delete process.env.VITE_APP_ID;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestCallback("?code=test-code&state=dGVzdA==");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "OAuth callback failed",
      code: "auth_config_missing",
      stage: "exchange_token",
    });
  });

  it("returns a staged 500 when OAUTH_SERVER_URL is missing before token exchange", async () => {
    delete process.env.OAUTH_SERVER_URL;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestCallback("?code=test-code&state=dGVzdA==");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "OAuth callback failed",
      code: "auth_config_missing",
      stage: "exchange_token",
    });
  });

  it("returns 400 when OAuth user info does not include openId", async () => {
    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      scope: "openid profile",
      idToken: "id-token",
    });
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "" as never,
      projectId: "test-app-id",
      name: "ken yama",
      email: "ken@example.com",
      loginMethod: "manus",
      platform: "manus",
    });

    const response = await requestCallback("?code=test-code&state=dGVzdA==");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "openId missing from user info",
      code: "oauth_openid_missing",
      stage: "get_user_info",
    });
  });

  it("sets the session cookie and redirects on success", async () => {
    const upsertUserSpy = vi.spyOn(db, "upsertUser").mockResolvedValue();

    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      scope: "openid profile",
      idToken: "id-token",
    });
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "TviD2BtLwbAxQcvLDm9fCR",
      projectId: "test-app-id",
      name: "ken yama",
      email: "ken@example.com",
      loginMethod: "manus",
      platform: "manus",
    });
    vi.spyOn(sdk, "createSessionToken").mockResolvedValue("signed-session-token");

    const response = await requestCallback("?code=test-code&state=dGVzdA==");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("app_session_id=signed-session-token");
    expect(upsertUserSpy).toHaveBeenCalledWith({
      openId: "TviD2BtLwbAxQcvLDm9fCR",
      name: "ken yama",
      email: "ken@example.com",
      loginMethod: "manus",
      lastSignedIn: expect.any(Date),
    });
  });
});
