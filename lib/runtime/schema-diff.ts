import type { McpTool,OpenApiEndpoint } from "../types";

// Deterministic tool-schema diffing for spec re-imports. When a customer's
// API contract changes, the diff tells a human exactly what moved before the
// hosted server is updated: added/removed tools, argument-level changes, and
// whether any change is breaking for agents already calling the server.

export type ToolChange = {
  name: string;
  breaking: boolean;
  changes: string[];
};

export type ToolSchemaDiff = {
  added: string[];
  removed: string[];
  changed: ToolChange[];
  unchanged: number;
  breaking: boolean;
  summary: string;
  classification: "additive" | "compatible" | "conditionally_compatible" | "breaking";
  ambiguous_renames: Array<{ previous: string[]; next: string[]; identity: string }>;
  safe_to_auto_apply: boolean;
};

function stableIdentity(tool:McpTool){return `${tool.method?.toUpperCase()??""} ${tool.path??""}`.trim();}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function schemaProperties(tool: McpTool): Record<string, unknown> {
  const schema = tool.input_schema;
  if (!isRecord(schema)) return {};
  return isRecord(schema.properties) ? schema.properties : {};
}

function requiredArguments(tool: McpTool): Set<string> {
  const schema = tool.input_schema;
  if (!isRecord(schema) || !Array.isArray(schema.required)) return new Set();
  return new Set(schema.required.filter((item): item is string => typeof item === "string"));
}

function propertyType(value: unknown) {
  return isRecord(value) && typeof value.type === "string" ? value.type : null;
}

function diffTool(previous: McpTool, next: McpTool): ToolChange | null {
  const changes: string[] = [];
  let breaking = false;

  const previousMethod = previous.method?.toUpperCase() ?? null;
  const nextMethod = next.method?.toUpperCase() ?? null;
  if (previousMethod !== nextMethod) {
    changes.push(`HTTP method changed from ${previousMethod ?? "none"} to ${nextMethod ?? "none"}.`);
    breaking = true;
  }
  if ((previous.path ?? null) !== (next.path ?? null)) {
    changes.push(`Upstream path changed from ${previous.path ?? "none"} to ${next.path ?? "none"}.`);
    breaking = true;
  }
  if (previous.description !== next.description) {
    changes.push("Description changed.");
  }

  const previousProperties = schemaProperties(previous);
  const nextProperties = schemaProperties(next);
  const previousRequired = requiredArguments(previous);
  const nextRequired = requiredArguments(next);

  for (const name of Object.keys(previousProperties)) {
    if (!(name in nextProperties)) {
      changes.push(`Argument "${name}" was removed.`);
      breaking = true;
    }
  }
  for (const name of Object.keys(nextProperties)) {
    if (!(name in previousProperties)) {
      const requiredNote = nextRequired.has(name) ? " (required — breaking for existing callers)" : "";
      changes.push(`Argument "${name}" was added${requiredNote}.`);
      if (nextRequired.has(name)) breaking = true;
      continue;
    }
    const previousType = propertyType(previousProperties[name]);
    const nextType = propertyType(nextProperties[name]);
    if (previousType !== nextType) {
      changes.push(`Argument "${name}" type changed from ${previousType ?? "unspecified"} to ${nextType ?? "unspecified"}.`);
      breaking = true;
    }
    if (!previousRequired.has(name) && nextRequired.has(name)) {
      changes.push(`Argument "${name}" became required.`);
      breaking = true;
    }
    if (previousRequired.has(name) && !nextRequired.has(name)) {
      changes.push(`Argument "${name}" became optional.`);
    }
  }

  if (changes.length === 0) return null;
  return { name: next.name, breaking, changes };
}

export function diffToolSchemas(previous: McpTool[], next: McpTool[]): ToolSchemaDiff {
  const previousByName = new Map(previous.map((tool) => [tool.name, tool]));
  const nextByName = new Map(next.map((tool) => [tool.name, tool]));

  const added = next.filter((tool) => !previousByName.has(tool.name)).map((tool) => tool.name);
  const removed = previous.filter((tool) => !nextByName.has(tool.name)).map((tool) => tool.name);
  const changed: ToolChange[] = [];
  let unchanged = 0;

  for (const [name, previousTool] of Array.from(previousByName.entries())) {
    const nextTool = nextByName.get(name);
    if (!nextTool) continue;
    const change = diffTool(previousTool, nextTool);
    if (change) changed.push(change);
    else unchanged += 1;
  }

  const removedTools=previous.filter((tool)=>!nextByName.has(tool.name));const addedTools=next.filter((tool)=>!previousByName.has(tool.name));
  const identities=new Set([...removedTools,...addedTools].map(stableIdentity).filter(Boolean));
  const ambiguous_renames=Array.from(identities).flatMap((identity)=>{const before=removedTools.filter((tool)=>stableIdentity(tool)===identity).map((tool)=>tool.name);const after=addedTools.filter((tool)=>stableIdentity(tool)===identity).map((tool)=>tool.name);return before.length&&after.length&&(before.length>1||after.length>1)?[{previous:before,next:after,identity}]:[];});
  const breaking = removed.length > 0 || changed.some((change) => change.breaking);
  const onlyAdditions=removed.length===0&&changed.length===0&&added.length>0;
  const classification=breaking?"breaking":ambiguous_renames.length?"conditionally_compatible":onlyAdditions?"additive":"compatible";
  const parts = [
    added.length > 0 ? `${added.length} tool${added.length === 1 ? "" : "s"} added` : null,
    removed.length > 0 ? `${removed.length} removed` : null,
    changed.length > 0 ? `${changed.length} changed` : null,
    `${unchanged} unchanged`,
  ].filter(Boolean);

  return {
    added,
    removed,
    changed,
    unchanged,
    breaking,
    classification,
    ambiguous_renames,
    safe_to_auto_apply: classification==="additive",
    summary: `${parts.join(", ")}. ${breaking ? "Contains breaking changes: existing agent integrations may need updates." : "No breaking changes detected."}`,
  };
}

// Preserve owner-configured tool settings (policies, visibility, metadata)
// across a re-import so regenerating from an updated spec never silently
// resets approval requirements on tools that still exist.
export function carryOverToolConfiguration(previous: McpTool[], next: McpTool[]): McpTool[] {
  const previousByName = new Map(previous.map((tool) => [tool.name, tool]));
  const previousByIdentity=new Map<string,McpTool[]>();for(const tool of previous){const key=stableIdentity(tool);if(key)previousByIdentity.set(key,[...(previousByIdentity.get(key)??[]),tool]);}
  return next.map((tool) => {
    const matches=previousByIdentity.get(stableIdentity(tool))??[];const prior = previousByName.get(tool.name)??(matches.length===1?matches[0]:undefined);
    if (!prior) return tool;
    return {
      ...tool,
      ...(prior.policy ? { policy: prior.policy } : {}),
      ...(prior.visibility ? { visibility: prior.visibility } : {}),
      ...(prior.metadata ? { metadata: { ...prior.metadata, ...(tool.metadata ?? {}) } } : {}),
    };
  });
}

function endpointScopes(endpoint:OpenApiEndpoint){return Array.from(new Set((Array.isArray(endpoint.security_requirements)?endpoint.security_requirements:[]).flatMap((requirement)=>requirement&&typeof requirement==="object"?Object.values(requirement as Record<string,unknown>).flatMap((value)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[]):[]))).sort();}
export function reconciliationPreview(previous:McpTool[],next:McpTool[],fieldMappings:unknown,previousEndpoints:OpenApiEndpoint[]=[],nextEndpoints:OpenApiEndpoint[]=[]){const diff=diffToolSchemas(previous,next);const carried=carryOverToolConfiguration(previous,next);const previousByOperation=new Map(previousEndpoints.map((endpoint)=>[endpoint.operation_id??`${endpoint.method} ${endpoint.path}`,endpoint]));const scopeChanges=nextEndpoints.flatMap((endpoint)=>{const identity=endpoint.operation_id??`${endpoint.method} ${endpoint.path}`;const prior=previousByOperation.get(identity);if(!prior)return[];const before=endpointScopes(prior),after=endpointScopes(endpoint);return JSON.stringify(before)===JSON.stringify(after)?[]:[{operation_id:identity,before,after}];});return {diff,generated_tools:{before:previous.length,after:next.length,added:diff.added,removed:diff.removed},permissions:carried.map((tool)=>({tool:tool.name,policy:tool.policy??"allow",visibility:tool.visibility??"private"})),mappings:{preserved:fieldMappings??null,requires_review:diff.removed.length>0||diff.ambiguous_renames.length>0},scopes:{changes:scopeChanges,requires_review:scopeChanges.length>0},approval_required:!diff.safe_to_auto_apply||scopeChanges.length>0};}
export function suggestMappingsFromDiff(diff:ToolSchemaDiff){const suggestions:Array<{tool:string;source_path:string;target_path:string;reason:string;requires_confirmation:true}>=[];for(const change of diff.changed){const removed=change.changes.flatMap((text)=>text.match(/^Argument "([^"]+)" was removed/)?.[1]??[]);const added=change.changes.flatMap((text)=>text.match(/^Argument "([^"]+)" was added/)?.[1]??[]);for(const source of removed){const normalized=source.replace(/[_-]/g,"").toLowerCase();const target=added.find((item)=>item.replace(/[_-]/g,"").toLowerCase()===normalized);if(target)suggestions.push({tool:change.name,source_path:source,target_path:target,reason:"Field spelling changed while normalized identity stayed stable.",requires_confirmation:true});}}return suggestions.slice(0,50);}
