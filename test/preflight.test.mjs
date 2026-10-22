import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/preflight-fetch.mjs", import.meta.url));
const campaign = { id: 123, unsubscribe_text: "", add_unsubscribe_tag: false };
const sequence = (step, body = `<a href="https://example.com/?utm_source=outreach&amp;utm_content=email_${step}">Register</a>`) => ({
  id: step, seq_number: step, email_campaign_id: 123, email_body: body,
});

function run(sequences, settings = {}, args = []) {
  return spawnSync(process.execPath, ["--import", preload, cli, "campaigns", "preflight", "--id", "123", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      SMARTLEAD_API_KEY: "synthetic-test-key",
      SMARTLEAD_PREFLIGHT_FIXTURE: JSON.stringify({ campaign: { ...campaign, ...settings }, sequences }),
    },
  });
}

const reads = "GET /api/v1/campaigns/123\nGET /api/v1/campaigns/123/sequences\n";

test("reports a copied four-step sequence with one line per finding using only GETs", () => {
  const result = run([1, 2, 3, 4].map((step) => sequence(step, sequence(1).email_body)));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, reads);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "step 1: missing unsubscribe mechanism",
    "step 2: missing unsubscribe mechanism",
    "step 2: attribution link 1 must use utm_content=email_2",
    "step 3: missing unsubscribe mechanism",
    "step 3: attribution link 1 must use utm_content=email_3",
    "step 4: missing unsubscribe mechanism",
    "step 4: attribution link 1 must use utm_content=email_4",
  ]);
});

for (const settings of [
  { unsubscribe_text: "Stop receiving these emails" },
  { add_unsubscribe_tag: true },
]) {
  test(`campaign-level opt-out protects every step: ${Object.keys(settings)[0]}`, () => {
    const result = run([sequence(1), sequence(2)], settings);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, reads);
  });
}

for (const body of [
  '<a href="https://example.com/unsubscribe?id=opaque">Opt out</a>',
  '<a href="mailto:optout@example.com?subject=unsubscribe">Stop emails</a>',
  "Opt out: https://example.com/unsubscribe",
  "Stop receiving emails: %unsubscribe-text%",
  '<A HREF="https://example.com/optout?id=opaque&amp;mode=oneclick">Unsubscribe</A>',
]) {
  test(`accepts a body opt-out mechanism: ${body}`, () => {
    const result = run([sequence(1, body)]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, reads);
  });
}

for (const body of [
  "Reply unsubscribe to stop emails",
  '<a href="#">Unsubscribe</a>',
  '<a href="javascript:unsubscribe()">Unsubscribe</a>',
  '<a href="https://example.com/?note=unsubscribe">Read more</a>',
  '<!-- %unsubscribe-text% --><script>"https://example.com/unsubscribe"</script><style>%unsubscribe-text%</style>',
]) {
  test(`does not count ineffective opt-out content: ${body}`, () => {
    const result = run([sequence(1, body)], { unsubscribe_text: "<div>&nbsp; </div>" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "step 1: missing unsubscribe mechanism\n");
    assert.equal(result.stderr, reads);
  });
}

test("validates decoded attribution against seq_number, not array position", () => {
  const result = run([sequence(4, '<a href="https://example.com/?utm_source=outreach&amp;utm_content=email_%34">Register</a>')], { add_unsubscribe_tag: true });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

for (const query of ["utm_source=outreach", "utm_content=email_1", "UTM_CONTENT=email_2", "utm_content=email_2&utm_content=email_1"]) {
  test(`rejects missing, wrong or duplicate utm_content: ${query}`, () => {
    const result = run([sequence(2, `See https://example.com/?${query}`)], { add_unsubscribe_tag: true });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "step 2: attribution link 1 must use utm_content=email_2\n");
  });
}

test("checks every variant for opt-out and attribution without printing URLs or bodies", () => {
  const result = run([{ ...sequence(2), email_body: null, sequence_variants: [
    { email_body: "%unsubscribe-text% https://example.com/?utm_content=email_2" },
    { email_body: 'Private copy <a href="https://example.com/?utm_content=email_1&amp;token=private-token">Register</a>' },
  ] }]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "step 2: missing unsubscribe mechanism\nstep 2: attribution link 2 must use utm_content=email_2\n");
  assert.equal(result.stderr, reads);
});

test("keeps HTML block boundaries out of bare attribution URLs", () => {
  const result = run([sequence(2, "<p>https://example.com/?utm_content=email_2</p><p>Thanks</p>")], { add_unsubscribe_tag: true });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("ignores untagged links and deduplicates the same URL in anchor text", () => {
  const url = "https://example.com/?utm_content=email_1";
  const result = run([sequence(2, `<a href="${url}">${url}</a> https://example.com/plain`)], { add_unsubscribe_tag: true }, ["--format", "json"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "step 2: attribution link 1 must use utm_content=email_2\n");
});

for (const sequences of [
  [], { data: [sequence(1)] }, [sequence(1), sequence(1)],
  [{ ...sequence(1), seq_number: 0 }], [{ ...sequence(1), email_campaign_id: 456 }],
  [{ ...sequence(1), sequence_variants: [{ email_body: null }] }],
]) {
  test(`fails closed on incomplete or unexpected sequence responses: ${JSON.stringify(sequences)}`, () => {
    const result = run(sequences, { add_unsubscribe_tag: true });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, reads + "Error: Cannot preflight: unexpected campaign or sequence response\n");
  });
}

for (const settings of [{ id: 456 }, { add_unsubscribe_tag: "false" }, { id: null }]) {
  test(`fails closed on unexpected campaign responses: ${JSON.stringify(settings)}`, () => {
    const result = run([sequence(1)], settings);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, reads + "Error: Cannot preflight: unexpected campaign or sequence response\n");
  });
}

for (const id of ["123junk", "../123", "0", "-1", "9007199254740992"]) {
  test(`rejects an invalid campaign ID before requesting anything: ${id}`, () => {
    const result = run([sequence(1)], {}, ["--id", id]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /GET /);
    assert.match(result.stderr, /Campaign ID must be a positive safe integer/);
  });
}
