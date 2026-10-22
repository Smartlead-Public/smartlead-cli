import assert from "node:assert/strict";

const fixture = JSON.parse(process.env.SMARTLEAD_PREFLIGHT_FIXTURE);
const paths = ["/api/v1/campaigns/123", "/api/v1/campaigns/123/sequences"];
let requestIndex = 0;

// Intercept the real client, and fail rather than permitting any provider write.
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(url.origin, "https://server.smartlead.ai");
  assert.equal(options.method, "GET");
  assert.equal(options.body, undefined);
  assert.equal(url.pathname, paths[requestIndex]);
  process.stderr.write(`GET ${url.pathname}\n`);
  const payload = requestIndex++ === 0 ? fixture.campaign : fixture.sequences;
  return new Response(JSON.stringify(payload), { status: 200 });
};
