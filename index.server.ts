import type { PluginServerContext } from "@getpaseo/plugin/server";
import { discover, fetchUsage } from "./server/usage.js";
import { inputSchema } from "./shared/input.js";

export default function contribute(server: PluginServerContext) {
  server.registerUsageSource({
    id: "tokenflux",
    label: "TokenFlux",
    icon: "icon.svg",
    input: inputSchema,
    discover,
    fetch: fetchUsage,
  });
  return () => {};
}
