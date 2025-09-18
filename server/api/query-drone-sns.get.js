// server/api/drones.get.js
import { serverSupabaseClient } from '#supabase/server';
import { createError, defineEventHandler, getQuery } from 'h3';
export default defineEventHandler(async (event) => {
  try {
    // 获取查询参数
    const { sn } = getQuery(event);
    const client = await serverSupabaseClient(event);
    
    // 构建查询
    let query = client.from('drones') // 替换为你的实际表名
      .select('id, serial_number, model')
      .order('serial_number', { ascending: true });
    
    // 如果有sn参数，添加过滤条件
    if (sn) {
      // 使用ilike进行不区分大小写的模糊匹配
      query = query.ilike('serial_number', `${sn}%`);
    }
    
    // 执行查询
    const { data, error } = await query;
    
    // 错误处理
    if (error) {
      console.error('Supabase query error:', error);
      throw createError({
        statusCode: 500,
        statusMessage: 'Database query failed',
        data: {
          message: '获取无人机列表失败',
          error: error.message
        }
      });
    }
    
    // 格式化返回数据
    const formattedData = (data || []).map(drone => ({
      id: drone.id,
      serialNumber: drone.serial_number || '',
      model: drone.model || ''
    }));
    
    return {
      result: "ok",
      data: formattedData,
      total: formattedData.length
    };
    
  } catch (error) {
    console.error('API Error:', error);
    
    // 如果是已经创建的错误，直接抛出
    if (error.statusCode) {
      throw error;
    }
    
    // 否则创建新的错误
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        message: '服务器内部错误'
      }
    });
  }
});