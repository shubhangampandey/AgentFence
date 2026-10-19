import type { InvokeInput, GatewayResult } from "../../shared/src/index.js";
export type { InvokeInput, GatewayResult };
export class AgentFenceError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(code);
    this.name = "AgentFenceError";
  }
}
export class AgentFenceClient {
  private baseUrl: string;
  constructor(
    private options: {
      baseUrl: string;
      apiKey: string;
      timeoutMs?: number;
      retries?: number;
    },
  ) {
    const url = new URL(options.baseUrl);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("HTTPS required for non-local AgentFence");
    this.baseUrl = url.href.replace(/\/$/, "");
  }
  async invoke(input: InvokeInput): Promise<GatewayResult> {
    const correlationId = crypto.randomUUID();
    const attempts = Math.min(this.options.retries ?? 1, 3) + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetch(this.baseUrl + "/api/v1/invoke", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.options.apiKey,
            "Content-Type": "application/json",
            "X-Client-Request-ID": correlationId,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10000),
        });
        const body = (await response.json()) as GatewayResult & {
          error?: { code: string; requestId?: string };
        };
        if (
          body.status === "DENIED" ||
          body.status === "APPROVAL_REQUIRED" ||
          response.ok
        )
          return body;
        const error = new AgentFenceError(
          response.status,
          body.error?.code ?? "API_ERROR",
          body.error?.requestId,
        );
        if (response.status < 500 || attempt === attempts - 1) throw error;
      } catch (error) {
        if (error instanceof AgentFenceError || attempt === attempts - 1)
          throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
    throw new Error("Retry loop exhausted");
  }
}
