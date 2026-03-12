type AuthConfigScope = "oauth" | "session";

const readEnv = (key: string) => (process.env[key] ?? "").trim();

export class MissingAuthConfigError extends Error {
  readonly code = "auth_config_missing";

  constructor(
    readonly missingKeys: string[],
    readonly scope: AuthConfigScope
  ) {
    super(`Missing required ${scope} config: ${missingKeys.join(", ")}`);
    this.name = "MissingAuthConfigError";
  }
}

export function isMissingAuthConfigError(
  error: unknown
): error is MissingAuthConfigError {
  return error instanceof MissingAuthConfigError;
}

export function getOAuthConfig() {
  const appId = readEnv("VITE_APP_ID");
  const oAuthServerUrl = readEnv("OAUTH_SERVER_URL");
  const missingKeys = [
    appId.length === 0 ? "VITE_APP_ID" : null,
    oAuthServerUrl.length === 0 ? "OAUTH_SERVER_URL" : null,
  ].filter((value): value is string => value !== null);

  if (missingKeys.length > 0) {
    throw new MissingAuthConfigError(missingKeys, "oauth");
  }

  return {
    appId,
    oAuthServerUrl,
  };
}

export function getSessionConfig() {
  const cookieSecret = readEnv("JWT_SECRET");
  if (cookieSecret.length === 0) {
    throw new MissingAuthConfigError(["JWT_SECRET"], "session");
  }

  return {
    cookieSecret,
  };
}

export const ENV = {
  get appId() {
    return readEnv("VITE_APP_ID");
  },
  get cookieSecret() {
    return readEnv("JWT_SECRET");
  },
  get databaseUrl() {
    return readEnv("DATABASE_URL");
  },
  get oAuthServerUrl() {
    return readEnv("OAUTH_SERVER_URL");
  },
  get ownerOpenId() {
    return readEnv("OWNER_OPEN_ID");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return readEnv("BUILT_IN_FORGE_API_URL");
  },
  get forgeApiKey() {
    return readEnv("BUILT_IN_FORGE_API_KEY");
  },
};
