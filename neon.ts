import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  dataApi: true,
  branch: (branch) => branch.exists
    ? {}
    : branch.isDefault
      ? { protected: true }
      : {
          ttl: "7d",
          postgres: {
            computeSettings: {
              autoscalingLimitMinCu: 0.25,
              autoscalingLimitMaxCu: 1,
              suspendTimeout: "5m",
            },
          },
        },
});
