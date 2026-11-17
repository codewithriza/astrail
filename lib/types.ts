export type SourceType = "url" | "openapi_url" | "json_paste" | "graphql_url" | "graphql_sdl" | "mcp_url" | "preset" | "website" | "workflow";

export type ServerStatus = "live" | "error" | "pending" | "preset";

export type PipelineStatus = "passed" | "completed" | "failed" | "pending";

export type McpGenerationMode = "auto" | "static" | "dynamic" | "code";

export type McpClientPreset = "default" | "claude" | "claude-code" | "cursor" | "openai";

export type McpOperationFilter = "read" | "write" | "destructive";
export type McpToolPolicy = "allow" | "approval" | "block";
export type ExecutionPolicy = {
  max_attempts?: number;
  timeout_ms?: number;
  base_delay_ms?: number;
  retry_statuses?: number[];
  retry_writes?: boolean;
  idempotency_header?: string;
};

// Graduated action levels for agent permissioning: reading data, preparing
// drafts, mutating records, sending outward-facing messages, deleting data.
export type McpActionLevel = "read" | "draft" | "write" | "send" | "destructive";

export type McpEndpointFilters = {
  tools?: string[];
  noTools?: string[];
  resources?: string[];
  noResources?: string[];
  tags?: string[];
  noTags?: string[];
  operations?: McpOperationFilter[];
  noOperations?: McpOperationFilter[];
};

export type McpToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type AstrailToolProfile = {
  method?: string;
  path?: string;
  visibility?: "public" | "private";
  risk: "read" | "write" | "destructive";
  action_class?: McpActionLevel;
  requires_auth: boolean;
  auth_schemes: string[];
  required_scopes: string[];
  prerequisites: string[];
  agent_instructions: string[];
  business_context?: string;
  use_when?: string;
  avoid_when?: string;
  edge_case_notes?: string;
  action_level?: McpActionLevel;
  response_hints?: unknown;
  example_arguments: Record<string, unknown>;
  complexity?: {
    parameter_count: number;
    body_mode: "schema" | "compact_object";
    compressed: boolean;
  };
};

export type RuntimePermissionPattern = string | {
  pattern: string;
  regex?: boolean;
  match?: "sdk_method" | "endpoint_id" | "tool_name" | "operation_id" | "method_path" | "resource" | "tag" | "path" | "http_method";
  note?: string;
};

export type RuntimeRolePolicy = {
  max_action_level?: McpActionLevel;
  allowed_tools?: string[];
  blocked_tools?: string[];
  note?: string;
};

export type X402PaymentPolicy = {
  enabled?: boolean;
  allowed_networks?: string[];
  allowed_assets?: string[];
  max_amount_per_call?: string | null;
  daily_limit?: string | null;
  approval_threshold?: string | null;
  require_domain_verification?: true;
};

export type RuntimePermissionPolicy = {
  // Non-secret operating context appended to MCP initialization instructions.
  business_context?: string;
  argument_retention?: "none" | "keys_only" | "redacted";
  allow_http_gets?: boolean;
  allowed_methods?: RuntimePermissionPattern[];
  blocked_methods?: RuntimePermissionPattern[];
  allowed_resources?: RuntimePermissionPattern[];
  blocked_resources?: RuntimePermissionPattern[];
  allowed_actions?: McpActionLevel[];
  blocked_actions?: McpActionLevel[];
  read_only?: boolean;
  // Per-actor role scopes evaluated against the x-astrail-actor-role header.
  // "default" applies when the caller sends no role or an unknown role.
  roles?: Record<string, RuntimeRolePolicy>;
  // Non-custodial x402 policy. Astrail forwards caller-signed payment proofs;
  // it never stores wallet private keys or pays from a platform wallet.
  x402?: X402PaymentPolicy;
};

export type FieldMappingRule = {
  tool?: string;
  argument: string;
  upstream_name?: string;
  default?: unknown;
  value_map?: Record<string, unknown>;
  drop?: boolean;
  note?: string;
  source_path?: string;
  target_path?: string;
  coerce?: "string" | "number" | "integer" | "boolean" | "json";
  enum_map?: Record<string, unknown>;
  default_when?: { path: string; equals?: unknown; missing?: boolean };
  validations?: Array<{ kind: "required" | "type" | "min" | "max" | "pattern" | "enum"; value?: unknown; message?: string }>;
};

export type ResponseFieldRule = {
  tool?: string;
  field: string;
  rename?: string;
  drop?: boolean;
  note?: string;
  target_path?: string;
  coerce?: "string" | "number" | "integer" | "boolean" | "json";
  enum_map?: Record<string, unknown>;
};

export type ServerFieldMappings = {
  arguments?: FieldMappingRule[];
  response?: ResponseFieldRule[];
};

export type McpTool = {
  name: string;
  description: string;
  enabled?: boolean;
  input_schema?: Record<string, unknown>;
  method?: string;
  path?: string;
  annotations?: McpToolAnnotations;
  x_astrail?: AstrailToolProfile;
  metadata?: Record<string, unknown>;
  visibility?: "public" | "private";
  policy?: McpToolPolicy;
};

export type McpServer = {
  id: string;
  user_id: string;
  organization_id?: string | null;
  name: string;
  description: string | null;
  source_url: string | null;
  source_type: SourceType | string | null;
  category?: string | null;
  generated_code: string | null;
  tools_json: McpTool[] | null;
  endpoint_map?: OpenApiEndpoint[] | null;
  runtime_policy?: RuntimePermissionPolicy | null;
  field_mappings?: ServerFieldMappings | null;
  execution_policy?: ExecutionPolicy | null;
  schema_fingerprint?: string | null;
  schema_checked_at?: string | null;
  schema_drift_detected?: boolean | null;
  diagnostics?: GenerationDiagnostics | string[] | null;
  status?: ServerStatus | string | null;
  validation_status?: PipelineStatus | string | null;
  generation_status?: PipelineStatus | string | null;
  is_public: boolean;
  hosted_endpoint: string | null;
  call_count: number;
  generation_version?: number | string | null;
  protocol_version?: string | null;
  created_at: string;
};

export type RuntimeLog = {
  id: string;
  server_id: string | null;
  user_id: string | null;
  tool_name: string | null;
  status: string | null;
  method: string | null;
  path: string | null;
  execution_mode: string | null;
  upstream_status?: number | null;
  trace_id?: string | null;
  attempt_count?: number | null;
  error_code?: string | null;
  error: string | null;
  latency_ms: number | null;
  end_user_id?: string | null;
  actor_role?: string | null;
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_preview?: string | null;
  client_name?: string | null;
  credential_refs?: CredentialAuditRef[] | null;
  bundle_id?: string | null;
  arguments_redacted?: unknown;
  summary?: string | null;
  agent_id?: string | null;
  task_authorization_id?: string | null;
  purpose?: string | null;
  authorization_decision?: unknown;
  task_id?: string | null;
  affected_resources?: unknown[] | null;
  effective_scopes?: string[] | null;
  policy_result?: unknown;
  provider_result?: unknown;
  approval_id?: string | null;
  approval_actor_id?: string | null;
  approval_decision?: string | null;
  approval_decided_at?: string | null;
  approval_reason?: string | null;
  execution_claim_id?: string | null;
  evidence_sequence?: number | null;
  previous_event_hash?: string | null;
  event_hash?: string | null;
  storage_status?: string | null;
  created_at: string;
};

export type CredentialAuditRef = {
  id: string;
  name: string;
  provider: string | null;
  end_user_id: string | null;
  auth_scheme: string;
};

export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  key_preview: string;
  end_user_id?: string | null;
  actor_role?: string | null;
  agent_id?: string | null;
  agent_policy?: {
    allowed_tools?: string[];
    allowed_actions?: McpActionLevel[];
    allowed_resources?: string[];
    allowed_scopes?: string[];
  } | null;
  last_used: string | null;
  created_at: string;
};

export type DesignPartnerRequest = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string | null;
  agent_kind: string;
  needed_api: string;
  has_api_docs: "yes" | "no" | string;
  api_docs_url_or_notes: string | null;
  runtime_preference: "hosted" | "exported_code" | "self_hosted" | string;
  urgency: "today" | "this_week" | "exploring" | string;
  status: "new" | "contacted" | "onboarded" | "generated" | "success" | string;
  created_at: string;
};

export type GeneratedMcpServer = {
  name: string;
  description: string;
  tools: McpTool[];
  generated_code: string;
};

export type SpecFormat = "json" | "yaml";

export type SpecDiscoveryResult = {
  status: "found" | "not_found" | "error";
  input_url: string;
  discovered_url?: string;
  discovery_method?: string;
  content_type?: string;
  spec_raw?: string;
  spec_format?: SpecFormat;
  diagnostics: string[];
};

export type OpenApiEndpoint = {
  method: string;
  path: string;
  tool_name?: string | null;
  runtime_kind?: "rest" | "browser" | "graphql" | "mcp_proxy";
  browser_action?: "open_page" | "click" | "submit_form" | "follow_link";
  selector?: string | null;
  target_url?: string | null;
  base_url?: string | null;
  operation_id: string | null;
  summary: string | null;
  description: string | null;
  tags?: string[];
  parameters?: unknown[];
  path_params?: unknown[];
  query_params?: unknown[];
  static_headers?: Record<string, string>;
  request_body?: unknown;
  request_body_schema?: unknown;
  responses?: unknown;
  response_hints?: unknown;
  security?: unknown;
  security_requirements?: unknown;
  oauth_security_schemes?: string[];
  oauth_security_metadata?: Record<string, {
    authorization_url?: string | null;
    token_url?: string | null;
    revocation_url?: string | null;
    resource_origin?: string | null;
  }>;
  oauth_security_bindings?: Record<string, string>;
  security_scheme_metadata_complete?: boolean;
  requires_auth?: boolean;
  visibility?: "public" | "private";
  enabled?: boolean;
  resource?: string | null;
  operation_kind?: McpOperationFilter;
  action_class?: McpActionLevel;
  policy?: McpToolPolicy;
  input_schema?: Record<string, unknown>;
  docs_corpus?: Record<string, unknown>;
};

export type GenerationDiagnostics = {
  input_url: string | null;
  discovered_url: string | null;
  discovery_method: string | null;
  spec_size_bytes: number;
  endpoint_count: number;
  selected_group: string;
  tools_generated: number;
  hosted_endpoint: string | null;
  warnings: string[];
  errors: string[];
  timestamps: {
    started_at?: string;
    completed_at?: string;
    failed_at?: string;
  };
  trace: Array<{
    label: string;
    status: "passed" | "warning" | "failed" | "pending";
    detail?: string;
  }>;
  raw: string[];
};

export type SpecPreview = {
  source_url: string | null;
  spec_size_bytes: number;
  endpoint_count: number;
  endpoint_limit: number;
  groups: Array<{ name: string; count: number }>;
  resources?: Array<{ name: string; count: number }>;
  operations?: Array<{ name: McpOperationFilter; count: number }>;
  recommended_mode?: Exclude<McpGenerationMode, "auto">;
  client_presets?: McpClientPreset[];
  is_large: boolean;
  warning: string | null;
  diagnostics: string[];
};
