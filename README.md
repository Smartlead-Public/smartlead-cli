# @smartlead/cli

Command-line interface for the [SmartLead](https://smartlead.ai) email outreach platform. Wraps the SmartLead REST API for use in terminals, scripts, CI/CD pipelines, and AI-assisted workflows.

## Installation

### npm (recommended)

```bash
npm install -g @smartlead/cli
```

### npx (no install)

```bash
npx @smartlead/cli campaigns list
```

### Binary download

Download standalone binaries from [GitHub Releases](https://github.com/Smartlead-Public/smartlead-cli/releases):

| Platform | Binary |
|---|---|
| macOS Apple Silicon | `smartlead-macos-arm64` |
| macOS Intel | `smartlead-macos-x64` |
| Linux x64 | `smartlead-linux-x64` |
| Windows x64 | `smartlead-win-x64.exe` |

```bash
# macOS / Linux
curl -L -o smartlead https://github.com/Smartlead-Public/smartlead-cli/releases/latest/download/smartlead-linux-x64
chmod +x smartlead
sudo mv smartlead /usr/local/bin/
```

## Quick Start

```bash
# 1. Set your API key (stored in ~/.smartlead/config.json)
smartlead config set api_key sl-xxxxxxxxxxxxxxxx

# 2. List your campaigns
smartlead campaigns list

# 3. Get campaign analytics
smartlead stats campaign --id 12345

# 4. Export leads as CSV
smartlead leads list --campaign-id 12345 --all --format csv > leads.csv
```

## Authentication

The CLI resolves your API key in this order:

| Priority | Method | Example |
|---|---|---|
| 1 | `--api-key` flag | `smartlead --api-key sl-xxx campaigns list` |
| 2 | `SMARTLEAD_API_KEY` env var | `export SMARTLEAD_API_KEY=sl-xxx` |
| 3 | Config file | `smartlead config set api_key sl-xxx` |

The config file is stored at `~/.smartlead/config.json` with `0600` permissions.

```bash
# Set key
smartlead config set api_key sl-xxxxxxxxxxxxxxxx

# Verify
smartlead config get api_key

# Clear all config
smartlead config clear
```

## Output Formats

The CLI auto-detects the best output format:
- **Table** when stdout is a TTY (interactive terminal)
- **JSON** when stdout is piped

Override with `--format`:

```bash
# JSON (default when piped)
smartlead campaigns list --format json

# Pipe to jq
smartlead campaigns list | jq '.[].name'

# Table (default in terminal)
smartlead campaigns list --format table

# CSV for spreadsheets
smartlead campaigns list --format csv > campaigns.csv
```

All data goes to **stdout**, all errors and warnings go to **stderr**. This means piping and redirection always work correctly.

## Command Reference

### config

Manage CLI configuration.

```
smartlead config set <key> <value>    Set a configuration value
smartlead config get <key>            Get a configuration value
smartlead config list                 Show all configuration values
smartlead config clear                Clear all configuration
```

### campaigns

Manage campaigns.

```
smartlead campaigns list [--client-id ID] [--include-tags]
smartlead campaigns get --id ID
smartlead campaigns preflight --id ID
smartlead campaigns create --name "My Campaign" | --from-json file.json
smartlead campaigns update-schedule --id ID --from-json schedule.json
smartlead campaigns update-settings --id ID --from-json settings.json
smartlead campaigns save-sequence --id ID --from-json sequences.json
smartlead campaigns set-status --id ID --status START|PAUSE|STOP
smartlead campaigns get-sequence --id ID
smartlead campaigns by-lead --lead-id ID
smartlead campaigns export --id ID [--out file.json]
smartlead campaigns delete --id ID --confirm
smartlead campaigns sequence-analytics --id ID --start-date 2025-01-01 --end-date 2025-01-31
smartlead campaigns create-subsequence --id PARENT_ID --from-json subseq.json
```

#### Read-Only Campaign Preflight

Run `smartlead campaigns preflight --id ID` before a separately authorized launch or resume. It only reads `GET /campaigns/:id` and `GET /campaigns/:id/sequences`. It never changes settings, sequences, leads, or campaign status.

- Every step must have a nonblank campaign `unsubscribe_text`, campaign `add_unsubscribe_tag: true`, or a body unsubscribe link. When a step has variants, every variant must be covered. Plain "reply unsubscribe" copy, empty anchors, comments, and script/style content do not qualify. Smartlead's documented [`%unsubscribe-text%` placeholder](https://helpcenter.smartlead.ai/en/articles/27-how-does-unsubscribing-work-in-smartlead-manage-unsubscribed-leads-effectively) is recognized.
- Links containing any `utm_` query parameter must have exactly one `utm_content=email_<seq_number>` value. The check uses the provider's step number, not its position in the response. Untagged links are not required to adopt a tracking scheme.
- HTML entities and URL query values are decoded before checking. The same URL repeated within a step is reported once. Findings identify the step and link position without printing URLs, message bodies, or recipients.

Exit `0` with no output means these checks passed. Exit `1` prints one plain-text line per finding to stdout, regardless of `--format`. Invalid or empty sequence responses fail closed with a diagnostic on stderr. Existing transport and authentication exit codes still apply.

This is a static preflight, not a send authorization or a test of delivery, provider rendering, or whether an opt-out endpoint actually works. It does not activate, resume, or send a test email.

### leads

Manage leads.

```
smartlead leads list --campaign-id ID [--status S] [--limit N] [--all]
smartlead leads list-all [--campaign-id ID] [--status S] [--limit N] [--all]
smartlead leads get-by-email --email user@example.com
smartlead leads categories
smartlead leads overview --lead-id ID
smartlead leads sequence-details --lead-map-id ID
smartlead leads add --campaign-id ID --from-json leads.json
smartlead leads push --from-json push.json
smartlead leads update --campaign-id ID --lead-id ID --from-json update.json
smartlead leads update-category --campaign-id ID --lead-id ID --category-id 3
smartlead leads pause --campaign-id ID --lead-id ID
smartlead leads resume --campaign-id ID --lead-id ID [--delay-days 3]
smartlead leads unsubscribe --campaign-id ID --lead-id ID
smartlead leads unsubscribe-all --lead-id ID
smartlead leads delete --campaign-id ID --lead-id ID --confirm
smartlead leads deactivate --from-json deactivate.json
smartlead leads deactivate-campaign --from-json deactivate.json
smartlead leads messages --campaign-id ID --lead-id ID
smartlead leads blocklist [--limit N] [--offset N]
smartlead leads blocklist-add --email bad@spam.com --domain spam.com
smartlead leads blocklist-remove --id ENTRY_ID
```

**Auto-pagination:** Use `--all` on `list` and `list-all` to fetch every lead across all pages.

### mailboxes

Manage email accounts.

```
smartlead mailboxes create --from-json account.json
smartlead mailboxes list [--limit N] [--offset N] [--warmup-status ACTIVE|INACTIVE] [--esp GMAIL|OUTLOOK|SMTP]
smartlead mailboxes list-all
smartlead mailboxes get --id ID [--fetch-campaigns] [--fetch-tags]
smartlead mailboxes list-by-campaign --campaign-id ID
smartlead mailboxes add-to-campaign --campaign-id ID --account-ids 1 2 3
smartlead mailboxes remove --campaign-id ID --account-ids 1 2 3
smartlead mailboxes update --id ID --from-json update.json
smartlead mailboxes set-warmup --id ID --from-json warmup.json
smartlead mailboxes warmup-stats --id ID
smartlead mailboxes reconnect [--from-json reconnect.json]
smartlead mailboxes update-tag --id TAG_ID --name "Tag Name" --color "#FF5733"
smartlead mailboxes add-tags --from-json tags.json
smartlead mailboxes remove-tags --from-json tags.json
smartlead mailboxes tags-by-email --from-json emails.json
smartlead mailboxes fetch-messages --id ID [--limit N] [--folder INBOX] [--include-body]
smartlead mailboxes bulk-fetch-messages --from-json accounts.json
```

### stats

View campaign and account statistics.

```
smartlead stats campaign --id ID
smartlead stats campaign-range --id ID --from 2025-01-01 --to 2025-01-31 [--time-zone America/New_York]
smartlead stats top-level --from 2025-01-01 --to 2025-01-31
smartlead stats top-level-range --from 2025-01-01 --to 2025-01-31
smartlead stats leads --id ID [--limit N] [--offset N]
smartlead stats mailboxes --id ID [--limit N]
```

### webhooks

Manage campaign webhooks.

```
smartlead webhooks list --campaign-id ID
smartlead webhooks upsert --campaign-id ID --from-json webhook.json
smartlead webhooks delete --campaign-id ID --webhook-id ID --confirm
smartlead webhooks summary --campaign-id ID --from 2025-01-01T00:00:00Z --to 2025-01-31T23:59:59Z
smartlead webhooks retrigger --campaign-id ID --from 2025-01-01T00:00:00Z --to 2025-01-31T23:59:59Z
```

### clients

Manage clients and API keys.

```
smartlead clients create --from-json client.json
smartlead clients list
smartlead clients create-key --client-id ID --key-name "Production Key"
smartlead clients keys [--client-id ID] [--status active|inactive]
smartlead clients delete-key --key-id ID --confirm
smartlead clients reset-key --key-id ID
```

### analytics

Cross-campaign analytics and reporting. Most commands require `--from` and `--to` date range flags.

```
smartlead analytics campaigns [--client-ids 1,2,3]
smartlead analytics clients [--client-ids 1,2,3]
smartlead analytics client-monthly
smartlead analytics overall --from 2025-01-01 --to 2025-01-31
smartlead analytics daily --from 2025-01-01 --to 2025-01-31
smartlead analytics daily-sent --from 2025-01-01 --to 2025-01-31
smartlead analytics daily-replies --from 2025-01-01 --to 2025-01-31
smartlead analytics daily-replies-sent --from 2025-01-01 --to 2025-01-31
smartlead analytics campaign-stats --from 2025-01-01 --to 2025-01-31
smartlead analytics client-stats --from 2025-01-01 --to 2025-01-31
smartlead analytics mailbox-health --from 2025-01-01 --to 2025-01-31
smartlead analytics domain-health --from 2025-01-01 --to 2025-01-31
smartlead analytics provider-perf --from 2025-01-01 --to 2025-01-31
smartlead analytics team-board --from 2025-01-01 --to 2025-01-31
smartlead analytics lead-stats --from 2025-01-01 --to 2025-01-31
smartlead analytics lead-categories --from 2025-01-01 --to 2025-01-31
smartlead analytics first-reply --from 2025-01-01 --to 2025-01-31
smartlead analytics followup-rate --from 2025-01-01 --to 2025-01-31
smartlead analytics reply-time --from 2025-01-01 --to 2025-01-31
smartlead analytics campaign-responses --from 2025-01-01 --to 2025-01-31
smartlead analytics campaign-status
smartlead analytics mailbox-stats
```

Common flags for analytics commands: `--timezone`, `--client-ids`, `--campaign-ids`.

### inbox

Manage the unified inbox.

```
# View emails
smartlead inbox replies [--from-json filters.json] [--limit N]
smartlead inbox unread [--limit N]
smartlead inbox snoozed [--limit N]
smartlead inbox important [--limit N]
smartlead inbox scheduled [--limit N]
smartlead inbox reminders [--limit N]
smartlead inbox archived [--limit N]
smartlead inbox lead --id INBOX_ID
smartlead inbox untracked [--limit N] [--fetch-body]

# Reply and forward
smartlead inbox reply --from-json reply.json
smartlead inbox forward --from-json forward.json

# Lead management
smartlead inbox update-revenue --lead-id ID --revenue 5000
smartlead inbox update-category --lead-id ID --category-id 3
smartlead inbox create-task --from-json task.json
smartlead inbox create-note --from-json note.json
smartlead inbox block-domains --from-json domains.json
smartlead inbox resume-lead --lead-id ID --campaign-id ID
smartlead inbox read-status --lead-id ID --read true|false
smartlead inbox set-reminder --from-json reminder.json
smartlead inbox push-subsequence --from-json subseq.json
smartlead inbox assign-member --from-json member.json
```

### prospect

Prospect search, lookups, and lead enrichment.

```
# Lookups (all support --query, --limit, --offset)
smartlead prospect departments --query "Sales"
smartlead prospect cities --query "San" --country "US"
smartlead prospect countries
smartlead prospect states --country "US"
smartlead prospect industries --with-sub-industry true
smartlead prospect sub-industries --industry-id 5
smartlead prospect headcounts
smartlead prospect levels
smartlead prospect revenue
smartlead prospect companies --query "Acme"
smartlead prospect domains --query "acme"
smartlead prospect job-titles --query "VP"
smartlead prospect keywords --query "SaaS"

# Search and fetch
smartlead prospect search --from-json search.json
smartlead prospect fetch --from-json fetch.json
smartlead prospect get --from-json get.json
smartlead prospect find-emails --from-json contacts.json
smartlead prospect review --filter-id 123

# Saved searches
smartlead prospect saved-searches [--limit N]
smartlead prospect recent-searches [--limit N]
smartlead prospect fetched-searches [--limit N]
smartlead prospect save-search --from-json search.json
smartlead prospect update-search --id ID --from-json update.json
smartlead prospect update-fetched --id ID --from-json update.json

# Analytics
smartlead prospect search-analytics [--filter-id ID]
smartlead prospect reply-analytics
```

## Usage with Claude Code

The SmartLead CLI is designed to work with AI coding assistants. Here are example prompts you can give Claude Code:

**Campaign audit:**
```
Audit my SmartLead campaigns — use the smartlead CLI to pull stats for all
campaigns and flag any with open rates below 20% or reply rates below 2%.
```

**Mailbox health check:**
```
Check the health of my SmartLead mailboxes. Use smartlead mailboxes list-all
to get all accounts, then smartlead mailboxes warmup-stats for each one.
Summarize which ones have low reputation or are blocked.
```

**Lead export and analysis:**
```
Export all leads from campaign 12345 using smartlead leads list --campaign-id 12345 --all --format json,
then analyze the lead statuses and give me a breakdown of how many are in each state.
```

**Daily analytics report:**
```
Pull yesterday's analytics using smartlead analytics overall and smartlead analytics daily.
Format a summary comparing sent, opened, clicked, and replied counts.
```

**Prospect search workflow:**
```
Search for VP-level prospects in SaaS companies using smartlead prospect search,
then fetch their emails and push them to campaign 456.
```

## Usage in Scripts and Cron Jobs

The CLI is built for automation. JSON output when piped, exit codes for error handling, and all errors go to stderr.

### Daily campaign report

```bash
#!/bin/bash
set -euo pipefail

export SMARTLEAD_API_KEY="sl-xxxxxxxxxxxxxxxx"

# Get all campaigns and extract IDs
campaigns=$(smartlead campaigns list | jq -r '.[].id')

for id in $campaigns; do
  echo "--- Campaign $id ---"
  smartlead stats campaign --id "$id" | jq '{
    name, sent_count, open_count, reply_count,
    open_rate: ((.open_count // 0) * 100 / ((.sent_count // 1) | if . == 0 then 1 else . end)),
    reply_rate: ((.reply_count // 0) * 100 / ((.sent_count // 1) | if . == 0 then 1 else . end))
  }'
done
```

### Cron: export leads nightly

```bash
# crontab -e
0 2 * * * SMARTLEAD_API_KEY=sl-xxx smartlead leads list --campaign-id 12345 --all --format csv > /data/leads-$(date +\%F).csv
```

### Error handling in scripts

```bash
#!/bin/bash
if ! smartlead campaigns get --id 99999 2>/dev/null; then
  case $? in
    2) echo "Auth failed — check your API key" ;;
    3) echo "Campaign not found" ;;
    *) echo "Unknown error" ;;
  esac
  exit 1
fi
```

### Pipe to other tools

```bash
# Count leads per campaign
smartlead campaigns list | jq -r '.[].id' | while read id; do
  count=$(smartlead leads list --campaign-id "$id" --limit 1 --format json | jq 'length')
  echo "Campaign $id: $count leads"
done

# Find bounced mailboxes
smartlead mailboxes list-all --format json | jq '[.[] | select(.warmup_details.is_warmup_blocked == true)] | length'

# Export to spreadsheet
smartlead analytics campaign-stats --from 2025-01-01 --to 2025-01-31 --format csv > report.csv
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | General error (bad input, API error) |
| `2` | Authentication failure (missing or invalid API key) |
| `3` | Resource not found (404) |

## Environment Variables

| Variable | Description |
|---|---|
| `SMARTLEAD_API_KEY` | API key (overrides config file, overridden by `--api-key`) |
| `SMARTLEAD_PROSPECT_API_URL` | Override prospect service base URL (default: `https://prospect-api.smartlead.ai/api/v1/search-email-leads`) |
| `NO_COLOR` | Disable table borders/formatting (respected by cli-table3) |

## Development Checks

```bash
npm ci
npm run typecheck
npm test
```

`npm test` builds the CLI and exercises campaign preflight through its real command and client with intercepted network responses. The fixtures reject non-GET requests and unexpected endpoints. No provider credentials or live network calls are needed.

## Requirements

- Node.js 20+ (for npm install)
- No runtime dependencies for standalone binaries

## License

MIT
