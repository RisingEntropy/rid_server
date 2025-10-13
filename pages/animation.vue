<!-- pages/map.vue -->
<template>
  <div class="page-container">
    <client-only>
      <DroneMap />
    </client-only>
      

  </div>
</template>

<script setup>
// 不需要手动导入，Nuxt 3 会自动导入
import DroneMap from '~/components/client/Animation.vue'
useHead({
  title: '无人机监控地图',
  meta: [
    { name: 'description', content: '实时无人机位置监控' }
  ]
})

</script>

<style scoped>
.page-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 18px;
  color: #666;
}
</style>