// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    modules: [
        '@nuxtjs/supabase',
        '@element-plus/nuxt'
    ],
    supabase: {
        // Options
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
        redirect: false // 暂时关闭自动重定向，先专注于后端
    },
    elementPlus: {
        icon: 'ElIcon',
        importStyle: 'css',
        themes: ['dark']
    },
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },
    vite:{
        server: {
            allowedHosts: true
        }
    },
    runtimeConfig: {
        public: {
          amapKey: '', // 默认值
          amapSecurityKey: '' // 默认值
        }
   }
})
