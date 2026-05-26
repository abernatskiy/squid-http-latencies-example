# SQD Archive Latency Monitor

A minimal EVM squid indexer instrumented with a runtime monkey patch that measures ingress API response times. Latency data is emitted via the SQD structured logger and exposed as Prometheus metrics on the processor's built-in `/metrics` endpoint.

## What is measured

The patch (`src/patch.ts`) reports latency for each ingress API source separately:

| Source | What is timed | Patch target |
|---|---|---|
| `gateway` | SQD archive router requests (height checks, worker assignment) | `HttpClient.performRequest` (GET) |
| `worker` | SQD archive worker data queries | `HttpClient.performRequest` (POST) |
| `rpc` | Chain RPC node calls (single and batch) | `HttpConnection.call`, `HttpConnection.batchCall` |

All three sources feed a single Prometheus histogram: `sqd_ingress_api_request_duration_seconds{source}`.

## Setup

```bash
npm i          # also runs `prepare` which compiles the patch
```

## Running

```bash
sqd up                    # start Postgres
sqd migration:generate    # run migrations
sqd process               # start the processor
```

## Viewing latency data

### Logs

Logging is under the `sqd:ingress-api-latency` namespace at **debug** level, disabled by default. Enable it with:

```bash
SQD_DEBUG=sqd:ingress-api-latency sqd process
```

Example output:
```
DEBUG sqd:ingress-api-latency gateway 127ms
DEBUG sqd:ingress-api-latency worker 1842ms
DEBUG sqd:ingress-api-latency rpc 45ms eth_getBlockByNumber
DEBUG sqd:ingress-api-latency rpc batch(10) 312ms
```

### Prometheus metrics

Metrics are served on the processor's built-in Prometheus endpoint (port from `PROMETHEUS_PORT` env var, or ephemeral):

```bash
curl http://localhost:$PORT/metrics | grep sqd_ingress
```

Available metric:

```
sqd_ingress_api_request_duration_seconds_bucket{source="gateway"|"worker"|"rpc"}
```

## Configuration

| Env var | Purpose |
|---|---|
| `RPC_ETH_HTTP` | Chain RPC endpoint (required) |
| `PROMETHEUS_PORT` | Port for the metrics server |
| `SQD_DEBUG` | Set to `sqd:ingress-api-latency` to enable latency logs |
| `SQD_API_KEY` | SQD archive API key |
