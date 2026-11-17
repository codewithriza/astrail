import { parse as parseYaml } from "yaml";
import { createHash } from "crypto";
import { extractJsonRequestBodySchema } from "./openapiContent";
import { validateOpenApiSpec } from "./validators";
import type { McpEndpointFilters, McpOperationFilter, OpenApiEndpoint, SpecFormat } from "./types";

type JsonRecord = Record<string, unknown>;

const GOOGLE_DISCOVERY_PARAM_LOCATIONS = new Set(["path", "query", "header"]);
const HIDDEN_DISCOVERY_PARAMETERS = new Set(["key", "oauth_token", "access_token"]);

export function parseSpecText(text: string, format?: SpecFormat): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Spec response was empty.");

  if (format === "yaml") return parseYaml(trimmed) as unknown;
  if (format === "json") return JSON.parse(trimmed) as unknown;

  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as unknown;
  return parseYaml(trimmed) as unknown;
}

export function normalizeOpenApiSpec(value: unknown) {
  const spec = coerceToOpenApiSpec(value);
  const endpoints = normalizeEndpointMap(spec);
  return { spec, endpoints };
}

export function coerceToOpenApiSpec(value: unknown) {
  if (isGoogleDiscoveryDocument(value)) return validateOpenApiSpec(googleDiscoveryToOpenApi(value));
  if (isGraphqlIntrospectionDocument(value)) return validateOpenApiSpec(graphqlIntrospectionToOpenApi(value));
  return validateOpenApiSpec(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isGoogleDiscoveryDocument(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  if (typeof value.discoveryVersion === "string") return true;
  return typeof value.kind === "string" && value.kind.includes("discovery#restDescription");
}

function graphqlSchemaDocument(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const directSchema = value.__schema;
  if (isRecord(directSchema)) return directSchema;
  const data = value.data;
  if (isRecord(data) && isRecord(data.__schema)) return data.__schema;
  const introspection = value.introspection;
  if (isRecord(introspection)) return graphqlSchemaDocument(introspection);
  if (isRecord(value.schema) && Array.isArray(value.schema.types)) return value.schema;
  return null;
}

function isGraphqlIntrospectionDocument(value: unknown): value is JsonRecord {
  return Boolean(graphqlSchemaDocument(value));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function openApiPath(path: string) {
  const normalized = path.trim().replace(/^\/+/, "");
  return `/${normalized}`;
}

function schemaFromDiscovery(value: unknown, schemas: JsonRecord): unknown {
  if (!isRecord(value)) return { type: "string" };
  const ref = stringValue(value.$ref);
  if (ref) return { $ref: `#/components/schemas/${ref}` };

  const type = stringValue(value.type, "string");
  const schema: JsonRecord = { type };
  if (typeof value.description === "string") schema.description = value.description;
  if (typeof value.format === "string") schema.format = value.format;
  if (typeof value.pattern === "string") schema.pattern = value.pattern;
  if (typeof value.default !== "undefined") schema.default = value.default;
  if (typeof value.minimum === "number") schema.minimum = value.minimum;
  if (typeof value.maximum === "number") schema.maximum = value.maximum;
  if (Array.isArray(value.enum)) schema.enum = value.enum;
  if (Array.isArray(value.required)) schema.required = value.required;
  if (isRecord(value.additionalProperties)) schema.additionalProperties = schemaFromDiscovery(value.additionalProperties, schemas);
  if (type === "array") schema.items = schemaFromDiscovery(value.items, schemas);
  if (type === "object" && isRecord(value.properties)) {
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([name, property]) => [name, schemaFromDiscovery(property, schemas)])
    );
  }
  return schema;
}

function discoveryParameters(method: JsonRecord, schemas: JsonRecord, inheritedParameters: JsonRecord) {
  const parameters = { ...inheritedParameters, ...(isRecord(method.parameters) ? method.parameters : {}) };
  const converted: JsonRecord[] = [];
  for (const [name, parameter] of Object.entries(parameters)) {
    if (HIDDEN_DISCOVERY_PARAMETERS.has(name)) continue;
    const record = isRecord(parameter) ? parameter : {};
    const location = stringValue(record.location, "query");
    if (!GOOGLE_DISCOVERY_PARAM_LOCATIONS.has(location)) continue;
    converted.push({
      name,
      in: location,
      required: Boolean(record.required || location === "path"),
      description: typeof record.description === "string" ? record.description : undefined,
      schema: schemaFromDiscovery(record, schemas),
    });
  }
  return converted;
}

function discoveryRequestBody(method: JsonRecord, schemas: JsonRecord) {
  if (!isRecord(method.request)) return undefined;
  return {
    required: true,
    content: {
      "application/json": {
        schema: schemaFromDiscovery(method.request, schemas),
      },
    },
  };
}

function discoveryResponses(method: JsonRecord, schemas: JsonRecord) {
  const responseSchema = isRecord(method.response) ? schemaFromDiscovery(method.response, schemas) : { type: "object" };
  return {
    "200": {
      description: "Successful response",
      content: {
        "application/json": {
          schema: responseSchema,
        },
      },
    },
  };
}

function discoveryScopes(document: JsonRecord) {
  const auth = isRecord(document.auth) ? document.auth : {};
  const oauth2 = isRecord(auth.oauth2) ? auth.oauth2 : {};
  const scopes = isRecord(oauth2.scopes) ? oauth2.scopes : {};
  return Object.fromEntries(
    Object.entries(scopes).map(([scope, value]) => [
      scope,
      isRecord(value) && typeof value.description === "string" ? value.description : scope,
    ])
  );
}

function discoveryServerUrl(document: JsonRecord) {
  const baseUrl = stringValue(document.baseUrl);
  if (baseUrl) return baseUrl;

  const rootUrl = stringValue(document.rootUrl, "https://www.googleapis.com/");
  const servicePath = stringValue(document.servicePath);
  if (!servicePath) return rootUrl;
  return new URL(servicePath.replace(/^\/+/, ""), rootUrl).toString();
}

function addDiscoveryMethods(paths: JsonRecord, container: JsonRecord, schemas: JsonRecord, tags: string[], inheritedParameters: JsonRecord = {}) {
  const nextParameters = {
    ...inheritedParameters,
    ...(isRecord(container.parameters) ? container.parameters : {}),
  };
  const methods = isRecord(container.methods) ? container.methods : {};
  for (const [methodName, rawMethod] of Object.entries(methods)) {
    if (!isRecord(rawMethod)) continue;
    const httpMethod = stringValue(rawMethod.httpMethod, "GET").toLowerCase();
    if (!["get", "post", "put", "patch", "delete"].includes(httpMethod)) continue;
    const path = openApiPath(stringValue(rawMethod.path, methodName));
    const pathItem = isRecord(paths[path]) ? paths[path] as JsonRecord : {};
    pathItem[httpMethod] = {
      operationId: stringValue(rawMethod.id, methodName).replace(/[^a-zA-Z0-9_]+/g, "_"),
      summary: stringValue(rawMethod.description, stringValue(rawMethod.id, methodName)),
      description: stringValue(rawMethod.description),
      tags,
      parameters: discoveryParameters(rawMethod, schemas, nextParameters),
      requestBody: discoveryRequestBody(rawMethod, schemas),
      responses: discoveryResponses(rawMethod, schemas),
      security: [{ OAuth2: [] }, { ApiKeyAuth: [] }],
    };
    paths[path] = pathItem;
  }

  const resources = isRecord(container.resources) ? container.resources : {};
  for (const [resourceName, resource] of Object.entries(resources)) {
    if (!isRecord(resource)) continue;
    addDiscoveryMethods(paths, resource, schemas, [...tags, resourceName], nextParameters);
  }
}

function googleDiscoveryToOpenApi(document: JsonRecord) {
  const schemas = isRecord(document.schemas) ? document.schemas : {};
  const paths: JsonRecord = {};
  addDiscoveryMethods(paths, document, schemas, [stringValue(document.name, "google")]);
  const scopes = discoveryScopes(document);

  const components = {
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [name, schemaFromDiscovery(schema, schemas)])
    ),
    securitySchemes: {
      OAuth2: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenUrl: "https://oauth2.googleapis.com/token",
            scopes,
          },
        },
      },
      ApiKeyAuth: {
        type: "apiKey",
        in: "query",
        name: "key",
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: stringValue(document.title, stringValue(document.name, "Google Discovery API")),
      description: stringValue(document.description, "Converted from a Google Discovery document."),
      version: stringValue(document.version, "v1"),
    },
    servers: [{ url: discoveryServerUrl(document) }],
    paths,
    components,
    security: [{ OAuth2: [] }, { ApiKeyAuth: [] }],
    "x-astrail-source-format": "google-discovery",
  };
}

function graphqlEndpointUrl(document: JsonRecord) {
  return stringValue(document.endpoint)
    || stringValue(document.endpointUrl)
    || stringValue(document.graphqlEndpoint)
    || stringValue(document.url);
}

function graphqlNamedType(type: unknown): JsonRecord | null {
  let current = isRecord(type) ? type : null;
  while (current && isRecord(current.ofType)) current = current.ofType;
  return current;
}

function graphqlTypeName(type: unknown): string {
  const record = isRecord(type) ? type : {};
  const kind = stringValue(record.kind);
  const name = stringValue(record.name);
  if (kind === "NON_NULL") return `${graphqlTypeName(record.ofType)}!`;
  if (kind === "LIST") return `[${graphqlTypeName(record.ofType)}]`;
  return name || "String";
}

function graphqlJsonSchema(type: unknown): JsonRecord {
  const record = isRecord(type) ? type : {};
  if (record.kind === "NON_NULL") {
    return graphqlJsonSchema(record.ofType);
  }
  if (record.kind === "LIST") {
    return { type: "array", items: graphqlJsonSchema(record.ofType) };
  }

  const named = graphqlNamedType(type);
  const name = stringValue(named?.name);
  if (["Int"].includes(name)) return { type: "integer" };
  if (["Float"].includes(name)) return { type: "number" };
  if (["Boolean"].includes(name)) return { type: "boolean" };
  if (["ID", "String"].includes(name)) return { type: "string" };
  return { type: "object", additionalProperties: true, description: `${name || "GraphQL"} input.` };
}

function isGraphqlRequired(type: unknown): boolean {
  return isRecord(type) && type.kind === "NON_NULL";
}

function graphqlTypesByName(schema: JsonRecord) {
  const types = Array.isArray(schema.types) ? schema.types : [];
  return new Map(
    types
      .filter((type): type is JsonRecord => isRecord(type) && typeof type.name === "string")
      .map((type) => [String(type.name), type])
  );
}

function graphqlSelection(type: unknown, typesByName: Map<string, JsonRecord>, depth = 0): string {
  if (depth > 1) return "";
  const named = graphqlNamedType(type);
  const typeName = stringValue(named?.name);
  const objectType = typesByName.get(typeName);
  const fields = Array.isArray(objectType?.fields) ? objectType.fields.filter(isRecord) : [];
  const scalarFields = fields
    .filter((field) => {
      const fieldType = graphqlNamedType(field.type);
      return ["ID", "String", "Int", "Float", "Boolean"].includes(stringValue(fieldType?.name));
    })
    .map((field) => stringValue(field.name))
    .filter(Boolean)
    .slice(0, 8);
  if (scalarFields.length > 0) return ` { ${scalarFields.join(" ")} }`;
  return "";
}

function graphqlOperation(schema: JsonRecord, typeName: string | undefined, kind: "query" | "mutation") {
  if (!typeName) return [];
  const typesByName = graphqlTypesByName(schema);
  const rootType = typesByName.get(typeName);
  const fields = Array.isArray(rootType?.fields) ? rootType.fields.filter(isRecord) : [];

  return fields
    .filter((field) => {
      const name = stringValue(field.name);
      return name && !name.startsWith("__");
    })
    .map((field) => {
      const fieldName = stringValue(field.name);
      const args = Array.isArray(field.args) ? field.args.filter(isRecord) : [];
      const operationName = `${kind}_${fieldName}`.replace(/[^a-zA-Z0-9_]+/g, "_");
      const variableDefinitions = args.map((arg) => `$${stringValue(arg.name)}: ${graphqlTypeName(arg.type)}`);
      const argumentList = args.map((arg) => `${stringValue(arg.name)}: $${stringValue(arg.name)}`);
      const query = `${kind} ${operationName}${variableDefinitions.length ? `(${variableDefinitions.join(", ")})` : ""} { ${fieldName}${argumentList.length ? `(${argumentList.join(", ")})` : ""}${graphqlSelection(field.type, typesByName)} }`;
      const properties = Object.fromEntries(
        args.map((arg) => [
          stringValue(arg.name),
          {
            ...graphqlJsonSchema(arg.type),
            description: stringValue(arg.description, `${stringValue(arg.name)} variable.`),
          },
        ])
      );
      const required = args.map((arg) => stringValue(arg.name)).filter((name, index) => name && isGraphqlRequired(args[index].type));

      return {
        fieldName,
        operationName,
        kind,
        query,
        requestSchema: {
          type: "object",
          properties,
          ...(required.length > 0 ? { required } : {}),
          "x-astrail-graphql-query": query,
          "x-astrail-graphql-operation-name": operationName,
        },
        summary: stringValue(field.description, `${kind === "query" ? "Query" : "Run mutation"} ${fieldName}.`),
      };
    });
}

function graphqlIntrospectionToOpenApi(document: JsonRecord) {
  const schema = graphqlSchemaDocument(document);
  if (!schema) return document;
  const endpointUrl = graphqlEndpointUrl(document);
  const queryType = isRecord(schema.queryType) ? stringValue(schema.queryType.name) : undefined;
  const mutationType = isRecord(schema.mutationType) ? stringValue(schema.mutationType.name) : undefined;
  const operations = [
    ...graphqlOperation(schema, queryType, "query"),
    ...graphqlOperation(schema, mutationType, "mutation"),
  ];

  return {
    openapi: "3.0.3",
    info: {
      title: stringValue(document.title, "GraphQL API"),
      description: stringValue(document.description, "Converted from GraphQL introspection JSON."),
      version: stringValue(document.version, "1.0.0"),
    },
    ...(endpointUrl ? { servers: [{ url: endpointUrl }] } : {}),
    paths: Object.fromEntries(
      operations.map((operation) => [
        `/graphql/${operation.fieldName}`,
        {
          post: {
            operationId: operation.operationName,
            summary: operation.summary,
            description: operation.summary,
            tags: ["graphql", operation.kind],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: operation.requestSchema,
                },
              },
            },
            responses: {
              "200": {
                description: "GraphQL response",
                content: {
                  "application/json": {
                    schema: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
            "x-astrail-runtime-kind": "graphql",
          },
        },
      ])
    ),
    "x-astrail-source-format": "graphql-introspection",
  };
}

function endpointBaseUrl(spec: ReturnType<typeof validateOpenApiSpec>) {
  const record = spec as Record<string, unknown>;
  const servers = Array.isArray(record.servers) ? record.servers : [];
  const firstServer = servers[0];
  if (firstServer && typeof firstServer === "object" && "url" in firstServer && typeof firstServer.url === "string") {
    return firstServer.url;
  }

  const host = typeof record.host === "string" ? record.host : "";
  if (!host) return null;

  const schemes = Array.isArray(record.schemes) ? record.schemes.filter((scheme): scheme is string => typeof scheme === "string") : [];
  const scheme = schemes.includes("https") ? "https" : schemes[0] ?? "https";
  const basePath = typeof record.basePath === "string" ? record.basePath : "";
  return `${scheme}://${host}${basePath}`;
}

export function normalizeEndpointMap(spec: ReturnType<typeof validateOpenApiSpec>): OpenApiEndpoint[] {
  const paths = spec.paths ?? {};
  const baseUrl = endpointBaseUrl(spec);
  const specSecurity = (spec as Record<string, unknown>).security ?? null;
  const specRecord = spec as Record<string, unknown>;
  const components = specRecord.components && typeof specRecord.components === "object"
    ? specRecord.components as Record<string, unknown>
    : {};
  const componentSchemes = components.securitySchemes && typeof components.securitySchemes === "object"
    ? components.securitySchemes as Record<string, unknown>
    : {};
  const swaggerSchemes = specRecord.securityDefinitions && typeof specRecord.securityDefinitions === "object"
    ? specRecord.securityDefinitions as Record<string, unknown>
    : {};
  const allSecuritySchemes = { ...swaggerSchemes, ...componentSchemes };
  const resolvedSecurityScheme = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.$ref !== "string") return record;
    const prefix = "#/components/securitySchemes/";
    if (!record.$ref.startsWith(prefix)) return null;
    const referenceName = decodeURIComponent(record.$ref.slice(prefix.length)).replace(/~1/g, "/").replace(/~0/g, "~");
    const referenced = allSecuritySchemes[referenceName];
    return referenced && typeof referenced === "object" && !Array.isArray(referenced)
      ? referenced as Record<string, unknown>
      : null;
  };
  const oauthSecuritySchemes = Object.entries(allSecuritySchemes)
    .filter(([, value]) => {
      const type = resolvedSecurityScheme(value)?.type;
      return type === "oauth2" || type === "openIdConnect";
    })
    .map(([name]) => name);
  let resourceOrigin: string | null = null;
  try {
    resourceOrigin = baseUrl ? new URL(baseUrl).origin : null;
  } catch {
    resourceOrigin = null;
  }
  const oauthSecurityMetadata = Object.fromEntries(oauthSecuritySchemes.map((name) => {
    const scheme = resolvedSecurityScheme(allSecuritySchemes[name]) ?? {};
    const flows = scheme.flows && typeof scheme.flows === "object" && !Array.isArray(scheme.flows)
      ? scheme.flows as Record<string, unknown>
      : {};
    const authorizationCode = flows.authorizationCode && typeof flows.authorizationCode === "object" && !Array.isArray(flows.authorizationCode)
      ? flows.authorizationCode as Record<string, unknown>
      : null;
    const swaggerAccessCode = scheme.flow === "accessCode";
    const authorizationUrl = authorizationCode && typeof authorizationCode.authorizationUrl === "string"
      ? authorizationCode.authorizationUrl
      : swaggerAccessCode && typeof scheme.authorizationUrl === "string" ? scheme.authorizationUrl : null;
    const tokenUrl = authorizationCode && typeof authorizationCode.tokenUrl === "string"
      ? authorizationCode.tokenUrl
      : swaggerAccessCode && typeof scheme.tokenUrl === "string" ? scheme.tokenUrl : null;
    const revocationUrl = [
      scheme["x-astrail-revocation-url"],
      scheme["x-token-revocation-url"],
      scheme.revocationUrl,
    ].find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
    return [name, {
      authorization_url: typeof authorizationUrl === "string" ? authorizationUrl : null,
      token_url: typeof tokenUrl === "string" ? tokenUrl : null,
      revocation_url: revocationUrl,
      resource_origin: resourceOrigin,
    }];
  }));
  const oauthSecurityBindings = Object.fromEntries(oauthSecuritySchemes.map((name) => {
    const metadata = oauthSecurityMetadata[name];
    const binding = createHash("sha256").update([
      name,
      metadata?.authorization_url ?? "",
      metadata?.token_url ?? "",
      metadata?.resource_origin ?? "",
    ].join("\0")).digest("hex");
    return [name, binding];
  }));

  return Object.entries(paths).flatMap(([path, value]) => {
    if (!value || typeof value !== "object") return [];
    const methods = value as Record<string, unknown>;
    const pathParameters = Array.isArray(methods.parameters) ? methods.parameters : [];

    return Object.entries(methods)
      .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map(([method, operation]) => {
        const op = operation && typeof operation === "object"
          ? (operation as Record<string, unknown>)
          : {};
        const parameters = [...pathParameters, ...(Array.isArray(op.parameters) ? op.parameters : [])];
        const requestBody = op.requestBody ?? null;
        const responses = op.responses ?? null;
        const security = op.security ?? specSecurity;
        const referencedSecuritySchemes = Array.isArray(security)
          ? security.flatMap((requirement) => requirement && typeof requirement === "object" && !Array.isArray(requirement) ? Object.keys(requirement) : [])
          : security && typeof security === "object" && !Array.isArray(security) ? Object.keys(security) : [];

        return {
          method: method.toUpperCase(),
          path,
          base_url: baseUrl,
          operation_id: typeof op.operationId === "string" ? op.operationId : null,
          summary: typeof op.summary === "string" ? op.summary : null,
          description: typeof op.description === "string" ? op.description.slice(0, 500) : null,
          tags: Array.isArray(op.tags) ? op.tags.filter((tag): tag is string => typeof tag === "string") : [],
          parameters,
          path_params: parameters.filter((parameter) => parameterLocation(parameter) === "path"),
          query_params: parameters.filter((parameter) => parameterLocation(parameter) === "query"),
          request_body: requestBody,
          request_body_schema: extractJsonRequestBodySchema(requestBody),
          responses,
          response_hints: responseHints(responses),
          security,
          security_requirements: security,
          oauth_security_schemes: oauthSecuritySchemes,
          oauth_security_metadata: oauthSecurityMetadata,
          oauth_security_bindings: oauthSecurityBindings,
          security_scheme_metadata_complete: referencedSecuritySchemes.every((name) => Boolean(resolvedSecurityScheme(allSecuritySchemes[name]))),
          requires_auth: hasSecurityRequirement(security),
          enabled: op["x-astrail-enabled"] === false ? false : undefined,
          policy: ["allow", "approval", "block"].includes(String(op["x-astrail-policy"]))
            ? op["x-astrail-policy"] as "allow" | "approval" | "block"
            : undefined,
          resource: resourceName(path, op),
          operation_kind: operationKind(method),
          runtime_kind: op["x-astrail-runtime-kind"] === "graphql" ? "graphql" : "rest",
        };
      });
  });
}

function resourceName(path: string, operation: Record<string, unknown>) {
  const firstTag = Array.isArray(operation.tags)
    ? operation.tags.find((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : null;
  if (firstTag) return firstTag.trim();

  const pathSegment = path
    .split("/")
    .map((segment) => segment.trim())
    .find((segment) => segment && !segment.startsWith("{"));

  return pathSegment?.replace(/[-_]+/g, " ") ?? "default";
}

function operationKind(method: string): McpOperationFilter {
  const normalized = method.toUpperCase();
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") return "read";
  if (normalized === "DELETE") return "destructive";
  return "write";
}

function responseHints(responses: unknown) {
  if (!responses || typeof responses !== "object") return null;
  return Object.entries(responses as Record<string, unknown>)
    .slice(0, 5)
    .map(([status, response]) => {
      const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
      const content = record.content && typeof record.content === "object" ? record.content as Record<string, unknown> : {};
      return {
        status,
        description: typeof record.description === "string" ? record.description : null,
        content_types: Object.keys(content).slice(0, 5),
        schema_hint: responseSchemaHint(content),
      };
    });
}

function responseSchemaHint(content: Record<string, unknown>): { type: string; ref?: string; items?: unknown; properties?: string[] } | null {
  const jsonContent = content["application/json"] ?? content["application/problem+json"] ?? Object.values(content)[0];
  if (!jsonContent || typeof jsonContent !== "object") return null;
  const schema = (jsonContent as Record<string, unknown>).schema;
  if (!schema || typeof schema !== "object") return null;
  const record = schema as Record<string, unknown>;
  if (typeof record.$ref === "string") return { type: "ref", ref: record.$ref };
  if (record.type === "array") return { type: "array", items: responseSchemaHint({ item: { schema: record.items } }) };
  const properties = record.properties && typeof record.properties === "object"
    ? Object.keys(record.properties as Record<string, unknown>).slice(0, 8)
    : [];
  return {
    type: typeof record.type === "string" ? record.type : properties.length > 0 ? "object" : "unknown",
    properties,
  };
}

function parameterLocation(parameter: unknown) {
  if (!parameter || typeof parameter !== "object") return null;
  const location = (parameter as Record<string, unknown>).in;
  return typeof location === "string" ? location : null;
}

function hasSecurityRequirement(security: unknown) {
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

export function endpointGroups(endpoints: OpenApiEndpoint[]) {
  const counts = new Map<string, number>();

  for (const endpoint of endpoints) {
    const tags = endpoint.tags && endpoint.tags.length > 0 ? endpoint.tags : ["Untagged"];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [
    { name: "All", count: endpoints.length },
    ...Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count })),
  ];
}

export function endpointResources(endpoints: OpenApiEndpoint[]) {
  const counts = new Map<string, number>();

  for (const endpoint of endpoints) {
    const resource = endpoint.resource || "default";
    counts.set(resource, (counts.get(resource) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));
}

export function endpointOperations(endpoints: OpenApiEndpoint[]) {
  const counts = new Map<McpOperationFilter, number>([
    ["read", 0],
    ["write", 0],
    ["destructive", 0],
  ]);

  for (const endpoint of endpoints) {
    const kind = endpoint.operation_kind ?? operationKind(endpoint.method);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));
}

export function filterEndpointsByGroup(endpoints: OpenApiEndpoint[], selectedGroup?: string) {
  if (!selectedGroup || selectedGroup === "All") return endpoints;

  return endpoints.filter((endpoint) => {
    const tags = endpoint.tags && endpoint.tags.length > 0 ? endpoint.tags : ["Untagged"];
    return tags.includes(selectedGroup);
  });
}

function toLowerSet(values?: string[]) {
  return new Set((values ?? []).map((value) => value.toLowerCase().trim()).filter(Boolean));
}

function endpointMatchesTool(endpoint: OpenApiEndpoint, values: Set<string>) {
  if (values.size === 0) return true;
  return [endpoint.tool_name, endpoint.operation_id, `${endpoint.method} ${endpoint.path}`]
    .filter((value): value is string => Boolean(value))
    .some((value) => values.has(value.toLowerCase()));
}

function endpointMatchesTags(endpoint: OpenApiEndpoint, values: Set<string>) {
  if (values.size === 0) return true;
  const tags = endpoint.tags && endpoint.tags.length > 0 ? endpoint.tags : ["Untagged"];
  return tags.some((tag) => values.has(tag.toLowerCase()));
}

function endpointMatchesResources(endpoint: OpenApiEndpoint, values: Set<string>) {
  if (values.size === 0) return true;
  return values.has((endpoint.resource || "default").toLowerCase());
}

function endpointMatchesOperations(endpoint: OpenApiEndpoint, values?: McpOperationFilter[]) {
  if (!values || values.length === 0) return true;
  return values.includes(endpoint.operation_kind ?? operationKind(endpoint.method));
}

export function filterEndpointMap(endpoints: OpenApiEndpoint[], filters?: McpEndpointFilters) {
  if (!filters) return endpoints;

  const tools = toLowerSet(filters.tools);
  const noTools = toLowerSet(filters.noTools);
  const tags = toLowerSet(filters.tags);
  const noTags = toLowerSet(filters.noTags);
  const resources = toLowerSet(filters.resources);
  const noResources = toLowerSet(filters.noResources);

  return endpoints.filter((endpoint) => {
    if (!endpointMatchesTool(endpoint, tools)) return false;
    if (noTools.size > 0 && endpointMatchesTool(endpoint, noTools)) return false;
    if (!endpointMatchesTags(endpoint, tags)) return false;
    if (noTags.size > 0 && endpointMatchesTags(endpoint, noTags)) return false;
    if (!endpointMatchesResources(endpoint, resources)) return false;
    if (noResources.size > 0 && endpointMatchesResources(endpoint, noResources)) return false;
    if (!endpointMatchesOperations(endpoint, filters.operations)) return false;
    if (filters.noOperations && filters.noOperations.length > 0 && endpointMatchesOperations(endpoint, filters.noOperations)) return false;
    return true;
  });
}

export function limitEndpointMap(endpoints: OpenApiEndpoint[], limit: number) {
  return endpoints.slice(0, limit);
}

export function subsetSpecByEndpointMap(spec: ReturnType<typeof validateOpenApiSpec>, endpoints: OpenApiEndpoint[]) {
  const allowed = new Set(endpoints.map((endpoint) => `${endpoint.method.toLowerCase()} ${endpoint.path}`));
  const originalPaths = spec.paths ?? {};
  const paths: Record<string, Record<string, unknown>> = {};

  for (const [path, pathItem] of Object.entries(originalPaths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const nextPathItem: Record<string, unknown> = {};
    const pathParameters = (pathItem as Record<string, unknown>).parameters;
    if (Array.isArray(pathParameters)) {
      nextPathItem.parameters = pathParameters;
    }

    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (method === "parameters") continue;
      if (allowed.has(`${method.toLowerCase()} ${path}`)) {
        nextPathItem[method] = operation;
      }
    }

    if (Object.keys(nextPathItem).length > 0) {
      paths[path] = nextPathItem;
    }
  }

  return validateOpenApiSpec({
    ...spec,
    paths,
  });
}
