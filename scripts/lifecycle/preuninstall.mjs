if (process.env.npm_config_global === "true") {
  let formatError = (error) => error instanceof Error ? error.message : String(error);
  try {
    const [errors, { removeAgentIntegration }] = await Promise.all([
      import("../../dist/domain/errors.js"),
      import("../../dist/application/agent-integration.js")
    ]);
    formatError = errors.sanitizeError;
    removeAgentIntegration();
  } catch (error) {
    console.warn(`Skill Port Agent integration was preserved: ${formatError(error)}`);
  }
}
