import io
import json
import shlex
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "sdk" / "python"))
from astrail.client import AstrailClient, AstrailError, parse_tool_result


class Response(io.BytesIO):
    status = 200

    def __init__(self, payload):
        super().__init__(json.dumps(payload).encode())


class SdkTests(unittest.TestCase):
    def test_failed_tool_does_not_unwrap_as_success(self):
        result = {"isError": True, "content": [{"type": "text", "text": "Denied"}], "structuredContent": {"status": "denied"}}
        with self.assertRaises(AstrailError) as raised:
            parse_tool_result(result)
        self.assertEqual(raised.exception.data, result)
        self.assertEqual(parse_tool_result({"structuredContent": {"ok": True}}), {"ok": True})

    def test_generated_curl_quotes_endpoint_without_embedding_key(self):
        endpoint = "https://example.test/it's"
        command = AstrailClient(endpoint=endpoint, api_key="not-for-output").curl_initialize()
        self.assertEqual(shlex.split(command)[4], endpoint)
        self.assertIn('-H "Authorization: Bearer $ASTRAIL_API_KEY"', command)
        self.assertNotIn("not-for-output", command)

    def test_raw_call_preserves_error_result(self):
        result = {"isError": True, "content": [{"type": "text", "text": "Denied"}]}
        with patch("astrail.client._open_request", return_value=Response({"jsonrpc": "2.0", "id": 1, "result": result})):
            self.assertEqual(AstrailClient(endpoint="https://example.test/mcp").tools.raw("write"), result)

    def test_mismatched_and_invalid_envelopes(self):
        for payload in [None, [], {"jsonrpc": "2.0", "id": 99, "result": {}}]:
            with self.subTest(payload=payload), patch("astrail.client._open_request", return_value=Response(payload)):
                with self.assertRaises(AstrailError):
                    AstrailClient(endpoint="https://example.test/mcp").list_tools()

    def test_redirects_do_not_forward_credentials(self):
        received = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(302)
                self.send_header("Location", "/target")
                self.end_headers()

            def do_GET(self):
                received.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = AstrailClient(endpoint=f"http://127.0.0.1:{server.server_port}/redirect", api_key="test-key")
            with self.assertRaises(AstrailError):
                client.list_tools()
            self.assertEqual(received, [])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_http_error_cannot_be_hidden_by_a_result_field(self):
        error = HTTPError("https://example.test/mcp", 500, "Failure", {}, Response({"jsonrpc": "2.0", "id": 1, "result": {}}))
        with patch("astrail.client._open_request", side_effect=error):
            with self.assertRaises(AstrailError) as raised:
                AstrailClient(endpoint="https://example.test/mcp").list_tools()
        self.assertEqual(raised.exception.status, 500)

    def test_endpoint_validation(self):
        for endpoint in ["https://", "https://user:pass@example.test", "https://example.test/#x", "https://bad host/mcp", "https://example.test:99999"]:
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                AstrailClient(endpoint=endpoint)

    def test_server_id_is_a_single_path_segment(self):
        client = AstrailClient(base_url="https://example.test/", server_id="team/a?b#c")
        self.assertEqual(client.endpoint, "https://example.test/api/mcp/team%2Fa%3Fb%23c")

    def test_invalid_timeouts_fail_before_io(self):
        for timeout in [0, -1, float("nan"), float("inf"), True, "30"]:
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                AstrailClient(endpoint="https://example.test", timeout=timeout)

    def test_headers_are_copied_and_auth_has_precedence(self):
        headers = {"Authorization": "custom", "Content-Type": "text/plain", "X-Trace": "original"}
        client = AstrailClient(endpoint="https://example.test", api_key="chosen", headers=headers)
        headers["X-Trace"] = "changed"
        with patch("astrail.client._open_request", return_value=Response({"jsonrpc": "2.0", "id": 1, "result": {"tools": []}})) as opened:
            client.list_tools()
            sent = dict(opened.call_args.args[0].header_items())
        self.assertEqual(sent["Authorization"], "Bearer chosen")
        self.assertEqual(sent["Content-type"], "application/json")
        self.assertEqual(sent["X-trace"], "original")

    def test_invalid_error_envelopes(self):
        for error in [None, "oops", {}, {"code": True, "message": "bad"}]:
            with patch("astrail.client._open_request", return_value=Response({"jsonrpc": "2.0", "id": 1, "error": error})):
                with self.assertRaises(AstrailError):
                    AstrailClient(endpoint="https://example.test").initialize()

    def test_malformed_tool_content(self):
        for result in [None, [], {"content": {}}, {"content": [None]}, {"content": [{"type": "text", "text": 1}]}]:
            with self.assertRaises(AstrailError):
                parse_tool_result(result)

    def test_empty_schema_is_preserved(self):
        client = AstrailClient(endpoint="https://example.test")
        with patch.object(client, "get_tool", return_value={"name": "test", "inputSchema": {}}):
            self.assertEqual(client.tool_schema("test"), {})

    def test_search_limit_validation(self):
        client = AstrailClient(endpoint="https://example.test")
        for limit in [-1, 0.5, True]:
            with self.assertRaises(ValueError):
                client.search_tools("", limit)
        with patch.object(client, "list_tools", side_effect=AssertionError("unexpected fetch")):
            self.assertEqual(client.search_tools("", 0), [])

    def test_paginated_tools(self):
        client = AstrailClient(endpoint="https://example.test")
        with patch.object(client, "rpc", side_effect=[{"tools": [{"name": "one"}], "nextCursor": "next"}, {"tools": [{"name": "two"}]}]) as rpc:
            self.assertEqual([t["name"] for t in client.list_tools()], ["one", "two"])
            self.assertEqual(rpc.call_args.args, ("tools/list", {"cursor": "next"}))
        with patch.object(client, "rpc", return_value={"tools": [], "nextCursor": "same"}):
            with self.assertRaises(AstrailError):
                client.list_tools()

    def test_error_response_ids_are_strict(self):
        for request_id in [True, 1.0, 99]:
            with patch("astrail.client._open_request", return_value=Response({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Missing"}})):
                with self.assertRaises(AstrailError) as raised:
                    AstrailClient(endpoint="https://example.test").initialize()
                self.assertEqual(raised.exception.code, -32603)


if __name__ == "__main__":
    unittest.main()
