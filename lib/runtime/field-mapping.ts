import type { FieldMappingRule, ResponseFieldRule, ServerFieldMappings } from "../types";

// Per-server field mapping reconciles a customer's quirky upstream schema
// (renamed CRM fields, tenant-specific enum labels, constant defaults) without
// regenerating tools or forking connector code. Rules are declarative data,
// applied deterministically — no eval, no templates.

const MAX_RULES = 100;
const MAX_VALUE_MAP_ENTRIES = 100;
const MAX_NAME_LENGTH = 256;
const MAX_RESPONSE_PATH_DEPTH = 8;
const UNSAFE_PROPERTY_NAMES = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizedName(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

function safePropertyName(value: unknown) {
  const name = normalizedName(value);
  return name && !UNSAFE_PROPERTY_NAMES.has(name) ? name : null;
}

function normalizeArgumentRule(value: unknown): FieldMappingRule | null {
  if (!isRecord(value)) return null;
  const argument = safePropertyName(value.argument) ?? safePath(value.argument) ?? safePath(value.source_path);
  if (!argument) return null;

  const rule: FieldMappingRule = { argument };
  const tool = normalizedName(value.tool);
  if (tool) rule.tool = tool;
  const upstreamName = safePropertyName(value.upstream_name);
  if (upstreamName) rule.upstream_name = upstreamName;
  if (value.drop === true) rule.drop = true;
  if ("default" in value && value.default !== undefined) rule.default = value.default;
  if (isRecord(value.value_map)) {
    const entries = Object.entries(value.value_map).slice(0, MAX_VALUE_MAP_ENTRIES);
    if (entries.length > 0) rule.value_map = Object.fromEntries(entries);
  }
  const note = normalizedName(value.note);
  if (note) rule.note = note;
  const sourcePath = safePath(value.source_path); if (sourcePath) rule.source_path = sourcePath;
  const targetPath = safePath(value.target_path)??safePath(value.upstream_name); if (targetPath) rule.target_path = targetPath;
  if (["string","number","integer","boolean","json"].includes(String(value.coerce))) rule.coerce = value.coerce as FieldMappingRule["coerce"];
  if (isRecord(value.enum_map)) rule.enum_map = Object.fromEntries(Object.entries(value.enum_map).slice(0,MAX_VALUE_MAP_ENTRIES));
  if (isRecord(value.default_when)) { const path=safePath(value.default_when.path); if(path) rule.default_when={path,...("equals" in value.default_when?{equals:value.default_when.equals}:{}),...(value.default_when.missing===true?{missing:true}:{})}; }
  if(Array.isArray(value.validations)) rule.validations=value.validations.slice(0,20).flatMap((item)=>{if(!isRecord(item)||!["required","type","min","max","pattern","enum"].includes(String(item.kind)))return [];return [{kind:item.kind as NonNullable<FieldMappingRule["validations"]>[number]["kind"],...(item.value!==undefined?{value:item.value}:{}),...(typeof item.message==="string"?{message:item.message.slice(0,300)}:{})}];});
  return rule;
}

function normalizeResponseRule(value: unknown): ResponseFieldRule | null {
  if (!isRecord(value)) return null;
  const field = normalizedName(value.field);
  if (!field) return null;
  const fieldSegments = field.split(".");
  if (fieldSegments.length > MAX_RESPONSE_PATH_DEPTH || fieldSegments.some((segment) => !safePropertyName(segment))) return null;

  const rule: ResponseFieldRule = { field };
  const tool = normalizedName(value.tool);
  if (tool) rule.tool = tool;
  const rename = safePropertyName(value.rename);
  if (rename && !rename.includes(".")) rule.rename = rename;
  if (value.drop === true) rule.drop = true;
  const note = normalizedName(value.note);
  if (note) rule.note = note;
  const targetPath=safePath(value.target_path);if(targetPath)rule.target_path=targetPath;
  if (["string","number","integer","boolean","json"].includes(String(value.coerce))) rule.coerce=value.coerce as ResponseFieldRule["coerce"];
  if(isRecord(value.enum_map))rule.enum_map=Object.fromEntries(Object.entries(value.enum_map).slice(0,MAX_VALUE_MAP_ENTRIES));
  return rule;
}

function safePath(value:unknown){const name=normalizedName(value);if(!name)return null;const segments=name.split(".");return segments.length<=MAX_RESPONSE_PATH_DEPTH&&segments.every((segment)=>safePropertyName(segment))?name:null;}
function getPath(root:Record<string,unknown>,path:string){let current:unknown=root;for(const part of path.split(".")){if(!isRecord(current)||!Object.prototype.hasOwnProperty.call(current,part))return undefined;current=current[part];}return current;}
function deletePath(root:Record<string,unknown>,path:string){const parts=path.split(".");let current:Record<string,unknown>=root;const parents:Array<[Record<string,unknown>,string]>=[];for(const part of parts.slice(0,-1)){if(!isRecord(current[part]))return;parents.push([current,part]);current=current[part] as Record<string,unknown>;}delete current[parts.at(-1)!];for(const [parent,key] of parents.reverse()){if(isRecord(parent[key])&&Object.keys(parent[key] as Record<string,unknown>).length===0)delete parent[key];else break;}}
function setPath(root:Record<string,unknown>,path:string,value:unknown){const parts=path.split(".");let current=root;for(const part of parts.slice(0,-1)){if(!isRecord(current[part]))current[part]={};current=current[part] as Record<string,unknown>;}current[parts.at(-1)!]=value;}
function coerce(value:unknown,type:FieldMappingRule["coerce"]){if(!type)return value;if(type==="string")return String(value);if(type==="number"||type==="integer"){const parsed=Number(value);if(!Number.isFinite(parsed))throw new Error(`Cannot coerce value to ${type}.`);return type==="integer"?Math.trunc(parsed):parsed;}if(type==="boolean"){if(value===true||value==="true"||value===1||value==="1")return true;if(value===false||value==="false"||value===0||value==="0")return false;throw new Error("Cannot coerce value to boolean.");}if(type==="json"&&typeof value==="string")return JSON.parse(value) as unknown;return value;}
export class FieldMappingValidationError extends Error { constructor(public readonly issues:string[]){super(issues.join(" "));this.name="FieldMappingValidationError";} }
function validate(rule:FieldMappingRule,value:unknown){const issues:string[]=[];for(const check of rule.validations??[]){let valid=true;if(check.kind==="required")valid=value!==undefined&&value!==null&&value!=="";if(check.kind==="type")valid=typeof value===check.value;if(check.kind==="min")valid=typeof value==="number"&&value>=Number(check.value);if(check.kind==="max")valid=typeof value==="number"&&value<=Number(check.value);if(check.kind==="pattern")valid=typeof value==="string"&&new RegExp(String(check.value).slice(0,200)).test(value);if(check.kind==="enum")valid=Array.isArray(check.value)&&check.value.includes(value);if(!valid)issues.push(check.message??`${rule.source_path??rule.argument} failed ${check.kind} validation.`);}if(issues.length)throw new FieldMappingValidationError(issues);}

export function normalizeFieldMappings(value: unknown): ServerFieldMappings | null {
  if (!isRecord(value)) return null;

  const argumentRules = (Array.isArray(value.arguments) ? value.arguments : [])
    .map(normalizeArgumentRule)
    .filter((rule): rule is FieldMappingRule => rule !== null)
    .slice(0, MAX_RULES);
  const responseRules = (Array.isArray(value.response) ? value.response : [])
    .map(normalizeResponseRule)
    .filter((rule): rule is ResponseFieldRule => rule !== null)
    .slice(0, MAX_RULES);

  if (argumentRules.length === 0 && responseRules.length === 0) return null;
  return {
    ...(argumentRules.length > 0 ? { arguments: argumentRules } : {}),
    ...(responseRules.length > 0 ? { response: responseRules } : {}),
  };
}

function ruleAppliesToTool(rule: { tool?: string }, toolName: string) {
  return !rule.tool || rule.tool === toolName;
}

function mappedValue(rule: FieldMappingRule, value: unknown) {
  if (rule.value_map && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
    const key = String(value);
    if (Object.prototype.hasOwnProperty.call(rule.value_map, key)) return rule.value_map[key];
  }
  return value;
}

export function applyArgumentMappings(
  mappings: ServerFieldMappings | null | undefined,
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const rules = (mappings?.arguments ?? []).filter((rule) => ruleAppliesToTool(rule, toolName));
  if (rules.length === 0) return args;

  const output: Record<string, unknown> = JSON.parse(JSON.stringify(args)) as Record<string,unknown>;
  for (const rule of rules) {
    const source=rule.source_path??rule.argument;const target=rule.target_path??rule.upstream_name??source;
    const present = getPath(output,source)!==undefined;
    if (rule.drop) {
      if (present) deletePath(output,source);
      continue;
    }

    let value = present ? getPath(output,source) : undefined;
    const condition=!rule.default_when||(rule.default_when.missing===true?getPath(output,rule.default_when.path)===undefined:getPath(output,rule.default_when.path)===rule.default_when.equals);
    if ((value === undefined || value === null || value === "") && "default" in rule && condition) {
      value = rule.default;
    }
    if (value === undefined) continue;

    value = mappedValue(rule, value);if(rule.enum_map&&Object.hasOwn(rule.enum_map,String(value)))value=rule.enum_map[String(value)];value=coerce(value,rule.coerce);validate(rule,value);
    if(target!==source)deletePath(output,source);setPath(output,target,value);
  }
  return output;
}

function applyResponseRuleAtPath(container: unknown, segments: string[], rule: ResponseFieldRule) {
  if (Array.isArray(container)) {
    for (const item of container) applyResponseRuleAtPath(item, segments, rule);
    return;
  }
  if (!isRecord(container)) return;

  const [head, ...rest] = segments;
  if (rest.length > 0) {
    if (Object.prototype.hasOwnProperty.call(container, head)) applyResponseRuleAtPath(container[head], rest, rule);
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(container, head)) return;
  if (rule.drop) {
    delete container[head];
    return;
  }
  if (rule.rename && rule.rename !== head) {
    container[rule.rename] = container[head];
    delete container[head];
  }
}

export function applyResponseMappings(
  mappings: ServerFieldMappings | null | undefined,
  toolName: string,
  body: unknown
): unknown {
  const rules = (mappings?.response ?? []).filter((rule) => ruleAppliesToTool(rule, toolName));
  if (rules.length === 0 || !body || typeof body !== "object") return body;

  const clone = JSON.parse(JSON.stringify(body)) as unknown;
  for (const rule of rules) {
    if(isRecord(clone)&&(rule.target_path||rule.coerce||rule.enum_map)){let value=getPath(clone,rule.field);if(value!==undefined){if(rule.enum_map&&Object.hasOwn(rule.enum_map,String(value)))value=rule.enum_map[String(value)];value=coerce(value,rule.coerce);const target=rule.target_path??rule.field;if(target!==rule.field)deletePath(clone,rule.field);setPath(clone,target,value);}if(rule.drop)deletePath(clone,rule.field);continue;}
    applyResponseRuleAtPath(clone, rule.field.split("."), rule);
  }
  return clone;
}

export function previewFieldMappings(mappings:unknown,toolName:string,input:Record<string,unknown>,response?:unknown){const normalized=normalizeFieldMappings(mappings);if(!normalized)throw new Error("At least one valid mapping rule is required.");return {normalized,input:applyArgumentMappings(normalized,toolName,input),...(response!==undefined?{response:applyResponseMappings(normalized,toolName,response)}:{})};}
export function suggestMappingsFromProviderErrors(errors:Array<{tool_name?:string|null;error?:string|null}>){const counts=new Map<string,{count:number;value:{tool?:string;argument:string;drop?:boolean;default?:unknown;reason:string;requires_confirmation:true}}>();for(const item of errors.slice(0,500)){const text=item.error??"";const unknown=text.match(/(?:unknown|unexpected|unrecognized) (?:field|parameter) ["']?([A-Za-z0-9_.-]+)/i)?.[1];const required=text.match(/(?:field|parameter) ["']?([A-Za-z0-9_.-]+)["']? (?:is )?required/i)?.[1];const argument=unknown??required;if(!argument||!safePath(argument))continue;const key=`${item.tool_name??""}:${argument}:${unknown?"drop":"default"}`;const value={...(item.tool_name?{tool:item.tool_name}:{}),argument,...(unknown?{drop:true}:{default:""}),reason:`Provider validation error repeated for ${argument}.`,requires_confirmation:true as const};counts.set(key,{count:(counts.get(key)?.count??0)+1,value});}return Array.from(counts.values()).filter((item)=>item.count>=2).map((item)=>({...item.value,occurrences:item.count})).slice(0,50);}

export function fieldMappingSummary(mappings: ServerFieldMappings | null | undefined) {
  if (!mappings) return null;
  return {
    argument_rules: mappings.arguments?.length ?? 0,
    response_rules: mappings.response?.length ?? 0,
    note: "Field mappings are applied deterministically before upstream execution (arguments) and before the agent sees the response (response).",
  };
}
