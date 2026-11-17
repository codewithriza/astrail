export type ToolInputValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ToolInputValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: ToolInputValidationIssue[]; summary: string };

const MAX_ISSUES = 12;

function schemaRecord(schema: unknown) {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : {};
}

function propertyPath(parent: string, key: string) {
  return parent ? `${parent}.${key}` : key;
}

function issue(path: string, code: string, message: string): ToolInputValidationIssue {
  return { path: path || "$", code, message };
}

function schemaTypes(schema: Record<string, unknown>) {
  const type = schema.type;
  if (Array.isArray(type)) return type.filter((item): item is string => typeof item === "string");
  return typeof type === "string" ? [type] : [];
}

function schemaAllowsNull(schema: unknown) {
  const record = schemaRecord(schema);
  if (record.nullable === true) return true;
  return schemaTypes(record).includes("null");
}

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(value: unknown, allowedTypes: string[]) {
  if (allowedTypes.length === 0) return true;
  if (value === null) return allowedTypes.includes("null");
  if (Array.isArray(value)) return allowedTypes.includes("array");
  if (typeof value === "number") {
    return allowedTypes.includes("number") || Number.isInteger(value) && allowedTypes.includes("integer");
  }
  return allowedTypes.includes(typeof value);
}

function enumMatches(value: unknown, allowed: unknown[]) {
  return allowed.some((item) => Object.is(item, value));
}

function stringFormatIssue(format: string, value: string) {
  switch (format.toLowerCase()) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Expected a valid email address.";
    case "uuid":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? null
        : "Expected a valid UUID.";
    case "uri":
    case "url":
      try {
        new URL(value);
        return null;
      } catch {
        return "Expected a valid absolute URL.";
      }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
        ? null
        : "Expected a valid date in YYYY-MM-DD format.";
    case "date-time":
      return !Number.isNaN(Date.parse(value)) ? null : "Expected a valid date-time.";
    default:
      return null;
  }
}

function validateValue(schema: unknown, value: unknown, path: string, issues: ToolInputValidationIssue[]) {
  if (issues.length >= MAX_ISSUES) return;

  const record = schemaRecord(schema);
  if (Object.keys(record).length === 0) return;

  const anyOf = Array.isArray(record.anyOf) ? record.anyOf : Array.isArray(record.oneOf) ? record.oneOf : null;
  if (anyOf && anyOf.length > 0) {
    const matched = anyOf.some((candidate) => {
      const nested: ToolInputValidationIssue[] = [];
      validateValue(candidate, value, path, nested);
      return nested.length === 0;
    });
    if (!matched) {
      issues.push(issue(path, "schema_union_mismatch", "Value does not match any supported schema option."));
    }
    return;
  }

  if (Object.prototype.hasOwnProperty.call(record, "const") && !Object.is(value, record.const)) {
    issues.push(issue(path, "invalid_const", "Expected the schema-defined constant value."));
    return;
  }

  const allowedTypes = schemaTypes(record);
  if (!(value === null && schemaAllowsNull(record)) && !typeMatches(value, allowedTypes)) {
    issues.push(issue(path, "invalid_type", `Expected ${allowedTypes.join(" or ")}, received ${valueType(value)}.`));
    return;
  }

  if (Array.isArray(record.enum) && !enumMatches(value, record.enum)) {
    issues.push(issue(path, "invalid_enum", `Expected one of: ${record.enum.map(String).join(", ")}.`));
    return;
  }

  if (typeof value === "string") {
    const minLength = typeof record.minLength === "number" ? record.minLength : null;
    const maxLength = typeof record.maxLength === "number" ? record.maxLength : null;
    const format = typeof record.format === "string" ? record.format : null;
    if (minLength !== null && value.length < minLength) {
      issues.push(issue(path, "string_too_short", `Expected at least ${minLength} characters.`));
    }
    if (maxLength !== null && value.length > maxLength) {
      issues.push(issue(path, "string_too_long", `Expected at most ${maxLength} characters.`));
    }
    if (format) {
      const formatMessage = stringFormatIssue(format, value);
      if (formatMessage) {
        issues.push(issue(path, "invalid_string_format", formatMessage));
      }
    }
  }

  if (typeof value === "number") {
    const minimum = typeof record.minimum === "number" ? record.minimum : null;
    const maximum = typeof record.maximum === "number" ? record.maximum : null;
    const exclusiveMinimum = typeof record.exclusiveMinimum === "number" ? record.exclusiveMinimum : null;
    const exclusiveMaximum = typeof record.exclusiveMaximum === "number" ? record.exclusiveMaximum : null;
    const multipleOf = typeof record.multipleOf === "number" && record.multipleOf > 0 ? record.multipleOf : null;
    if (exclusiveMinimum !== null && value <= exclusiveMinimum) {
      issues.push(issue(path, "number_too_small", `Expected number > ${exclusiveMinimum}.`));
    } else if (minimum !== null && (record.exclusiveMinimum === true ? value <= minimum : value < minimum)) {
      issues.push(issue(path, "number_too_small", `Expected number ${record.exclusiveMinimum === true ? ">" : ">="} ${minimum}.`));
    }
    if (exclusiveMaximum !== null && value >= exclusiveMaximum) {
      issues.push(issue(path, "number_too_large", `Expected number < ${exclusiveMaximum}.`));
    } else if (maximum !== null && (record.exclusiveMaximum === true ? value >= maximum : value > maximum)) {
      issues.push(issue(path, "number_too_large", `Expected number ${record.exclusiveMaximum === true ? "<" : "<="} ${maximum}.`));
    }
    if (multipleOf !== null) {
      const quotient = value / multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * 100) {
        issues.push(issue(path, "number_not_multiple", `Expected a multiple of ${multipleOf}.`));
      }
    }
  }

  if (Array.isArray(value)) {
    const minItems = typeof record.minItems === "number" ? record.minItems : null;
    const maxItems = typeof record.maxItems === "number" ? record.maxItems : null;
    if (minItems !== null && value.length < minItems) {
      issues.push(issue(path, "array_too_short", `Expected at least ${minItems} items.`));
    }
    if (maxItems !== null && value.length > maxItems) {
      issues.push(issue(path, "array_too_long", `Expected at most ${maxItems} items.`));
    }
    if (record.items) {
      value.slice(0, 50).forEach((item, index) => validateValue(record.items, item, `${path}[${index}]`, issues));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    const properties = schemaRecord(record.properties);
    const additionalProperties = record.additionalProperties;
    const minProperties = typeof record.minProperties === "number" ? record.minProperties : null;
    const maxProperties = typeof record.maxProperties === "number" ? record.maxProperties : null;
    const required = Array.isArray(record.required)
      ? record.required.filter((item): item is string => typeof item === "string")
      : [];

    if (minProperties !== null && Object.keys(input).length < minProperties) {
      issues.push(issue(path, "object_too_small", `Expected at least ${minProperties} properties.`));
    }
    if (maxProperties !== null && Object.keys(input).length > maxProperties) {
      issues.push(issue(path, "object_too_large", `Expected at most ${maxProperties} properties.`));
    }

    for (const key of required) {
      const next = input[key];
      if (next === undefined || next === "" || next === null && !schemaAllowsNull(properties[key])) {
        issues.push(issue(propertyPath(path, key), "missing_required", `Missing required argument: ${key}.`));
        if (issues.length >= MAX_ISSUES) return;
      }
    }

    for (const [key, next] of Object.entries(input)) {
      if (properties[key]) {
        validateValue(properties[key], next, propertyPath(path, key), issues);
        if (issues.length >= MAX_ISSUES) return;
      } else if (record.additionalProperties === false) {
        issues.push(issue(propertyPath(path, key), "unknown_property", `Unknown argument: ${key}.`));
        if (issues.length >= MAX_ISSUES) return;
      } else if (additionalProperties && typeof additionalProperties === "object" && !Array.isArray(additionalProperties)) {
        validateValue(additionalProperties, next, propertyPath(path, key), issues);
        if (issues.length >= MAX_ISSUES) return;
      }
    }
  }
}

export function validateToolInput(schema: unknown, args: Record<string, unknown>): ToolInputValidationResult {
  const rootSchema = schema && typeof schema === "object"
    ? schema
    : { type: "object", properties: {} };
  const issues: ToolInputValidationIssue[] = [];

  validateValue(rootSchema, args, "", issues);

  if (issues.length === 0) return { ok: true, issues: [] };
  return {
    ok: false,
    issues,
    summary: issues.map((item) => `${item.path}: ${item.message}`).join(" "),
  };
}
