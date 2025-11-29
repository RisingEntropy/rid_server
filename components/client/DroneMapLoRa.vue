<template>
  <div class="drone-map-container">
    <!-- 地图加载失败提示 -->
    <div v-if="mapError" class="map-error">
      <div class="error-content">
        <h3>地图加载失败</h3>
        <p>{{ mapError }}</p>
        <button @click="retryInit">重试</button>
      </div>
    </div>
    <!-- 高德地图容器 -->
    <div id="amap-container" class="map-container"></div>
    <!-- 无人机详情弹框 (移除了箭头) -->
    <div
      v-if="selectedDrone && popupPosition"
      class="drone-popup"
      :style="{
        left: popupPosition.x + 'px',
        top: popupPosition.y + 'px'
      }"
    >
      <!-- 关闭按钮 -->
      <button class="popup-close-btn" @click="closePopup">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
        </svg>
      </button>
      <!-- 弹框内容 -->
      <div class="popup-content">
        <h3 class="popup-title">无人机详情</h3>
        <!-- 基本信息 -->
        <div class="popup-section">
          <h4 class="section-title">基本信息</h4>
          <div class="info-row">
            <span class="info-label">序列号：</span>
            <span class="info-value">{{ selectedDrone.serial_number }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">型号：</span>
            <span class="info-value">{{ selectedDrone.model }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">状态：</span>
            <span class="info-value" :class="{ 'online': selectedDrone.status?.is_online }">
              {{ selectedDrone.status?.is_online ? '在线' : '离线' }}
            </span>
          </div>
        </div>
        <!-- 信号质量信息 -->
        <div class="popup-section">
          <h4 class="section-title">LoRa 信号质量</h4>
          <div class="signal-quality-indicator">
            <span class="quality-label">信号：</span>
            <div class="quality-badge" :class="getSignalQualityClass(selectedDrone)">
              {{ getSignalQualityText(selectedDrone) }}
            </div>
          </div>
          <div class="info-row">
            <span class="info-label">RSSI：</span>
            <span class="info-value">
              {{ selectedDrone.signal_info?.last_lora_quality !== null && selectedDrone.signal_info?.last_lora_quality !== undefined
                 ? `${selectedDrone.signal_info.last_lora_quality} dBm`
                 : '无信号' }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">SNR：</span>
            <span class="info-value">{{ getSnrValue(selectedDrone) }}</span>
          </div>
        </div>
        <!-- 位置信息 -->
        <div class="popup-section">
          <h4 class="section-title">位置信息</h4>
          <div class="info-row">
            <span class="info-label">经度：</span>
            <span class="info-value">{{ selectedDrone.last_location_wgs84?.[0]?.toFixed(6) || 'N/A' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">纬度：</span>
            <span class="info-value">{{ selectedDrone.last_location_wgs84?.[1]?.toFixed(6) || 'N/A' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">更新时间：</span>
            <span class="info-value">{{ formatTime(selectedDrone.last_seen_at) }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 左侧可拖动面板 - 只显示列表 -->
    <div
      ref="sidePanel"
      class="side-panel"
      :style="{ width: panelWidth + 'px' }"
    >
      <!-- 拖动手柄 -->
      <div
        class="resize-handle"
        @mousedown="startResize"
      ></div>
      <!-- 面板内容 - 列表视图 -->
      <div class="panel-content">
        <h2 class="panel-title">区域无人机</h2>
        <!-- 统计信息 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-label">总数量：</span>
            <span class="stat-value">{{ drones.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">在线数量：</span>
            <span class="stat-value">{{ onlineDroneCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最后更新：</span>
            <span class="stat-value">{{ lastUpdateTime }}</span>
          </div>
        </div>
        <!-- 自动刷新控制 -->
        <div class="refresh-control">
          <label class="refresh-toggle">
            <input
              type="checkbox"
              v-model="autoRefresh"
              @change="toggleAutoRefresh"
            >
            <span>自动刷新 (2秒)</span>
          </label>
          <button
            class="manual-refresh-btn"
            @click="loadDronesInBounds"
            :disabled="loading"
          >
            {{ loading ? '刷新中...' : '手动刷新' }}
          </button>
        </div>
        <!-- 无人机列表 -->
        <div class="drone-list">
          <h3 class="list-title">无人机列表</h3>
          <div v-if="loading && drones.length === 0" class="loading">
            加载中...
          </div>
          <div v-else-if="drones.length === 0" class="empty">
            当前区域无无人机
          </div>
          <ul v-else class="list">
            <li
              v-for="drone in drones"
              :key="drone.id"
              class="list-item"
              :class="{
                'online': drone.status?.is_online,
                'selected': selectedDrone?.id === drone.id
              }"
              @click="showDroneDetail(drone)"
            >
              <div class="drone-item">
                <div class="drone-header">
                  <span class="drone-serial">{{ drone.serial_number }}</span>
                </div>
                <div class="drone-info">
                  <span class="drone-model">{{ drone.model }}</span>
                  <span class="drone-status" :class="{ 'online': drone.status?.is_online }">
                    {{ drone.status?.is_online ? '在线' : '离线' }}
                  </span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'

// 获取运行时配置
const config = useRuntimeConfig()

// 响应式数据
const map = ref(null)
const markers = ref([])
const labels = ref([]) // 存储文本标签
const drones = ref([])
const loading = ref(false)
const selectedDrone = ref(null)
const panelWidth = ref(320)
const sidePanel = ref(null)
const mapError = ref('')
const autoRefresh = ref(true)
const lastUpdateTime = ref('未更新')
const refreshInterval = ref(null)
const popupPosition = ref(null)

// 添加一个变量来跟踪是否正在拖动地图
let isDraggingMap = false

// 计算属性
const onlineDroneCount = computed(() => {
  return drones.value.filter(d => d.status?.is_online).length
})

// 拖动相关
let isResizing = false
let startX = 0
let startWidth = 0

// 设置高德地图安全配置
if (process.client) {
  window._AMapSecurityConfig = {
    securityJsCode: config.public.amapSecurityKey
  }
}

// 坐标转换函数：GCJ02 转 WGS84
const gcj02ToWgs84 = (lng, lat) => {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  
  const transformLat = (lng, lat) => {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0
    return ret
  }
  
  const transformLng = (lng, lat) => {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0
    return ret
  }
  
  const outOfChina = (lng, lat) => {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
  }
  
  if (outOfChina(lng, lat)) {
    return { lng, lat }
  }
  
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  const mgLat = lat + dLat
  const mgLng = lng + dLng
  
  return {
    lng: lng * 2 - mgLng,
    lat: lat * 2 - mgLat
  }
}

// WGS84 转 GCJ02
const wgs84ToGcj02 = (lng, lat) => {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  
  const transformLat = (lng, lat) => {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0
    return ret
  }
  
  const transformLng = (lng, lat) => {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0
    return ret
  }
  
  const outOfChina = (lng, lat) => {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
  }
  
  if (outOfChina(lng, lat)) {
    return { lng, lat }
  }
  
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  
  return {
    lng: lng + dLng,
    lat: lat + dLat
  }
}

// 获取SNR值
const getSnrValue = (drone) => {
  if (drone.signal_info && drone.signal_info.last_lora_extra && drone.signal_info.last_lora_extra.SNR !== undefined && drone.signal_info.last_lora_extra.SNR !== null) {
    return `${drone.signal_info.last_lora_extra.SNR} dB`
  }
  return '无数据'
}

// 获取信号质量等级
const getSignalQualityClass = (drone) => {
  const rssi = drone.signal_info?.last_lora_quality
  if (rssi === null || rssi === undefined) {
    return 'no-signal'
  }
  if (rssi >= -90) {
    return 'excellent'
  } else if (rssi >= -110) {
    return 'good'
  } else if (rssi >= -125) {
    return 'fair'
  } else {
    return 'poor'
  }
}

// 获取信号质量文本
const getSignalQualityText = (drone) => {
  const rssi = drone.signal_info?.last_lora_quality
  if (rssi === null || rssi === undefined) {
    return '无信号'
  }
  if (rssi >= -90) {
    return '优秀'
  } else if (rssi >= -110) {
    return '良好'
  } else if (rssi >= -125) {
    return '中等'
  } else {
    return '较差'
  }
}

// 更新弹框位置 - 优化版本
const updatePopupPosition = () => {
  if (!selectedDrone.value || !map.value) {
    popupPosition.value = null
    return
  }
  
  const drone = selectedDrone.value
  if (!drone.last_location_gcj02) {
    popupPosition.value = null
    return
  }
  
  // 使用 requestAnimationFrame 确保在下一帧渲染
  requestAnimationFrame(() => {
    const AMap = window.AMap
    const lngLat = new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1])
    const pixel = map.value.lngLatToContainer(lngLat)
    
    if (pixel) {
      popupPosition.value = {
        x: pixel.x + 25,  // 图标右侧 5px 间距
        y: pixel.y - 170  // 垂直居中调整
      }
    }
  })
}

// 优化的显示无人机详情函数 - 只在点击左侧列表时显示弹框
const showDroneDetail = async (drone) => {
  // 立即设置选中的无人机
  selectedDrone.value = drone
  
  if (drone.last_location_gcj02) {
    // 立即计算并显示弹框位置
    await nextTick() // 等待 DOM 更新
    updatePopupPosition()
    
    // 将地图中心移动到该无人机位置
    // map.value.setCenter(drone.last_location_gcj02)
    // // 可选：调整缩放级别
    // if (map.value.getZoom() < 14) {
    //   map.value.setZoom(14)
    // }
  } else {
    popupPosition.value = null
  }
}

// 关闭弹框
const closePopup = () => {
  selectedDrone.value = null
  popupPosition.value = null
}

// 监听地图移动和缩放，更新弹框位置
const setupMapEventListeners = () => {
  if (!map.value) return
  
  // 监听拖动开始
  map.value.on('dragstart', () => {
    isDraggingMap = true
  })
  
  // 监听拖动结束
  map.value.on('dragend', () => {
    isDraggingMap = false
  })
  
  // 使用节流函数优化拖动时的更新
  let dragTimer = null
  map.value.on('dragging', () => {
    if (isDraggingMap && selectedDrone.value) {
      if (dragTimer) clearTimeout(dragTimer)
      dragTimer = setTimeout(() => {
        updatePopupPosition()
      }, 16) // 约60fps
    }
  })
  
  // 缩放和调整大小时更新
  map.value.on('zoomchange', updatePopupPosition)
  map.value.on('resize', updatePopupPosition)
}

// 点击地图空白处关闭弹框
const setupMapClickListener = () => {
  if (!map.value) return
  
  map.value.on('click', (e) => {
    // 检查是否点击在标记上
    let clickedOnMarker = false
    const AMap = window.AMap
    
    markers.value.forEach(marker => {
      const markerPos = marker.getPosition()
      const clickPos = e.lnglat
      const distance = AMap.GeometryUtil.distance(
        [markerPos.lng, markerPos.lat],
        [clickPos.lng, clickPos.lat]
      )
      // 如果点击位置距离标记小于50米，认为是点击在标记上
      if (distance < 50) {
        clickedOnMarker = true
      }
    })
    
    // 如果没有点击在标记上，关闭弹框
    if (!clickedOnMarker) {
      closePopup()
    }
  })
}

// 初始化地图
const initMap = async () => {
  try {
    mapError.value = ''
    
    if (!config.public.amapKey) {
      throw new Error('高德地图密钥未配置')
    }
    
    const AMap = await AMapLoader.load({
      key: config.public.amapKey,
      version: '2.0',
      plugins: ['AMap.Marker', 'AMap.InfoWindow', 'AMap.GeometryUtil', 'AMap.Text']
    })
    
    map.value = new AMap.Map('amap-container', {
      zoom: 11,
      center: [114.17, 22.32],
      mapStyle: 'amap://styles/normal'
    })
    
    // 设置事件监听
    setupMapEventListeners()
    setupMapClickListener()
    
    map.value.on('moveend', debounce(handleMapChange, 500))
    map.value.on('zoomend', debounce(handleMapChange, 500))
    
    await loadDronesInBounds()
    
    if (autoRefresh.value) {
      startAutoRefresh()
    }
  } catch (error) {
    console.error('地图初始化失败:', error)
    mapError.value = error.message || '地图加载失败，请检查网络连接'
  }
}

// 处理地图变化事件
const handleMapChange = async () => {
  stopAutoRefresh()
  await loadDronesInBounds()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
}

// 加载范围内的无人机
const loadDronesInBounds = async () => {
  if (!map.value) return
  
  if (loading.value) {
    console.log('正在加载中，跳过本次请求')
    return
  }
  
  loading.value = true
  
  try {
    const bounds = map.value.getBounds()
    const southwest = bounds.getSouthWest()
    const northeast = bounds.getNorthEast()
    
    const swWgs84 = gcj02ToWgs84(southwest.getLng(), southwest.getLat())
    const neWgs84 = gcj02ToWgs84(northeast.getLng(), northeast.getLat())
    
    const data = await $fetch('/api/query-drones', {
      params: {
        sw_lng: swWgs84.lng,
        sw_lat: swWgs84.lat,
        ne_lng: neWgs84.lng,
        ne_lat: neWgs84.lat,
        minutes: 60
      }
    })
    
    console.log(data)
    
    if (data?.drones) {
      const dronesWithGcj02 = data.drones.map(drone => {
        if (drone.last_location && drone.last_location.length === 2) {
          const gcj02Coords = wgs84ToGcj02(drone.last_location[0], drone.last_location[1])
          return {
            ...drone,
            last_location_gcj02: [gcj02Coords.lng, gcj02Coords.lat],
            last_location_wgs84: drone.last_location
          }
        }
        return drone
      })
      
      drones.value = dronesWithGcj02
      updateMarkers(dronesWithGcj02)
      updateLastUpdateTime()
      
      // 如果有选中的无人机，更新其信息并更新弹框位置
      if (selectedDrone.value) {
        const updatedDrone = dronesWithGcj02.find(d => d.id === selectedDrone.value.id)
        if (updatedDrone) {
          selectedDrone.value = updatedDrone
          updatePopupPosition()
        } else {
          // 如果选中的无人机不在当前范围内，关闭弹框
          closePopup()
        }
      }
    }
  } catch (error) {
    console.error('查询无人机失败:', error)
  } finally {
    loading.value = false
  }
}

// 创建无人机标记 - 移除点击事件，添加文本标签
const createDroneMarker = (drone) => {
  const AMap = window.AMap
  
  const icon = new AMap.Icon({
    size: new AMap.Size(40, 40),
    image: '/drone_logo.svg',
    imageSize: new AMap.Size(40, 40)
  })
  
  const marker = new AMap.Marker({
    position: new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]),
    icon: icon,
    offset: new AMap.Pixel(-20, -20),
    extData: {
      droneId: drone.id,
      droneData: drone
    }
  })
  
  // 创建文本标签显示无人机名称
  const label = new AMap.Text({
    text: drone.serial_number || '未知',
    position: new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]),
    offset: new AMap.Pixel(0, 10), // 偏移到图标下方
    style: {
      'padding': '2px 6px',
      'background-color': drone.status?.is_online ? 'rgba(16, 185, 129, 0.9)' : 'rgba(107, 114, 128, 0.9)',
      'border': 'none',
      'border-radius': '4px',
      'color': '#ffffff',
      'font-size': '12px',
      'font-weight': '500',
      'text-align': 'center',
      'white-space': 'nowrap'
    }
  })
  
  return { marker, label }
}

// 更新地图标记
const updateMarkers = (droneList) => {
  if (!map.value) return
  
  const existingMarkers = new Map()
  const existingLabels = new Map()
  
  markers.value.forEach(marker => {
    const droneId = marker.getExtData()?.droneId
    if (droneId) {
      existingMarkers.set(droneId, marker)
    }
  })
  
  labels.value.forEach(label => {
    const droneId = label.getExtData()?.droneId
    if (droneId) {
      existingLabels.set(droneId, label)
    }
  })
  
  const newMarkers = []
  const newLabels = []
  const currentDroneIds = new Set()
  
  droneList.forEach(drone => {
    if (!drone.last_location_gcj02) return
    
    currentDroneIds.add(drone.id)
    
    const existingMarker = existingMarkers.get(drone.id)
    const existingLabel = existingLabels.get(drone.id)
    
    if (existingMarker) {
      // 更新现有标记位置
      const AMap = window.AMap
      existingMarker.setPosition(new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]))
      existingMarker.setExtData({
        droneId: drone.id,
        droneData: drone
      })
      newMarkers.push(existingMarker)
      existingMarkers.delete(drone.id)
      
      // 更新文本标签
      if (existingLabel) {
        existingLabel.setPosition(new AMap.LngLat(drone.last_location_gcj02[0], drone.last_location_gcj02[1]))
        existingLabel.setText(drone.serial_number || '未知')
        existingLabel.setStyle({
          'padding': '2px 6px',
          'background-color': drone.status?.is_online ? 'rgba(16, 185, 129, 0.9)' : 'rgba(107, 114, 128, 0.9)',
          'border': 'none',
          'border-radius': '4px',
          'color': '#ffffff',
          'font-size': '12px',
          'font-weight': '500',
          'text-align': 'center',
          'white-space': 'nowrap'
        })
        existingLabel.setExtData({
          droneId: drone.id
        })
        newLabels.push(existingLabel)
        existingLabels.delete(drone.id)
      }
    } else {
      // 创建新标记和标签
      const { marker, label } = createDroneMarker(drone)
      label.setExtData({
        droneId: drone.id
      })
      newMarkers.push(marker)
      newLabels.push(label)
      map.value.add(marker)
      map.value.add(label)
    }
  })
  
  // 移除不存在的标记
  existingMarkers.forEach(marker => {
    map.value.remove(marker)
  })
  
  // 移除不存在的标签
  existingLabels.forEach(label => {
    map.value.remove(label)
  })
  
  markers.value = newMarkers
  labels.value = newLabels
}

// 更新最后更新时间
const updateLastUpdateTime = () => {
  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const seconds = now.getSeconds().toString().padStart(2, '0')
  lastUpdateTime.value = `${hours}:${minutes}:${seconds}`
}

// 启动自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshInterval.value = setInterval(() => {
    console.log('自动刷新数据...')
    loadDronesInBounds()
  }, 2000)
  console.log('自动刷新已启动')
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
    console.log('自动刷新已停止')
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// 开始调整面板宽度
const startResize = (e) => {
  isResizing = true
  startX = e.clientX
  startWidth = panelWidth.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.userSelect = 'none'
}

// 处理面板宽度调整
const handleResize = (e) => {
  if (!isResizing) return
  
  const diff = e.clientX - startX
  const newWidth = startWidth + diff
  panelWidth.value = Math.min(Math.max(newWidth, 250), 600)
}

// 停止调整面板宽度
const stopResize = () => {
  isResizing = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

// 防抖函数
const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// 重试初始化
const retryInit = () => {
  mapError.value = ''
  initMap()
}

// 生命周期
onMounted(() => {
  initMap()
})

onUnmounted(() => {
  stopAutoRefresh()
  if (map.value) {
    map.value.destroy()
  }
})
</script>

<style scoped>
/* 保持原有样式不变，这里只包含修改的样式 */
.drone-map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 错误提示 */
.map-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.error-content h3 {
  color: #ef4444;
  margin-bottom: 10px;
}

.error-content p {
  color: #666;
  margin-bottom: 20px;
}

.error-content button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.error-content button:hover {
  background: #2563eb;
}

/* 无人机详情弹框 - 添加过渡动画 */
.drone-popup {
  position: absolute;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 500;
  min-width: 320px;
  max-width: 400px;
  pointer-events: auto;
  border: 1px solid rgba(0,0,0,0.05);
  animation: popupFadeIn 0.2s ease;
  will-change: transform, opacity;
}

@keyframes popupFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 关闭按钮 */
.popup-close-btn {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 1;
}

.popup-close-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

/* 弹框内容 */
.popup-content {
  padding: 20px;
  max-height: 600px;
  overflow-y: auto;
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 20px;
  padding-right: 30px;
}

.popup-section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.popup-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.popup-section .section-title {
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 左侧面板 */
.side-panel {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
}

.resize-handle {
  position: absolute;
  right: -3px;
  top: 0;
  width: 6px;
  height: 100%;
  background: transparent;
  cursor: ew-resize;
  z-index: 101;
}

.resize-handle:hover {
  background: rgba(59, 130, 246, 0.3);
}

.panel-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.panel-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
}

/* 信号质量指示器 */
.signal-quality-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 12px;
}

.quality-label {
  color: #666;
  font-size: 13px;
  font-weight: 500;
}

.quality-badge {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-badge.excellent {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
}

.quality-badge.good {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
}

.quality-badge.fair {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
}

.quality-badge.poor {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
}

.quality-badge.no-signal {
  background: linear-gradient(135deg, #6b7280, #4b5563);
  color: white;
}

/* 统计信息 */
.stats-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

.stat-label {
  color: #666;
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 16px;
}

/* 刷新控制 */
.refresh-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
}

.refresh-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.refresh-toggle input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}

.refresh-toggle span {
  font-size: 14px;
  color: #333;
}

.manual-refresh-btn {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.manual-refresh-btn:hover:not(:disabled) {
  background: #2563eb;
}

.manual-refresh-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

/* 无人机列表 */
.drone-list {
  flex: 1;
}

.list-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 15px;
  color: #333;
}

.loading,
.empty {
  text-align: center;
  color: #999;
  padding: 20px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.list-item:hover {
  background: #f8f9fa;
  border-color: #3b82f6;
  transform: translateX(3px);
}

.list-item.online {
  border-left: 3px solid #10b981;
}

.list-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.drone-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drone-serial {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.drone-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drone-model {
  font-size: 12px;
  color: #666;
}

.drone-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fee2e2;
  color: #dc2626;
}

.drone-status.online {
  background: #d1fae5;
  color: #065f46;
}

/* 信息行 */
.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f3f4f6;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: #6b7280;
  font-size: 13px;
}

.info-value {
  color: #1f2937;
  font-weight: 500;
  font-size: 13px;
}

.info-value.online {
  color: #10b981;
}

/* 滚动条样式 */
.popup-content::-webkit-scrollbar,
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.popup-content::-webkit-scrollbar-track,
.panel-content::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 3px;
}

.popup-content::-webkit-scrollbar-thumb,
.panel-content::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.popup-content::-webkit-scrollbar-thumb:hover,
.panel-content::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>