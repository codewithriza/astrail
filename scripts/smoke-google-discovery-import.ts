import { previewSpec, runGenerationPipeline } from "../lib/generation-pipeline";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const discoveryDocument = {
  discoveryVersion: "v1",
  kind: "discovery#restDescription",
  id: "example:v1",
  name: "example",
  version: "v1",
  title: "Example Google API",
  description: "A tiny Google Discovery fixture for Astrail import smoke tests.",
  rootUrl: "https://www.googleapis.com/",
  servicePath: "example/v1/",
  auth: {
    oauth2: {
      scopes: {
        "https://www.googleapis.com/auth/example.readonly": {
          description: "Read example resources.",
        },
      },
    },
  },
  parameters: {
    fields: {
      type: "string",
      location: "query",
      description: "Selector specifying which fields to include in a partial response.",
    },
    key: {
      type: "string",
      location: "query",
      description: "API key. This must be treated as managed auth, not an agent argument.",
    },
  },
  resources: {
    files: {
      methods: {
        list: {
          id: "example.files.list",
          path: "files",
          httpMethod: "GET",
          description: "List files.",
          parameters: {
            pageSize: {
              type: "integer",
              format: "int32",
              location: "query",
              description: "Maximum number of files to return.",
            },
          },
          response: { $ref: "FileList" },
        },
        get: {
          id: "example.files.get",
          path: "files/{fileId}",
          httpMethod: "GET",
          description: "Get a file.",
          parameters: {
            fileId: {
              type: "string",
              location: "path",
              required: true,
              description: "File identifier.",
            },
          },
          response: { $ref: "File" },
        },
      },
    },
  },
  schemas: {
    File: {
      id: "File",
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
    },
    FileList: {
      id: "FileList",
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { $ref: "File" },
        },
      },
    },
  },
};

async function main() {
  const rawJson = JSON.stringify(discoveryDocument);
  const preview = await previewSpec({ sourceType: "json_paste", rawJson, generationMode: "dynamic" });
  assert(preview.endpoint_count === 2, `Expected 2 imported endpoints, got ${preview.endpoint_count}.`);
  assert(preview.groups.some((group) => group.name === "files"), "Expected files endpoint group.");

  const generated = await runGenerationPipeline({
    sourceType: "json_paste",
    rawJson,
    generationMode: "dynamic",
    clientPreset: "default",
  });

  assert(generated.endpointMap.length === 2, `Expected 2 generated endpoint maps, got ${generated.endpointMap.length}.`);
  const getFile = generated.endpointMap.find((endpoint) => endpoint.operation_id === "example_files_get");
  assert(getFile, "Expected get file operation.");
  assert(getFile?.base_url === "https://www.googleapis.com/example/v1/", `Unexpected base URL: ${getFile?.base_url}.`);
  assert(getFile?.path === "/files/{fileId}", `Unexpected path: ${getFile?.path}.`);

  const argumentText = JSON.stringify(getFile?.parameters ?? []);
  assert(argumentText.includes("fileId"), "Expected path parameter to be preserved.");
  assert(argumentText.includes("fields"), "Expected inherited common fields parameter.");
  assert(!argumentText.includes('"key"'), "Expected API-key parameter to stay out of agent arguments.");

  assert(generated.generated.tools.length >= 3, "Expected dynamic catalog tools to be generated.");
  console.log("PASS: Google Discovery imports into deterministic Astrail endpoint maps.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
