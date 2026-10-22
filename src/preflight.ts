import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";
import { CliError } from "./client.js";

const positiveId = z.union([
  z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number),
]).pipe(z.number().int().positive().safe());
const campaignSchema = z.object({
  id: positiveId,
  unsubscribe_text: z.string().nullish(),
  add_unsubscribe_tag: z.boolean().nullish(),
});
const sequenceSchema = z.array(z.object({
  seq_number: positiveId,
  email_campaign_id: positiveId.nullish(),
  email_body: z.string().nullish(),
  sequence_variants: z.array(z.object({ email_body: z.string() })).nullish(),
})).nonempty();

type Node = DefaultTreeAdapterMap["node"];
type Link = { href: string; label: string };

function bodyContent(html: string): { text: string; links: Link[] } {
  const links: Link[] = [];
  function visit(node: Node): string {
    if ("tagName" in node && ["script", "style", "template"].includes(node.tagName)) return "";
    const text = node.nodeName === "#text" && "value" in node ? node.value :
      "childNodes" in node ? node.childNodes.map(visit).join("") : "";
    if ("tagName" in node && node.tagName === "a") {
      const href = node.attrs.find((attr) => attr.name === "href")?.value;
      if (href) links.push({ href, label: text });
    }
    const block = "tagName" in node && ["p", "div", "br", "li", "tr"].includes(node.tagName);
    return block ? `\n${text}\n` : text;
  }
  const text = visit(parseFragment(html));
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    links.push({ href: match[0].replace(/[.,;!?)]+$/, ""), label: "" });
  }
  return { text, links };
}

function linkUrl(href: string): URL | undefined {
  try {
    const url = new URL(href);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url;
  } catch { /* Non-URL placeholders and anchors are not working opt-out links. */ }
  return undefined;
}

function hasUnsubscribe(body: ReturnType<typeof bodyContent>): boolean {
  // Smartlead documents this placeholder as an inline unsubscribe link.
  if (body.text.includes("%unsubscribe-text%")) return true;
  return body.links.some(({ href, label }) => {
    const url = linkUrl(href);
    if (!url) return false;
    return /\bunsubscribe\b/i.test(label) || /\bunsubscribe\b/i.test(url.pathname) ||
      (url.protocol === "mailto:" && /\bunsubscribe\b/i.test(url.searchParams.get("subject") ?? ""));
  });
}

/** Static, read-only checks of the campaign settings and every returned step body. */
export function campaignPreflight(id: number, campaign: unknown, sequences: unknown): string[] {
  const settings = campaignSchema.safeParse(campaign);
  const steps = sequenceSchema.safeParse(sequences);
  if (!settings.success || !steps.success || settings.data.id !== id ||
      steps.data.some((step) => step.email_campaign_id != null && step.email_campaign_id !== id) ||
      new Set(steps.data.map((step) => step.seq_number)).size !== steps.data.length) {
    // Do not echo raw provider payloads or bodies in validation diagnostics.
    throw new CliError("Cannot preflight: unexpected campaign or sequence response");
  }

  const footer = bodyContent(settings.data.unsubscribe_text ?? "").text.trim();
  const globalUnsubscribe = footer.length > 0 || settings.data.add_unsubscribe_tag === true;
  const findings: string[] = [];
  for (const step of steps.data.sort((a, b) => a.seq_number - b.seq_number)) {
    const variants = step.sequence_variants ?? [];
    const bodies = variants.length ? variants.map((variant) => variant.email_body) : [step.email_body ?? ""];
    const content = bodies.map(bodyContent);
    if (!globalUnsubscribe && content.some((body) => !hasUnsubscribe(body))) {
      findings.push(`step ${step.seq_number}: missing unsubscribe mechanism`);
    }
    // Deduplicate URLs repeated in an anchor label or across variants of a step.
    const links = new Set(content.flatMap((body) => body.links.map((link) => link.href)));
    let attributionLink = 0;
    for (const href of links) {
      const url = linkUrl(href);
      if (!url || ![...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith("utm_"))) continue;
      attributionLink++;
      const tags = url.searchParams.getAll("utm_content");
      if (tags.length !== 1 || tags[0] !== `email_${step.seq_number}`) {
        findings.push(`step ${step.seq_number}: attribution link ${attributionLink} must use utm_content=email_${step.seq_number}`);
      }
    }
  }
  return findings;
}
