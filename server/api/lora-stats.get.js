import { InfluxDB } from '@influxdata/influxdb-client';
import { z } from 'zod';

const querySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  gateways: z.string().optional(),
  interval: z.enum(['10s', '30s', '1m', '5m', '10m', '1h']).optional().default('1m')
});

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const { startTime, endTime, gateways: gatewaysStr, interval } = querySchema.parse(query);
    
    const gateways = gatewaysStr ? gatewaysStr.split(',').map(g => g.trim()) : null;

    const url = process.env.INFLUX_URL || 'http://localhost:8086';
    const token = process.env.INFLUX_TOKEN;
    const org = process.env.INFLUX_ORG;
    const bucket = 'lora-data';

    if (!token || !org) {
      throw createError({
        statusCode: 500,
        statusMessage: 'InfluxDB configuration missing'
      });
    }

    const client = new InfluxDB({ url, token, timeout: 30000 });
    const queryApi = client.getQueryApi(org);

    let fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: ${new Date(startTime).toISOString()}, stop: ${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "lora_uplink")
    `;

    if (gateways && gateways.length > 0) {
      const gatewayFilter = gateways
        .map(gw => `r["gateway_id"] == "${gw}"`)
        .join(' or ');
      fluxQuery += `
        |> filter(fn: (r) => ${gatewayFilter})
      `;
    }

    const statsQuery = fluxQuery + `
      |> filter(fn: (r) => r["_field"] == "payload_length" or r["_field"] == "rssi" or r["_field"] == "snr")
      |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> map(fn: (r) => ({
          time: r._time,
          avgPayloadLength: r.payload_length,
          avgRssi: r.rssi,
          avgSnr: r.snr,
          dataRate: if exists r.payload_length then r.payload_length * 8.0 / 1000.0 else 0.0
        }))
      |> sort(columns: ["time"])
    `;

    const stats = [];

    await new Promise((resolve) => {
      queryApi.queryRows(statsQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          stats.push({
            time: obj.time,
            avgPayloadLength: obj.avgPayloadLength || 0,
            avgRssi: obj.avgRssi || 0,
            avgSnr: obj.avgSnr || 0,
            dataRate: obj.dataRate || 0
          });
        },
        error(error) {
          console.error('Stats query error:', error);
          resolve();
        },
        complete() {
          resolve();
        }
      });
    });

    // 计算总体统计
    const overallStats = stats.length > 0 ? {
      totalWindows: stats.length,
      avgDataRate: stats.reduce((sum, s) => sum + s.dataRate, 0) / stats.length,
      maxDataRate: Math.max(...stats.map(s => s.dataRate)),
      minDataRate: Math.min(...stats.map(s => s.dataRate)),
      avgRssi: stats.reduce((sum, s) => sum + s.avgRssi, 0) / stats.length,
      avgSnr: stats.reduce((sum, s) => sum + s.avgSnr, 0) / stats.length
    } : {
      totalWindows: 0,
      avgDataRate: 0,
      maxDataRate: 0,
      minDataRate: 0,
      avgRssi: 0,
      avgSnr: 0
    };

    return {
      success: true,
      stats,
      overall: overallStats,
      interval
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid query parameters',
        data: {
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }
      });
    }

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Internal server error'
    });
  }
});