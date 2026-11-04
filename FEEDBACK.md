# Free Society Hack: Bitrefill Builder Feedback & Notes

**Project**: SHIPREWARD  
**Track**: Agentic Commerce (Bitrefill)  
**Date**: November 2026  

---

### What Worked Well

1. **Streamable HTTP MCP Endpoint**: Connecting `@modelcontextprotocol/sdk` to `https://api.bitrefill.com/mcp` using `StreamableHTTPClientTransport` with `Authorization: Bearer <API_KEY>` worked immediately. Handshake latency was under 250ms and tool discovery returned all 12 tools cleanly.
2. **Account Balance Tool (`get-balances`)**: Having direct access to balance sub-accounts (USD, EUR, BTC) directly inside the agent toolset allows real-time pre-flight spend verification without requiring separate dashboard logins.
3. **Speed of Order Fulfillment**: The live transaction for ₹50 Swiggy Money (`c98f3afa-607a-4606-823a-dec61aa42477`) reached the `delivered` state with redemption codes in under 8 seconds.

---

### What Slowed Us Down & Improvement Suggestions

1. **`intent` Requirement in `search-products`**:
   - The MCP tool `search-products` requires an `intent` argument. While understandable for context, automated agents generating tool calls without this parameter receive an execution error. Adding a clear default or mentioning this in MCP quickstart cards would streamline integration.
2. **MCP Tool Response Format (Text/YAML vs Structured JSON)**:
   - Several MCP tools (e.g., `get-product-details`, `get-balances`) return formatted text blocks with custom syntax (e.g., `packages[8]{package_value,package_currency,payment_price,payment_currency}:`). While readable for humans, agents must implement custom regex or line parsers to extract numeric prices and currencies reliably. Returning structured JSON objects in `content` or supporting an output format flag would make agentic consumption much more robust.
3. **Invoice Status vs Order Delivery Distinction**:
   - The distinction between invoice `complete` and order `delivered` is crucial. Newer developers might mistakenly assume an invoice marked `complete` has issued the gift card code. Highlighting this in the MCP tool descriptions (e.g. in `get-invoice-by-id`) helps ensure agents wait for the final delivery event before concluding transactions.
4. **Rate Limits & Catalog Caching**:
   - Rate limit headers are very helpful. Providing a batch package pricing query or recommended catalog TTL in the docs would help high-throughput agents optimize caching.

---

### Summary

The Bitrefill MCP and REST v2 APIs provide a uniquely powerful foundation for autonomous agentic commerce. SHIPREWARD was able to safely discover, price, and fulfill real digital micro-rewards directly from GitHub pull request triggers while keeping private keys and voucher codes completely protected.

