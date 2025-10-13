<!-- pages/map.vue -->
<template>
  <div class="page-container">
    <client-only>
      <DroneHistory />
    </client-only>
      

  </div>
</template>

<script setup>
import DroneHistory from '../components/client/DroneLTEInfo.vue';
useHead({
  title: '无人机LTE历史轨迹查询',
  meta: [
    { name: 'description', content: '实时无人机LTE历史轨迹查询' }
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