process.env.AGENTHUB_GATEWAY_KIND =
  process.env.AGENTHUB_GATEWAY_KIND || "feishu";

import { startGatewayWorker } from "./gateway-worker.mjs";

await startGatewayWorker({ kind: "feishu" });
