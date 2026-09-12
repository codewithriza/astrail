# Non-custodial x402 payments

Astrail supports x402 v2 without holding customer funds or wallet private keys. The caller pays from the end user's wallet; Astrail only validates policy, forwards the signed proof, and records a receipt.

## Configure a server

1. Open **Dashboard → Servers → your server → Integration operations**.
2. Enable **Non-custodial x402 payments**.
3. Allow the networks you support. Base is `eip155:8453`; Solana mainnet is `solana:mainnet`.
4. Allow the exact token contract or mint addresses. Astrail fails closed when this list is empty.
5. Set required per-call and daily limits, plus an optional approval threshold, in atomic token units.
6. Create the domain challenge, publish it at the shown HTTPS `.well-known` URL, then click **Verify**.
7. Save integration operations.

Apply `neon-migration-x402.sql` before enabling production payments.

## Runtime flow

1. Call the MCP tool normally.
2. If the upstream requires payment, Astrail returns `x402_payment_required` with the allowed payment options.
3. The client asks the end user to approve and sign one option in their wallet.
4. Retry the same `tools/call` request with the x402 v2 `PAYMENT-SIGNATURE` HTTP header.
5. If the amount meets the server's approval threshold, approve the exact payment in `/dashboard/approvals`, then call `astrail/resume` with the same header.
6. Astrail checks the API key's bound end-user ID, verified domain, network, asset, per-call limit, daily limit, approval, and proof replay fingerprint before forwarding it.
7. The result includes a safe receipt ID and settlement transaction when the upstream supplies `PAYMENT-RESPONSE`.

Example request after an external wallet signs:

```bash
curl https://www.astrail.dev/api/mcp/SERVER_ID \
  -H "Authorization: Bearer ${ASTRAIL_API_KEY}" \
  -H 'Content-Type: application/json' \
  -H 'PAYMENT-SIGNATURE: BASE64_X402_V2_PAYMENT_PAYLOAD' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"paid_tool","arguments":{}}}'
```

The Astrail API key must be bound to an end-user ID. Payment signatures are never written to tool logs, receipts, or the credential vault. Paid requests use one upstream attempt, and a proof fingerprint cannot be replayed.

## What Astrail does not do

- It does not generate or store wallet private keys.
- It does not accept seed phrases.
- It does not run a shared platform wallet that pays customer calls.
- It does not custody balances or settle payments itself.
- It does not automatically forward legacy x402 v1 proofs, because v1 payloads do not carry enough requirement data for the same spend-policy checks.
