function unavailableClient() {
  throw new Error("Neon admin client is unavailable in the x402 local smoke fixture.");
}

exports.createAdminClient = unavailableClient;
exports.createDataClient = unavailableClient;
exports.createPublicClient = unavailableClient;
exports.createServerNeonClient = unavailableClient;
exports.createUserDataClient = unavailableClient;
exports.getNeonAuth = unavailableClient;
exports.hasServiceRoleKey = () => false;
