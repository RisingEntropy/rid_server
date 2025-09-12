// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    modules: [
        '@nuxtjs/supabase'
    ],
    supabase: {
        // Options
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
        redirect: false // 暂时关闭自动重定向，先专注于后端
    },
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
})
