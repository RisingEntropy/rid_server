<!-- components/DroneMarker.vue -->
<template>
  <div class="drone-marker" :class="{ 'all-lost': allSignalsLost }">
    <!-- 中心无人机图标 -->
    <div class="drone-icon">
      <img src="/drone_logo.svg" alt="" />
    </div>
    
    <!-- WiFi 信号指示器 - 顶部 -->
    <div class="signal-wifi">
      <span class="signal-dot" :class="wifiSignalClass"></span>
      <img src="/WiFi_logo.svg" alt="" class="signal-logo" />
    </div>
    
    <!-- LoRa 信号指示器 - 左下 -->
    <div class="signal-lora">
      <span class="signal-dot" :class="loraSignalClass"></span>
      <img src="/lora_logo.svg" alt="" class="signal-logo" />
    </div>
    
    <!-- 4G 信号指示器 - 右下 -->
    <div class="signal-4g">
      <span class="signal-dot" :class="fourGSignalClass"></span>
      <img src="/base_station_logo.svg" alt="" class="signal-logo" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface SignalInfo {
  last_wifi_quality: number | null
  last_lora_quality: number | null
  'last_4G_quality': number | null
}

interface LostCounts {
  wifi: number
  lora: number
  cellular: number
}

const props = defineProps<{
  signalInfo: SignalInfo
  lostCounts?: LostCounts
}>()

// 获取丢失计数
const wifiLostCount = computed(() => props.lostCounts?.wifi || 0)
const loraLostCount = computed(() => props.lostCounts?.lora || 0)
const cellularLostCount = computed(() => props.lostCounts?.cellular || 0)

// 判断是否有信号源（曾经有过信号）
const hasWifiSource = computed(() => {
  return props.signalInfo.last_wifi_quality !== null || wifiLostCount.value > 0
})

const hasLoraSource = computed(() => {
  return props.signalInfo.last_lora_quality !== null || loraLostCount.value > 0
})

const has4GSource = computed(() => {
  return props.signalInfo['last_4G_quality'] !== null || cellularLostCount.value > 0
})

// WiFi信号状态 - 连续3次丢失才显示红色
const wifiSignalClass = computed(() => {
  if (wifiLostCount.value >= 3) {
    return 'signal-lost' // 连续3次丢失
  }
  return 'signal-active'
  // const quality = props.signalInfo.last_wifi_quality
  // return quality !== null ? 'signal-active' : 'signal-inactive'
})

// LoRa信号状态 - 连续3次丢失才显示红色
const loraSignalClass = computed(() => {
  if (loraLostCount.value >= 3) {
    return 'signal-lost' // 连续3次丢失
  }
  return 'signal-active'
  // const quality = props.signalInfo.last_lora_quality
  // return quality !== null ? 'signal-active' : 'signal-inactive'
})

// 4G信号状态 - 连续3次丢失才显示红色
const fourGSignalClass = computed(() => {
  if (cellularLostCount.value >= 3) {
    return 'signal-lost' // 连续3次丢失
  }
  return 'signal-active'
  // const quality = props.signalInfo['last_4G_quality']
  // return quality !== null ? 'signal-active' : 'signal-inactive'
})

// 判断是否所有信号源都丢失（连续3次）
const allSignalsLost = computed(() => {
  const activeSignals = []
  
  if (hasWifiSource.value) {
    activeSignals.push(wifiLostCount.value >= 3)
  }
  if (hasLoraSource.value) {
    activeSignals.push(loraLostCount.value >= 3)
  }
  if (has4GSource.value) {
    activeSignals.push(cellularLostCount.value >= 3)
  }
  
  // 如果有活跃信号源，检查是否都丢失
  return activeSignals.length > 0 && activeSignals.every(lost => lost)
})
</script>

<style scoped>
.drone-marker {
  position: relative;
  width: 80px;
  height: 80px;
  transition: all 0.3s ease;
}

/* 当所有信号都丢失时，整体效果 */
.drone-marker.all-lost .drone-icon img {
  filter: drop-shadow(0 2px 4px rgba(239, 68, 68, 0.5)) brightness(0.9) sepia(1) hue-rotate(-10deg);
}

/* 中心无人机图标 */
.drone-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  z-index: 2;
}

.drone-icon img {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: filter 0.3s ease;
}

/* 信号指示器通用样式 */
.signal-wifi,
.signal-lora,
.signal-4g {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* WiFi - 顶部 */
.signal-wifi {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}

/* LoRa - 左下 */
.signal-lora {
  bottom: 2px;
  left: 2px;
}

/* 4G - 右下 */
.signal-4g {
  bottom: 2px;
  right: 2px;
}

/* 信号点 */
.signal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
  position: relative;
}

/* 信号状态颜色 */
.signal-active {
  background-color: #10b981; /* 绿色 - 有信号 */
  box-shadow: 0 0 4px rgba(16, 185, 129, 0.6);
}

.signal-inactive {
  background-color: #fbbf24; /* 黄色 - 临时无信号 */
  box-shadow: 0 0 4px rgba(251, 191, 36, 0.6);
}

.signal-lost {
  background-color: #ef4444; /* 红色 - 连续3次无信号 */
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
  animation: pulse 2s infinite;
}

/* 脉冲动画 */
@keyframes pulse {
  0% {
    box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
  }
  50% {
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
  }
  100% {
    box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
  }
}

/* 信号图标 */
.signal-logo {
  width: 20px;
  height: 20px;
  opacity: 0.9;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

/* 为不同的logo设置不同大小 */
.signal-wifi .signal-logo {
  width: 20px;
  height: 20px;
}

.signal-lora .signal-logo {
  width: 22px;
  height: 22px;
}

.signal-4g .signal-logo {
  width: 20px;
  height: 20px;
}

/* 所有信号丢失时的特殊效果 */
.drone-marker.all-lost {
  animation: shake 0.5s ease-in-out infinite alternate;
}

@keyframes shake {
  0% {
    transform: rotate(-1deg);
  }
  100% {
    transform: rotate(1deg);
  }
}
</style>