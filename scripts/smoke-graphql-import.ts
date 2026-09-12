import { createServer } from "node:http";
import { buildSchema, graphql } from "graphql";
import { runGenerationPipeline } from "../lib/generation-pipeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const idType = { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } };
const stringType = { kind: "SCALAR", name: "String" };
const userType = { kind: "OBJECT", name: "User" };

const introspection = {
  endpoint: "https://graphql.example.com/graphql",
  title: "Example GraphQL API",
  data: {
    __schema: {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        {
          kind: "OBJECT",
          name: "Query",
          fields: [
            {
              name: "user",
              description: "Fetch a user by ID.",
              args: [{ name: "id", type: idType, description: "User ID." }],
              type: userType,
            },
          ],
        },
        {
          kind: "OBJECT",
          name: "Mutation",
          fields: [
            {
              name: "renameUser",
              description: "Rename a user.",
              args: [
                { name: "id", type: idType, description: "User ID." },
                { name: "name", type: { kind: "NON_NULL", ofType: stringType }, description: "New name." },
              ],
              type: userType,
            },
          ],
        },
        {
          kind: "OBJECT",
          name: "User",
          fields: [
            { name: "id", args: [], type: { kind: "SCALAR", name: "ID" } },
            { name: "name", args: [], type: stringType },
          ],
        },
        { kind: "SCALAR", name: "ID" },
        { kind: "SCALAR", name: "String" },
      ],
    },
  },
};

async function main() {
  const generated = await runGenerationPipeline({
    sourceType: "json_paste",
    rawJson: JSON.stringify(introspection),
    generationMode: "dynamic",
    clientPreset: "default",
  });

  assert(generated.endpointMap.length === 2, `Expected 2 GraphQL endpoints, got ${generated.endpointMap.length}.`);
  const user = generated.endpointMap.find((endpoint) => endpoint.operation_id === "query_user");
  assert(user, "Expected query_user endpoint.");
  assert(user?.runtime_kind === "graphql", `Expected GraphQL runtime kind, got ${user?.runtime_kind}.`);
  assert(user?.base_url === "https://graphql.example.com/graphql", `Unexpected GraphQL endpoint URL: ${user?.base_url}.`);

  const schema = user?.input_schema ?? {};
  const text = JSON.stringify(schema);
  assert(text.includes('"id"'), "Expected ID variable in tool input schema.");
  assert(!text.includes("query Fetch"), "Expected generated tool input not to expose raw query editing.");

  const requestSchema = user?.request_body_schema as Record<string, unknown> | undefined;
  assert(typeof requestSchema?.["x-astrail-graphql-query"] === "string", "Expected fixed GraphQL query metadata.");
  assert(String(requestSchema?.["x-astrail-graphql-query"]).includes("query query_user"), "Expected generated query operation.");
  assert(String(requestSchema?.["x-astrail-graphql-query"]).includes("user(id: $id)"), "Expected generated field arguments.");

  const sdl = `
    type Query { user(id: ID!): User }
    type Mutation { renameUser(id: ID!, name: String!): User }
    type User { id: ID!, name: String! }
  `;
  const schemaForServer = buildSchema(sdl);
  const server = createServer(async (request, response) => {
    if (request.url === "/oversized") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: { oversized: "x".repeat(1_000_100) } }));
      return;
    }
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const payload = JSON.parse(body || "{}") as { query?: string };
    const result = await graphql({ schema: schemaForServer, source: payload.query ?? "" });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object", "Expected local GraphQL server address.");
  const liveEndpoint = `http://127.0.0.1:${address.port}/graphql`;
  process.env.ASTRAIL_ENABLE_LOCAL_GRAPHQL_FIXTURES = "1";

  try {
    const live = await runGenerationPipeline({
      sourceType: "graphql_url",
      sourceUrl: liveEndpoint,
      generationMode: "dynamic",
    });
    assert(live.endpointMap.length === 2, `Expected 2 live GraphQL endpoints, got ${live.endpointMap.length}.`);
    assert(live.endpointMap.every((endpoint) => endpoint.runtime_kind === "graphql" && endpoint.base_url === liveEndpoint), "Expected live GraphQL endpoint metadata.");

    const fromSdl = await runGenerationPipeline({
      sourceType: "graphql_sdl",
      sourceUrl: liveEndpoint,
      rawJson: sdl,
      generationMode: "dynamic",
    });
    assert(fromSdl.endpointMap.length === 2, `Expected 2 SDL GraphQL endpoints, got ${fromSdl.endpointMap.length}.`);
    assert(fromSdl.endpointMap.some((endpoint) => endpoint.operation_id === "mutation_renameUser"), "Expected SDL mutation import.");

    let oversizedRejected = false;
    try {
      await runGenerationPipeline({
        sourceType: "graphql_url",
        sourceUrl: `http://127.0.0.1:${address.port}/oversized`,
        generationMode: "dynamic",
      });
    } catch (error) {
      oversizedRejected = error instanceof Error && error.message.includes("exceeded 1000000 bytes");
    }
    assert(oversizedRejected, "Expected live GraphQL import to stop reading oversized responses.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log("PASS: GraphQL JSON, live introspection, and SDL import into deterministic Astrail endpoint maps.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
