# Astrail Python SDK

Python client for Astrail hosted MCP endpoints.

## Install

The public PyPI package is not published yet. For a server-specific client, use **Dashboard → SDK Factory → Generate bundle**. The bundle includes a typed Python package with endpoint-specific methods, tests, and docs.

To use the first-party runtime client directly from source:

```bash
git clone https://github.com/getastrail/astrail.git vendor/astrail
python -m pip install ./vendor/astrail/sdk/python
```

## Quickstart

```python
import os
from astrail import AstrailClient

astrail = AstrailClient(
    base_url="https://your-app.com",
    server_id="SERVER_ID",
    api_key=os.environ["ASTRAIL_API_KEY"],
)

astrail.initialize()
tools = astrail.tools.list()
matches = astrail.tools.search("list incidents")
schema = astrail.tools.schema(matches[0]["name"])
tool_result = astrail.tools.invoke(matches[0]["name"], {"limit": 10})

status = astrail.call_endpoint("get_status", {"limit": 10})
raw_tool = astrail.call_tool_raw("tools/list")
claude_config = astrail.mcp_config("astrail")
curl = astrail.curl_initialize()

docs = astrail.search_docs("list active incidents", operation="read", detail="compact", limit=5)

result = astrail.execute(
    """
async function run(client) {
  return await client.incidents.list({ status: "active" });
}
""",
    result_mode="compact",
)
```

## Surface

- `initialize()`
- `tools.list()`
- `tools.search(query, limit)`
- `tools.get(name)`
- `tools.schema(name)`
- `tools.invoke(name, arguments)`
- `tools.raw(name, arguments)`
- `list_tools()`
- `call_endpoint(endpoint_id, arguments, tool_name=None, dynamic=True)`
- `call_tool(name, arguments)`
- `call_tool_raw(name, arguments)`
- `search_docs(query, **kwargs)`
- `execute(code, **kwargs)`
- `rpc(method, params)`
- `mcp_config(name)`
- `curl_initialize()`

## Raw JSON-RPC

The SDK uses standard HTTP JSON-RPC under the hood:

```python
from urllib.request import Request, urlopen
import json

endpoint = "https://your-app.com/api/mcp/SERVER_ID"
request = Request(
    endpoint,
    data=json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": {},
    }).encode("utf-8"),
    headers={"content-type": "application/json"},
    method="POST",
)

payload = json.loads(urlopen(request).read().decode("utf-8"))
```

## Astrail Code Mode

Code Mode endpoints expose `search_docs` and `execute`. `search_docs` ranks SDK-shaped methods and can return `compact`, `schema`, `examples`, or `auth` detail. Hosted execution does not eval arbitrary JavaScript; Astrail compiles supported SDK-shaped calls to stored endpoint-map execution.

## Generated SDK Bundles

Dashboard SDK exports include per-server Python clients with resource helpers:

```python
from petstore_sdk import Client

client = Client(
    endpoint="https://your-app.com/api/mcp/SERVER_ID",
    api_key=os.environ["ASTRAIL_API_KEY"],
)

client.pets.get_pet_by_id({"petId": "pet_123"})
client.pets.get_pet_by_id(petId="pet_123")
```

The package SDK is the stable low-level runtime client. Generated bundles add server-specific endpoint catalogs, method names, docs, tests, manifests, and CI scaffolds on top.

## Roadmap

- LangChain, CrewAI, and AutoGen examples
- async transport
