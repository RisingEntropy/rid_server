import { InfluxDB } from '@influxdata/influxdb-client';
import { z } from 'zod';

// 查询参数 schema (已移除 gateways 字段)
const querySchema = z.object({
  startTime: z.string().datetime({ message: "Invalid datetime format" }),
  endTime: z.string().datetime({ message: "Invalid datetime format" }),
  limit: z.coerce.number().min(1).max(10000000).optional().default(1000000)
});

export default defineEventHandler(async (event) => {
  try {
    // 获取并验证查询参数
    const query = getQuery(event);
    const validatedQuery = querySchema.parse(query);
    
    // 已移除 gateways 的解析
    const { startTime, endTime, limit } = validatedQuery;
    
    // 验证时间范围
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start >= end) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Start time must be before end time'
      });
    }
    
    const maxRange = 300 * 24 * 60 * 60 * 1000; // 300天
    if (end.getTime() - start.getTime() > maxRange) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Time range exceeds maximum allowed (300 days)'
      });
    }
    
    // InfluxDB 配置
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
    
    const client = new InfluxDB({ url, token, timeout: 60000 });
    const queryApi = client.getQueryApi(org);

    // ================== 最终简化的 Flux 查询 ==================
    // 只根据时间范围查询，并重组数据结构
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: ${start.toISOString()}, stop: ${end.toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "lora_uplink")
        // <-- 此处已彻底移除 gateway_id 的过滤逻辑 -->
        |> pivot(
            rowKey:["_time"],
            columnKey: ["_field"],
            valueColumn: "_value"
         )
        |> limit(n: ${limit})
    `;
    // =================================================================

    const results = [];

    await new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          // 将 pivot 后的行数据转换为干净的 JS 对象
          // gateway_id 字段会被包含在内，供前端使用
          results.push({
            time: obj._time,
            gateway_id: obj.gateway_id,
            crcStatus: String(obj.crcStatus || ''),
            rssi: Number(obj.rssi) || 0,
            snr: Number(obj.snr) || 0.0,
            frequency: Number(obj.frequency) || 0,
            payload_length: Number(obj.payload_length) || 0
          });
        },
        error(error) {
          console.error('Query Error:', error);
          console.error('Failed Flux Query:', fluxQuery); // 打印失败的查询语句用于调试
          reject(error);
        },
        complete() {
          resolve();
        }
      });
    });
    
    return {
      success: true,
      data: results,
      count: results.length,
      // 返回的查询参数中也不再包含 gateways
      query: {
        startTime,
        endTime,
        limit
      }
    };
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid query parameters',
        data: { errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })) }
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