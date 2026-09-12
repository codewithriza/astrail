import { z } from "zod";
import type { GeneratedMcpServer, McpTool } from "@/lib/types";

export const OpenApiSpecSchema = z
  .object({
    openapi: z.string().optional(),
    swagger: z.string().optional(),
    info: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
      })
      .passthrough()
      .optional(),
    paths: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .refine((spec) => Boolean(spec.openapi || spec.swagger), {
    message: "Spec must include an openapi or swagger version field.",
  })
  .refine((spec) => Boolean(spec.paths && Object.keys(spec.paths).length > 0), {
    message: "Spec must include at least one path.",
  });

export const McpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  input_schema: z.record(z.string(), z.unknown()).optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  x_astrail: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const GeneratedMcpSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(McpToolSchema),
  generated_code: z.string().min(100),
});

export type OpenApiSpec = z.infer<typeof OpenApiSpecSchema>;

function snakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeTool(tool: McpTool): McpTool {
  return {
    ...tool,
    name: snakeCase(tool.name).slice(0, 64),
    input_schema: tool.input_schema ?? { type: "object", properties: {} },
  };
}

export function validateOpenApiSpec(value: unknown): OpenApiSpec {
  return OpenApiSpecSchema.parse(value);
}

export function looksLikeOpenApiSpec(value: unknown): value is OpenApiSpec {
  return OpenApiSpecSchema.safeParse(value).success;
}

export function validateGeneratedMcp(value: unknown): GeneratedMcpServer {
  const parsed = GeneratedMcpSchema.parse(value);
  return {
    name: parsed.name,
    description: parsed.description,
    tools: parsed.tools.map((tool) => normalizeTool(tool as McpTool)),
    generated_code: parsed.generated_code,
  };
}

export function generationValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }

  return error instanceof Error ? error.message : "Generated output failed validation.";
}
