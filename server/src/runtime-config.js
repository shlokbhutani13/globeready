export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export function assertDemoModeValue(env = process.env) {
  const value = env.DEMO_MODE;
  if (value !== undefined && value !== "" && value !== "true" && value !== "false") {
    throw new ConfigError("DEMO_MODE must be exactly 'true' or 'false' when set.");
  }
}

export function isDemoMode(env = process.env) {
  return env.DEMO_MODE === "true";
}
