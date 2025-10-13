<!-- pages/map.vue -->
<template>
  <div class="page-container">
    <client-only>
      <SleepComp />
    </client-only>
      

  </div>
</template>

<script setup>
import SleepComp from '../components/client/SleepComp.vue';
useHead({
  title: '睡眠阶段划分',
  meta: [
    { name: 'description', content: '睡眠阶段划分' }
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