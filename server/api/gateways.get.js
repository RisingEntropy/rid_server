import { InfluxDB } from '@influxdata/influxdb-client';

export default defineEventHandler(async (event) => {
  try {
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

    // 修改查询：使用 0 作为起始时间（Unix epoch），查询所有时间的数据
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: 0)
        |> filter(fn: (r) => r["_measurement"] == "lora_uplink")
        |> filter(fn: (r) => r["_field"] == "gateway_id")
        |> distinct(column: "_value")
        |> keep(columns: ["_value"])
    `;

    const gatewaysSet = new Set();
    
    return await new Promise((resolve) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          if (obj._value !== undefined && obj._value !== null) {
            gatewaysSet.add(String(obj._value));
          }
        },
        error(error) {
          console.error('InfluxDB Query Error:', error);
          resolve({
            success: false,
            error: error.message
          });
        },
        complete() {
          resolve({
            success: true,
            gateways: Array.from(gatewaysSet).sort(),
            count: gatewaysSet.size,
            timeRange: 'all'
          });
        }
      });
    });
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    });
  }
});