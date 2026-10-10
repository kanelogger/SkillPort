if (process.env.npm_config_global === "true") {
  let formatError = (error) => error instanceof Error ? error.message : String(error);
  try {
    const [errors, { setupAgentIntegration }] = await Promise.all([
      import("../../dist/domain/errors.js"),
      import("../../dist/application/agent-integration.js")
    ]);
    formatError = errors.sanitizeError;
    const result = setupAgentIntegration();
    if (result.created) {
      const entries = result.integrations.map((item) => item.entryPath).join(", ");
      console.log(`Registered Skill Port Agent integrations at ${entries}`);
    }
  } catch (error) {
    console.warn(`Skill Port CLI installed, but Agent integrations were not registered: ${formatError(error)}`);
    console.warn("Run `sklp agent setup` after resolving the reported conflict.");
  }
}
