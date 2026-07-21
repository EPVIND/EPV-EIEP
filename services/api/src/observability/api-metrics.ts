import type { FastifyRequest } from "fastify";

const durationBounds = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;

function statusClass(statusCode: number): string {
  return `${Math.max(1, Math.min(5, Math.floor(statusCode / 100)))}xx`;
}

export class ApiMetrics {
  private inFlight = 0;
  private readonly startedAt = new WeakMap<FastifyRequest, bigint>();
  private readonly requestCounts = new Map<string, number>();
  private readonly durationCounts = new Map<number, number>(durationBounds.map((bound) => [bound, 0]));
  private durationCount = 0;
  private durationSum = 0;

  public start(request: FastifyRequest): void {
    this.inFlight += 1;
    this.startedAt.set(request, process.hrtime.bigint());
  }

  public finish(request: FastifyRequest, statusCode: number): void {
    const startedAt = this.startedAt.get(request);
    this.startedAt.delete(request);
    this.inFlight = Math.max(0, this.inFlight - 1);
    const key = `${request.method}:${statusClass(statusCode)}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) ?? 0) + 1);
    if (startedAt === undefined) return;
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    this.durationCount += 1;
    this.durationSum += seconds;
    for (const bound of durationBounds) {
      if (seconds <= bound) this.durationCounts.set(bound, (this.durationCounts.get(bound) ?? 0) + 1);
    }
  }

  public render(): string {
    const lines = [
      "# HELP eiep_http_requests_total Completed API requests by method and status class.",
      "# TYPE eiep_http_requests_total counter",
    ];
    for (const [key, count] of [...this.requestCounts].sort(([left], [right]) => left.localeCompare(right))) {
      const [method, responseClass] = key.split(":");
      lines.push(`eiep_http_requests_total{method="${method}",status_class="${responseClass}"} ${count}`);
    }
    lines.push(
      "# HELP eiep_http_requests_in_flight Current API requests.",
      "# TYPE eiep_http_requests_in_flight gauge",
      `eiep_http_requests_in_flight ${this.inFlight}`,
      "# HELP eiep_http_request_duration_seconds API request duration without route or identity labels.",
      "# TYPE eiep_http_request_duration_seconds histogram",
    );
    for (const bound of durationBounds) {
      lines.push(`eiep_http_request_duration_seconds_bucket{le="${bound}"} ${this.durationCounts.get(bound) ?? 0}`);
    }
    lines.push(
      `eiep_http_request_duration_seconds_bucket{le="+Inf"} ${this.durationCount}`,
      `eiep_http_request_duration_seconds_sum ${this.durationSum.toFixed(9)}`,
      `eiep_http_request_duration_seconds_count ${this.durationCount}`,
      "# EOF",
      "",
    );
    return lines.join("\n");
  }
}
