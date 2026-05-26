import {createLogger} from '@subsquid/logger'

const log = createLogger('sqd:ingress-api-latency')

const {HttpClient} = require('@subsquid/http-client')
const {PrometheusServer} = require('@subsquid/util-internal-processor-tools')
const {HttpConnection} = require('@subsquid/rpc-client/lib/transport/http')
const {Histogram} = require('prom-client')

let requestDuration: any

function registerMetrics(registry: any): void {
    if (requestDuration) return

    requestDuration = new Histogram({
        name: 'sqd_ingress_api_request_duration_seconds',
        help: 'Duration of ingress API requests by source',
        labelNames: ['source'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 180],
        registers: [registry],
    })
}

const origAddRunnerMetrics = PrometheusServer.prototype.addRunnerMetrics
PrometheusServer.prototype.addRunnerMetrics = function (this: any, metrics: any) {
    origAddRunnerMetrics.call(this, metrics)
    registerMetrics(this.registry)
}

const origPerformRequest = HttpClient.prototype.performRequest
HttpClient.prototype.performRequest = async function (this: any, req: any) {
    if (!this.log?.ns?.includes('archive')) {
        return origPerformRequest.call(this, req)
    }

    const source = req.method === 'GET' ? 'gateway' : 'worker'
    const start = process.hrtime.bigint()
    try {
        const res = await origPerformRequest.call(this, req)
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source, durationMs: Math.round(ms), status: res.status},
            `${source} ${Math.round(ms)}ms`
        )
        requestDuration?.observe({source}, ms / 1000)
        return res
    } catch (err: any) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source, durationMs: Math.round(ms), error: err.message},
            `${source} error ${Math.round(ms)}ms`
        )
        requestDuration?.observe({source}, ms / 1000)
        throw err
    }
}

const origCall = HttpConnection.prototype.call
HttpConnection.prototype.call = async function (this: any, req: any, timeout: any) {
    const start = process.hrtime.bigint()
    try {
        const result = await origCall.call(this, req, timeout)
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source: 'rpc', durationMs: Math.round(ms), method: req.method},
            `rpc ${Math.round(ms)}ms ${req.method}`
        )
        requestDuration?.observe({source: 'rpc'}, ms / 1000)
        return result
    } catch (err: any) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source: 'rpc', durationMs: Math.round(ms), method: req.method, error: err.message},
            `rpc error ${Math.round(ms)}ms ${req.method}`
        )
        requestDuration?.observe({source: 'rpc'}, ms / 1000)
        throw err
    }
}

const origBatchCall = HttpConnection.prototype.batchCall
HttpConnection.prototype.batchCall = async function (this: any, batch: any, timeout: any) {
    const start = process.hrtime.bigint()
    try {
        const result = await origBatchCall.call(this, batch, timeout)
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source: 'rpc', durationMs: Math.round(ms), batchSize: batch.length},
            `rpc batch(${batch.length}) ${Math.round(ms)}ms`
        )
        requestDuration?.observe({source: 'rpc'}, ms / 1000)
        return result
    } catch (err: any) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6
        log.debug(
            {source: 'rpc', durationMs: Math.round(ms), batchSize: batch.length, error: err.message},
            `rpc batch(${batch.length}) error ${Math.round(ms)}ms`
        )
        requestDuration?.observe({source: 'rpc'}, ms / 1000)
        throw err
    }
}

log.debug('ingress API latency monitoring enabled')
