// server/api/query-echo.get.js

// 导入 defineEventHandler，这是定义 API 处理器的核心函数
// Nuxt 会自动处理这个 import，你不需要写路径
export default defineEventHandler((event) => {

    // 使用 Nuxt 提供的助手函数 getQuery()
    // 它可以从传入的 event 对象中解析出所有的 URL 查询参数，并返回一个对象
    const queryParams = getQuery(event);

    // 在服务端的控制台打印一下接收到的参数，方便你调试
    console.log('收到一个 GET 请求，查询参数是:', queryParams);

    // 直接将解析出的参数对象作为响应返回
    // Nuxt 的 Nitro 服务器会自动将其转换为 JSON 格式
    return queryParams;

});