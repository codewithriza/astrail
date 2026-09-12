from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AstrailError(Exception):
    def __init__(
        self,
        message: str,
        code: int | None = None,
        data: Any | None = None,
        status: int | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.data = data
        self.status = status


class AstrailTools:
    def __init__(self, client: "AstrailClient"):
        self._client = client

    def list(self) -> list[dict[str, Any]]:
        return self._client.list_tools()

    def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return self._client.search_tools(query, limit)

    def get(self, name: str) -> dict[str, Any] | None:
        return self._client.get_tool(name)

    def schema(self, name: str) -> dict[str, Any] | None:
        return self._client.tool_schema(name)

    def invoke(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        return self._client.call_tool(name, arguments)

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        return self._client.call_tool(name, arguments)

    def raw(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._client.call_tool_raw(name, arguments)


class AstrailClient:
    def __init__(
        self,
        endpoint: str | None = None,
        base_url: str | None = None,
        server_id: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ):
        if endpoint is None and server_id:
            endpoint = f"{(base_url or '').rstrip('/')}/api/mcp/{server_id}"
        if not endpoint or not (endpoint.startswith("http://") or endpoint.startswith("https://")):
            raise ValueError("AstrailClient requires an endpoint or base_url + server_id.")
        self.endpoint = endpoint
        self.api_key = api_key if api_key is not None else os.environ.get("ASTRAIL_API_KEY")
        self.timeout = timeout
        self.headers = headers or {}
        self._next_id = 1
        self.tools = AstrailTools(self)

    def initialize(self) -> dict[str, Any]:
        return self.rpc("initialize", {})

    def list_tools(self) -> list[dict[str, Any]]:
        result = self.rpc("tools/list", {})
        return list(result.get("tools", []))

    def search_tools(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        needle = query.strip().lower()
        tools = self.list_tools()
        if not needle:
            return tools[:limit]
        ranked = [
            (tool_search_score(tool, needle), tool)
            for tool in tools
        ]
        return [
            tool
            for score, tool in sorted(ranked, key=lambda item: (-item[0], item[1].get("name", "")))
            if score > 0
        ][:limit]

    def get_tool(self, name: str) -> dict[str, Any] | None:
        return next((tool for tool in self.list_tools() if tool.get("name") == name), None)

    def tool_schema(self, name: str) -> dict[str, Any] | None:
        tool = self.get_tool(name)
        if not tool:
            return None
        return tool.get("inputSchema") or tool.get("input_schema")

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        result = self.call_tool_raw(name, arguments)
        return parse_tool_result(result)

    def call_tool_raw(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.rpc("tools/call", {
            "name": name,
            "arguments": arguments or {},
        })

    def call_endpoint(
        self,
        endpoint_id: str,
        arguments: dict[str, Any] | None = None,
        tool_name: str | None = None,
        dynamic: bool = True,
    ) -> Any:
        safe_arguments = arguments or {}
        if tool_name and not dynamic:
            return self.call_tool(tool_name, safe_arguments)
        if tool_name:
            try:
                return self.call_tool("invoke_api_endpoint", {
                    "endpoint_id": endpoint_id,
                    "arguments": safe_arguments,
                })
            except AstrailError as error:
                if error.code == -32601:
                    return self.call_tool(tool_name, safe_arguments)
                raise
        return self.call_tool("invoke_api_endpoint", {
            "endpoint_id": endpoint_id,
            "arguments": safe_arguments,
        })

    def search_docs(self, query: str | dict[str, Any], **kwargs: Any) -> Any:
        if isinstance(query, str):
            payload = {"query": query, **kwargs}
        else:
            payload = {**query, **kwargs}
        return self.call_tool("search_docs", payload)

    def execute(self, code: str | dict[str, Any], **kwargs: Any) -> Any:
        if isinstance(code, str):
            payload = {"code": code, **kwargs}
        else:
            payload = {**code, **kwargs}
        return self.call_tool("execute", payload)

    def mcp_config(self, name: str = "astrail", include_api_key_env: bool = True) -> dict[str, Any]:
        server: dict[str, Any] = {"url": self.endpoint}
        if include_api_key_env:
            server["headers"] = {"Authorization": "Bearer ${ASTRAIL_API_KEY}"}
        return {"mcpServers": {name: server}}

    def curl_initialize(self, include_api_key_env: bool = True) -> str:
        auth = " \\\n  -H 'Authorization: Bearer $ASTRAIL_API_KEY'" if include_api_key_env else ""
        return (
            f"curl -sS -X POST '{self.endpoint}' \\\n"
            "  -H 'Content-Type: application/json'"
            f"{auth} \\\n"
            "  --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}'"
        )

    def rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        body = json.dumps({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        }).encode("utf-8")
        headers = {**self.headers, "content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"

        request = Request(self.endpoint, data=body, headers=headers, method="POST")
        status = 200
        try:
            with urlopen(request, timeout=self.timeout) as response:
                status = response.status
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            status = error.code
            raw = error.read().decode("utf-8")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise AstrailError(f"Astrail request failed with HTTP {error.code}.", error.code, raw[:500], error.code) from exc
        except URLError as error:
            raise AstrailError(f"Astrail request failed: {error.reason}", -32000) from error
        except TimeoutError as error:
            raise AstrailError(f"Astrail request timed out after {self.timeout}s.", -32000) from error
        except json.JSONDecodeError as error:
            raise AstrailError(f"Astrail returned a non-JSON response with HTTP {status}.", status, status=status) from error

        rpc_error = payload.get("error")
        if rpc_error:
            raise AstrailError(
                rpc_error.get("message", "Astrail JSON-RPC error."),
                rpc_error.get("code"),
                rpc_error.get("data"),
                status,
            )
        if "result" not in payload:
            raise AstrailError("Astrail returned an empty JSON-RPC result.", -32603, status=status)
        return payload["result"]


def parse_tool_result(result: dict[str, Any]) -> Any:
    if "structuredContent" in result:
        return result["structuredContent"]
    content = result.get("content") or []
    text = ""
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text", "")
            break
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def tool_search_score(tool: dict[str, Any], needle: str) -> int:
    name = str(tool.get("name", "")).lower()
    haystack = " ".join([
        name,
        str(tool.get("description", "")),
        json.dumps(tool.get("inputSchema") or tool.get("input_schema") or {}, sort_keys=True),
    ]).lower()
    if name == needle:
        return 100
    if needle in name:
        return 50
    return sum(1 for token in needle.split() if token and token in haystack)
