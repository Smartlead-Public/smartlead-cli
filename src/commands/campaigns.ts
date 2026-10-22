import { readFileSync, writeFileSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import { campaignPreflight } from "../preflight.js";
import { SmartLeadClient, CliError, EXIT_ERROR } from "../client.js";
import { printData, printError, detectFormat, type OutputFormat } from "../output.js";
import { validated } from "../schemas/validate.js";
import {
  CampaignListSchema, CampaignSchema, CampaignCreateSchema,
  SequenceListSchema, CampaignAnalyticsSchema, OkResponseSchema,
} from "../schemas/campaigns.schema.js";

function resolveFormat(program: Command): OutputFormat {
  const f = program.opts()["format"] as string | undefined;
  if (f === "json" || f === "table" || f === "csv") return f;
  return detectFormat();
}

function makeClient(program: Command): SmartLeadClient {
  const opts = program.opts();
  return new SmartLeadClient(opts["apiKey"] as string | undefined, undefined, opts["retry"] as boolean | undefined);
}

function loadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new CliError(
      `Failed to read JSON from ${path}: ${err instanceof Error ? err.message : err}`,
      EXIT_ERROR,
    );
  }
}

export function registerCampaignsCommand(program: Command): void {
  const cmd = program.command("campaigns").description("Manage campaigns");

  // ── campaigns list ──────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List all campaigns")
    .option("--client-id <id>", "Filter by client ID", parseInt)
    .option("--include-tags", "Include campaign tags")
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        path: "/campaigns",
        params: {
          client_id: opts.clientId,
          include_tags: opts.includeTags,
        },
      });
      printData(validated(data, CampaignListSchema), resolveFormat(program));
    });

  // ── campaigns get ───────────────────────────────────────────────────
  cmd
    .command("get")
    .description("Get a campaign by ID")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .option("--include-tags", "Include campaign tags")
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        path: `/campaigns/${opts.id}`,
        params: { include_tags: opts.includeTags },
      });
      printData(validated(data, CampaignSchema), resolveFormat(program));
    });

  cmd
    .command("preflight")
    .description("Read-only unsubscribe and per-step attribution checks (one line per finding)")
    .requiredOption("--id <id>", "Campaign ID", (value: string) => {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new InvalidArgumentError("Campaign ID must be a positive safe integer");
      }
      return Number(value);
    })
    .action(async (opts) => {
      const client = makeClient(program);
      const campaign = await client.request<unknown>({ method: "GET", path: `/campaigns/${opts.id}` });
      const sequences = await client.request<unknown>({ method: "GET", path: `/campaigns/${opts.id}/sequences` });
      const findings = campaignPreflight(opts.id, campaign, sequences);
      if (findings.length) {
        process.stdout.write(findings.join("\n") + "\n");
        process.exitCode = EXIT_ERROR;
      }
    });

  // ── campaigns create ────────────────────────────────────────────────
  cmd
    .command("create")
    .description("Create a new campaign")
    .option("--name <name>", "Campaign name")
    .option("--client-id <id>", "Client ID", parseInt)
    .option("--from-json <path>", "Read request body from JSON file")
    .action(async (opts) => {
      const client = makeClient(program);
      const body = opts.fromJson
        ? loadJson(opts.fromJson)
        : { name: opts.name, client_id: opts.clientId };
      const data = await client.request<unknown>({
        method: "POST",
        path: "/campaigns/create",
        body,
      });
      printData(validated(data, CampaignCreateSchema), resolveFormat(program));
    });

  // ── campaigns update-schedule ───────────────────────────────────────
  cmd
    .command("update-schedule")
    .description("Update campaign schedule")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .requiredOption("--from-json <path>", "JSON file with schedule body")
    .action(async (opts) => {
      const client = makeClient(program);
      const body = loadJson(opts.fromJson);
      const data = await client.request<unknown>({
        method: "POST",
        path: `/campaigns/${opts.id}/schedule`,
        body,
      });
      printData(validated(data, OkResponseSchema), resolveFormat(program));
    });

  // ── campaigns update-settings ───────────────────────────────────────
  cmd
    .command("update-settings")
    .description("Update campaign settings")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .requiredOption("--from-json <path>", "JSON file with settings body")
    .action(async (opts) => {
      const client = makeClient(program);
      const body = loadJson(opts.fromJson);
      const data = await client.request<unknown>({
        method: "POST",
        path: `/campaigns/${opts.id}/settings`,
        body,
      });
      printData(validated(data, OkResponseSchema), resolveFormat(program));
    });

  // ── campaigns save-sequence ─────────────────────────────────────────
  cmd
    .command("save-sequence")
    .description("Save email sequences to a campaign")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .requiredOption("--from-json <path>", "JSON file with sequences body")
    .action(async (opts) => {
      const client = makeClient(program);
      const body = loadJson(opts.fromJson);
      const data = await client.request<unknown>({
        method: "POST",
        path: `/campaigns/${opts.id}/sequences`,
        body,
      });
      printData(validated(data, OkResponseSchema), resolveFormat(program));
    });

  // ── campaigns set-status ────────────────────────────────────────────
  cmd
    .command("set-status")
    .description("Update campaign status")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .requiredOption("--status <status>", "New status (e.g. START, PAUSE, STOP)")
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        method: "POST",
        path: `/campaigns/${opts.id}/status`,
        body: { status: opts.status },
      });
      printData(validated(data, OkResponseSchema), resolveFormat(program));
    });

  // ── campaigns get-sequence ──────────────────────────────────────────
  cmd
    .command("get-sequence")
    .description("Get email sequences for a campaign")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        path: `/campaigns/${opts.id}/sequences`,
      });
      printData(validated(data, SequenceListSchema), resolveFormat(program));
    });

  // ── campaigns by-lead ───────────────────────────────────────────────
  cmd
    .command("by-lead")
    .description("Get campaigns associated with a lead")
    .requiredOption("--lead-id <id>", "Lead ID", parseInt)
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        path: `/leads/${opts.leadId}/campaigns`,
      });
      printData(validated(data, CampaignListSchema), resolveFormat(program));
    });

  // ── campaigns export ────────────────────────────────────────────────
  cmd
    .command("export")
    .description("Export campaign leads")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .option("--out <path>", "Write output to file instead of stdout")
    .action(async (opts) => {
      const client = makeClient(program);
      const csv = await client.request<string>({
        path: `/campaigns/${opts.id}/leads-export`,
        rawText: true,
      });
      if (opts.out) {
        writeFileSync(opts.out, csv, "utf-8");
        process.stderr.write(`Exported to ${opts.out}\n`);
      } else {
        process.stdout.write(csv);
        if (!csv.endsWith("\n")) process.stdout.write("\n");
      }
    });

  // ── campaigns delete ────────────────────────────────────────────────
  cmd
    .command("delete")
    .description("Delete a campaign")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .option("--confirm", "Skip confirmation (required for non-TTY)")
    .action(async (opts) => {
      if (!opts.confirm) {
        printError("Pass --confirm to delete campaign " + opts.id);
        process.exit(EXIT_ERROR);
      }
      const client = makeClient(program);
      const data = await client.request<unknown>({
        method: "DELETE",
        path: `/campaigns/${opts.id}`,
      });
      printData(validated(data, OkResponseSchema), resolveFormat(program));
    });

  // ── campaigns sequence-analytics ────────────────────────────────────
  cmd
    .command("sequence-analytics")
    .description("Get per-sequence analytics for a campaign")
    .requiredOption("--id <id>", "Campaign ID", parseInt)
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .option("--time-zone <tz>", "IANA timezone (default: UTC)")
    .action(async (opts) => {
      const client = makeClient(program);
      const data = await client.request<unknown>({
        path: `/campaigns/${opts.id}/sequence-analytics`,
        params: {
          start_date: opts.startDate,
          end_date: opts.endDate,
          time_zone: opts.timeZone,
        },
      });
      printData(validated(data, CampaignAnalyticsSchema), resolveFormat(program));
    });

  // ── campaigns create-subsequence ────────────────────────────────────
  cmd
    .command("create-subsequence")
    .description("Create a subsequence campaign")
    .requiredOption("--id <id>", "Parent campaign ID", parseInt)
    .requiredOption("--from-json <path>", "JSON file with subsequence body")
    .action(async (opts) => {
      const client = makeClient(program);
      const raw = loadJson(opts.fromJson) as Record<string, unknown>;
      const body = { ...raw, parent_campaign_id: opts.id };
      const data = await client.request<unknown>({
        method: "POST",
        path: "/campaigns/create-subsequence",
        body,
      });
      printData(validated(data, CampaignCreateSchema), resolveFormat(program));
    });
}
