import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  toneFromUsedPct,
  unavailable,
  usedPctOf,
  windowFromReportedDuration,
  windowFromUsedPct,
  type UsageAccount,
  type UsageBalance,
  type UsageDetail,
  type UsageReport,
  type UsageScope,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import { configSchema, type Config, type KeySource, type UsageInput } from "../shared/input.js";

const execFileAsync = promisify(execFile);

const API_URL = "https://tokenflux.dev/v1/usage";
const KEY_VARIABLES = ["TOKENFLUX_API_KEY"] as const;
const WINDOW_SECONDS: Record<string, number> = {
  "5h": 5 * 3600,
  "1d": 24 * 3600,
  "7d": 7 * 24 * 3600,
};

const totalsSchema = z.object({
  requests: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_tokens: z.number().optional(),
  cache_read_tokens: z.number().optional(),
  total_tokens: z.number(),
  cost: z.number(),
  actual_cost: z.number(),
});
type Totals = z.infer<typeof totalsSchema>;

const rateLimitSchema = z.object({
  window: z.string(),
  limit: z.number(),
  used: z.number(),
  remaining: z.number(),
  window_start: z.string().nullish(),
  reset_at: z.string().nullish(),
});

const subscriptionSchema = z.object({
  id: z.number(),
  plan_id: z.number(),
  daily_usage_usd: z.number(),
  weekly_usage_usd: z.number(),
  monthly_usage_usd: z.number(),
  daily_limit_usd: z.number().nullish(),
  weekly_limit_usd: z.number().nullish(),
  monthly_limit_usd: z.number().nullish(),
  weekly_window_start: z.string().nullish(),
  expires_at: z.string(),
  status: z.string(),
});

const responseSchema = z.object({
  mode: z.string(),
  isValid: z.boolean(),
  status: z.string().optional(),
  planName: z.string().optional(),
  remaining: z.number().optional(),
  unit: z.string().optional(),
  quota: z
    .object({
      limit: z.number(),
      used: z.number(),
      remaining: z.number(),
      unit: z.string(),
    })
    .optional(),
  balance: z.number().optional(),
  billing: z.object({
    mode: z.string(),
    source: z.string(),
    available: z.boolean(),
    unit: z.string(),
    remaining: z.number().optional(),
    balance: z.number().optional(),
    plan_name: z.string().optional(),
  }),
  rate_limits: z.array(rateLimitSchema).optional(),
  subscription: subscriptionSchema.optional(),
  expires_at: z.string().optional(),
  days_until_expiry: z.number().optional(),
  usage: z
    .object({
      today: totalsSchema.optional(),
      total: totalsSchema.optional(),
    })
    .optional(),
});

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

async function readConfig(): Promise<Config> {
  const path = join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "tokenflux-usage.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return configSchema.parse(JSON.parse(text));
}

async function readKey(source: KeySource): Promise<string> {
  if (source.type === "env") {
    const key = process.env[source.name]?.trim();
    if (!key) throw new Error(`${source.name} is not set in the Paseo daemon environment`);
    return key;
  }
  const [file, ...args] = source.argv;
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(file, args, { timeout: 15_000, maxBuffer: 64 * 1024 }));
  } catch {
    throw new Error(`The key command ${file} failed or timed out`);
  }
  const key = stdout.trim();
  if (!key) throw new Error(`The key command ${file} printed nothing`);
  return key;
}

function balanceUnit(unit: string | undefined): UsageBalance["unit"] {
  const value = unit?.trim().toLowerCase();
  if (value === "usd" || value === "$" || value === "dollar" || value === "dollars") return "usd";
  if (value === "token" || value === "tokens") return "tokens";
  if (value === "request" || value === "requests") return "requests";
  return "credits";
}

function usageDetail(id: string, label: string, totals: Totals | undefined): UsageDetail | undefined {
  if (!totals) return undefined;
  return {
    id,
    label,
    value: [
      `${compactNumber.format(totals.requests)} requests`,
      `${compactNumber.format(totals.total_tokens)} tokens`,
      `${plainNumber.format(totals.cost)} standard, ${plainNumber.format(totals.actual_cost)} actual`,
    ].join(" · "),
  };
}

export function mapUsage(body: z.infer<typeof responseSchema>): UsageReport {
  const planLabel = body.planName ?? body.billing.plan_name;
  const windows: UsageWindow[] = [];
  const balances: UsageBalance[] = [];
  const details: UsageDetail[] = [];

  const rateLimits = (body.rate_limits ?? [])
    .map((limit, index) => ({ limit, index }))
    .sort(
      (a, b) =>
        (WINDOW_SECONDS[a.limit.window] ?? Number.POSITIVE_INFINITY) -
          (WINDOW_SECONDS[b.limit.window] ?? Number.POSITIVE_INFINITY) || a.index - b.index,
    );
  for (const { limit } of rateLimits) {
    const usedPct = usedPctOf(limit.used, limit.limit);
    windows.push(
      windowFromReportedDuration({
        durationSeconds: WINDOW_SECONDS[limit.window] ?? null,
        unknown: {
          id: `rolling_${limit.window.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          label: `Rolling ${limit.window}`,
          shortLabel: limit.window,
        },
        utilizationPct: usedPct,
        resetsAt: limit.reset_at ?? null,
        summary: true,
        tone: toneFromUsedPct(usedPct),
      }),
    );
  }

  const subscription = body.subscription;
  if (subscription) {
    const periods = [
      {
        id: "subscription_daily",
        label: "Daily plan",
        shortLabel: "day",
        used: subscription.daily_usage_usd,
        limit: subscription.daily_limit_usd,
        summary: false,
      },
      {
        id: "subscription_weekly",
        label: "Weekly plan",
        shortLabel: "wk",
        used: subscription.weekly_usage_usd,
        limit: subscription.weekly_limit_usd,
        summary: true,
      },
      {
        id: "subscription_monthly",
        label: "Monthly plan",
        shortLabel: "mo",
        used: subscription.monthly_usage_usd,
        limit: subscription.monthly_limit_usd,
        summary: true,
      },
    ];
    for (const period of periods) {
      if (period.limit == null || period.limit <= 0) continue;
      const usedPct = usedPctOf(period.used, period.limit);
      windows.push(
        windowFromUsedPct({
          id: period.id,
          label: period.label,
          shortLabel: period.shortLabel,
          utilizationPct: usedPct,
          summary: period.summary,
          tone: toneFromUsedPct(usedPct),
        }),
      );
    }
  }

  if (body.quota && body.quota.limit > 0) {
    const usedPct = usedPctOf(body.quota.used, body.quota.limit);
    balances.push({
      id: "quota",
      label: "Key quota",
      used: body.quota.used,
      remaining: body.quota.remaining,
      limit: body.quota.limit,
      unit: balanceUnit(body.quota.unit),
      tone: toneFromUsedPct(usedPct),
    });
  }

  const wallet = body.billing.source === "balance" ? (body.balance ?? body.billing.balance) : undefined;
  if (wallet != null) {
    balances.push({
      id: "wallet",
      label: "Wallet",
      remaining: wallet,
      unit: balanceUnit(body.billing.unit),
      tone: wallet <= 0 ? "danger" : "ok",
    });
  }

  const today = usageDetail("today", "Today", body.usage?.today);
  if (today) details.push(today);
  const total = usageDetail("total", "All time", body.usage?.total);
  if (total) details.push(total);

  if (body.status) {
    details.push({
      id: "key_status",
      label: "Key status",
      value: body.status.replaceAll("_", " "),
      tone: body.status === "active" ? "ok" : "danger",
    });
  }

  if (body.expires_at) {
    const days = body.days_until_expiry;
    details.push({
      id: "key_expiry",
      label: "Key expires",
      value: `${body.expires_at.slice(0, 10)}${typeof days === "number" ? ` (${days} days left)` : ""}`,
      ...(typeof days === "number" && days <= 7 ? { tone: "warning" as const } : {}),
    });
  }

  if (subscription) {
    const parts = [subscription.status];
    if (body.billing.source === "subscription" && typeof body.billing.remaining === "number") {
      parts.push(`${plainNumber.format(body.billing.remaining)} ${body.billing.unit} left`);
    }
    parts.push(`expires ${subscription.expires_at.slice(0, 10)}`);
    details.push({
      id: "subscription",
      label: "Subscription",
      value: parts.join(" · "),
      tone: subscription.status === "active" ? "ok" : "danger",
    });
  }

  details.push({
    id: "billing_source",
    label: "Billing source",
    value: body.billing.source === "subscription" ? "Subscription" : "Wallet",
  });

  if (!body.billing.available) {
    details.push({ id: "funding", label: "Funding", value: "Unavailable", tone: "danger" });
  }

  return {
    status: "available",
    ...(planLabel ? { planLabel } : {}),
    windows,
    balances,
    details,
  };
}

export async function fetchUsage(
  input: UsageInput,
  fetchApi: typeof fetch = fetch,
): Promise<UsageReport> {
  const key = await readKey(input.keySource);
  const response = await fetchApi(API_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403) {
    return unavailable({ kind: "rejected", status: response.status });
  }
  if (!response.ok) throw new Error(`TokenFlux usage API returned ${response.status}`);
  return mapUsage(responseSchema.parse(await response.json()));
}

export async function discover(scope: UsageScope): Promise<UsageAccount[]> {
  // The key is configured outside agent launch environments, so no session login exists.
  if (scope.kind === "session") return [];

  const config = await readConfig();
  let keySource: KeySource | null = null;
  if (config.keyCommand) {
    keySource = { type: "command", argv: config.keyCommand };
  } else {
    const name = KEY_VARIABLES.find((variable) => process.env[variable]);
    if (name) keySource = { type: "env", name };
  }
  if (!keySource) return [];

  // One configured key identifies one TokenFlux account; the key itself never appears here.
  return [{ key: "tokenflux", label: "TokenFlux", input: { keySource } }];
}
