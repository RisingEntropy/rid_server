<template>
  <div class="drone-trajectory-container">
    <!-- 左侧控制面板 -->
    <div class="control-panel">
      <h3 class="panel-title">
        <el-icon :size="20" style="vertical-align: middle; margin-right: 8px;">
          <Location />
        </el-icon>
        4G轨迹查询
      </h3>
      
      <!-- 序列号输入 -->
      <div class="form-group">
        <label>
          <el-icon><Search /></el-icon>
          无人机序列号
        </label>
        <el-autocomplete
          v-model="queryForm.serialNumber"
          :fetch-suggestions="handleSNSearch"
          :trigger-on-focus="true"
          :debounce="300"
          placeholder="请输入无人机序列号..."
          clearable
          @select="handleSNSelect"
          style="width: 100%"
        >
          <template #default="{ item }">
            <div class="suggestion-item-content">
              <div class="sn-main">
                <el-icon class="sn-icon"><Promotion /></el-icon>
                <span class="sn-text">{{ item.serialNumber }}</span>
              </div>
              <div class="sn-meta">
                <el-tag size="small" type="info">{{ item.model || '未知型号' }}</el-tag>
                <span v-if="item.last_seen_at" class="last-seen">
                  最后上线: {{ formatLastSeen(item.last_seen_at) }}
                </span>
              </div>
            </div>
          </template>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-autocomplete>
      </div>
      
      <!-- 查询条数 -->
      <div class="form-group">
        <label>
          <el-icon><DataLine /></el-icon>
          最大查询条目
        </label>
        <el-input-number
          v-model="queryForm.limit"
          :min="1"
          :max="10000"
          :step="100"
          style="width: 100%"
        />
      </div>
      
      <!-- 时间范围选择 -->
      <div class="form-group">
        <label>
          <el-icon><Clock /></el-icon>
          时间范围
        </label>
        <el-radio-group v-model="timeMode" style="width: 100%">
          <el-radio-button label="minutes">最近时间</el-radio-button>
          <el-radio-button label="range">时间范围</el-radio-button>
        </el-radio-group>
        
        <!-- 最近X分钟 -->
        <div v-if="timeMode === 'minutes'" style="margin-top: 12px">
          <el-input v-model.number="queryForm.minutes" type="number" min="1">
            <template #append>分钟</template>
          </el-input>
        </div>
        
        <!-- 时间范围 -->
        <div v-if="timeMode === 'range'" style="margin-top: 12px">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </div>
      </div>
      
      <!-- 查询按钮 -->
      <el-button
        type="primary"
        @click="queryTrajectory"
        :loading="loading"
        :disabled="!queryForm.serialNumber"
        style="width: 100%"
        size="large"
      >
        <el-icon style="margin-right: 5px"><Search /></el-icon>
        {{ loading ? '查询中...' : '查询轨迹' }}
      </el-button>
      
      <!-- 基站筛选 -->
      <div v-if="baseStations.size > 0" class="form-group base-station-filter">
        <label>
          <el-icon><Filter /></el-icon>
          基站筛选
        </label>
        <el-select 
          v-model="selectedCellId" 
          placeholder="选择基站"
          clearable
          style="width: 100%"
          @change="handleCellIdChange"
        >
          <el-option label="全部基站" value="all">
            <span>全部基站</span>
            <el-badge :value="trajectoryPoints.length" type="info" style="margin-left: 10px" />
          </el-option>
          <el-option-group 
            v-for="[baseId, cells] in groupedBaseStations" 
            :key="baseId"
            :label="`基站 ${baseId}`"
          >
            <el-option 
              v-for="cellInfo in cells" 
              :key="cellInfo.fullId"
              :label="`${cellInfo.fullId}`"
              :value="cellInfo.fullId"
            >
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span>
                  <span v-html="getShapeSvgSmall(cellInfo.shape, cellInfo.color)"></span>
                  {{ cellInfo.fullId }}
                  <span style="color: #909399; font-size: 12px; margin-left: 4px;">
                    (小区 {{ cellInfo.sectorId }})
                  </span>
                </span>
                <el-badge :value="getCellIdCount(cellInfo.fullId)" type="primary" />
              </div>
            </el-option>
          </el-option-group>
        </el-select>
      </div>
      
      <!-- 查询结果统计 -->
      <div v-if="droneInfo" class="stats">
        <el-card shadow="never">
          <template #header>
            <div class="stats-header">
              <el-icon><DataAnalysis /></el-icon>
              <span>统计信息</span>
            </div>
          </template>
          <div class="stat-item">
            <span class="stat-label">序列号：</span>
            <el-tag>{{ droneInfo.serial_number }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">型号：</span>
            <el-tag>{{ droneInfo.model || '未知' }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">总轨迹点：</span>
            <el-tag type="info">{{ totalPoints }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">有效4G点：</span>
            <el-tag :type="trajectoryPoints.length > 0 ? 'success' : 'warning'">
              {{ trajectoryPoints.length }}
            </el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">显示点数：</span>
            <el-tag :type="filteredPoints.length > 0 ? 'success' : 'danger'">
              {{ filteredPoints.length }}
            </el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">基站数量：</span>
            <el-tag type="primary">{{ uniqueBaseStationCount }}</el-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">小区数量：</span>
            <el-tag type="success">{{ baseStations.size }}</el-tag>
          </div>
          <div v-if="droneInfo.last_seen_at" class="stat-item">
            <span class="stat-label">最后上线：</span>
            <el-tooltip :content="formatTime(droneInfo.last_seen_at)" placement="top">
              <el-tag type="info" style="cursor: pointer">
                {{ formatLastSeen(droneInfo.last_seen_at) }}
              </el-tag>
            </el-tooltip>
          </div>
        </el-card>
      </div>
      
      <!-- 基站图例 -->
      <div v-if="baseStations.size > 0" class="legend-panel">
        <el-card shadow="never">
          <template #header>
            <div class="stats-header">
              <el-icon><Grid /></el-icon>
              <span>基站图例</span>
            </div>
          </template>
          <!-- 按基站分组显示 -->
          <div v-for="[baseId, cells] in groupedBaseStations" :key="baseId" class="base-station-group">
            <div class="base-station-header">
              <el-icon><Connection /></el-icon>
              基站 {{ baseId }}
            </div>
            <div v-for="cellInfo in cells" :key="cellInfo.fullId" class="legend-item">
              <span class="legend-shape" v-html="getShapeSvg(cellInfo.shape, cellInfo.color)"></span>
              <span class="legend-text">
                {{ cellInfo.fullId }}
                <span class="sector-label">小区 {{ cellInfo.sectorId }}</span>
              </span>
              <el-badge :value="getCellIdCount(cellInfo.fullId)" type="primary" style="margin-left: auto" />
            </div>
          </div>
        </el-card>
      </div>
      
      <!-- 曲线图面板 -->
      <div v-if="trajectoryPoints.length > 0" class="charts-panel">
        <el-card shadow="never">
          <template #header>
            <div class="stats-header">
              <el-icon><TrendCharts /></el-icon>
              <span>信号参数曲线</span>
            </div>
          </template>
          <div class="charts-container">
            <!-- RSRP曲线 -->
            <div class="chart-item">
              <div class="chart-title">RSRP (dBm)</div>
              <div 
                class="chart-wrapper"
                @click="handleChartAreaClick($event, 'rsrp')"
                @mousemove="handleChartAreaMouseMove($event, 'rsrp')"
                @mouseleave="handleChartAreaMouseLeave"
              >
                <v-chart 
                  ref="rsrpChartRef"
                  class="chart" 
                  :option="rsrpChartOption" 
                  :autoresize="true"
                />
              </div>
            </div>
            
            <!-- RSRQ曲线 -->
            <div class="chart-item">
              <div class="chart-title">RSRQ (dB)</div>
              <div 
                class="chart-wrapper"
                @click="handleChartAreaClick($event, 'rsrq')"
                @mousemove="handleChartAreaMouseMove($event, 'rsrq')"
                @mouseleave="handleChartAreaMouseLeave"
              >
                <v-chart 
                  ref="rsrqChartRef"
                  class="chart" 
                  :option="rsrqChartOption"
                  :autoresize="true"
                />
              </div>
            </div>
            
            <!-- SINR曲线 -->
            <div class="chart-item">
              <div class="chart-title">SINR (dB)</div>
              <div 
                class="chart-wrapper"
                @click="handleChartAreaClick($event, 'sinr')"
                @mousemove="handleChartAreaMouseMove($event, 'sinr')"
                @mouseleave="handleChartAreaMouseLeave"
              >
                <v-chart 
                  ref="sinrChartRef"
                  class="chart" 
                  :option="sinrChartOption"
                  :autoresize="true"
                />
              </div>
            </div>
            
            <!-- 信号强度曲线 -->
            <div class="chart-item">
              <div class="chart-title">RSSI (dBm)</div>
              <div 
                class="chart-wrapper"
                @click="handleChartAreaClick($event, 'signal')"
                @mousemove="handleChartAreaMouseMove($event, 'signal')"
                @mouseleave="handleChartAreaMouseLeave"
              >
                <v-chart 
                  ref="signalChartRef"
                  class="chart" 
                  :option="signalChartOption"
                  :autoresize="true"
                />
              </div>
            </div>
            
            <!-- 高度曲线 -->
            <div class="chart-item">
              <div class="chart-title">高度 (m)</div>
              <div 
                class="chart-wrapper"
                @click="handleChartAreaClick($event, 'altitude')"
                @mousemove="handleChartAreaMouseMove($event, 'altitude')"
                @mouseleave="handleChartAreaMouseLeave"
              >
                <v-chart 
                  ref="altitudeChartRef"
                  class="chart" 
                  :option="altitudeChartOption"
                  :autoresize="true"
                />
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
    
    <!-- 地图容器 -->
    <div id="trajectory-map" class="map-container"></div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search, 
  Location, 
  Clock, 
  Filter, 
  DataAnalysis,
  Promotion,
  DataLine,
  Grid,
  Connection,
  TrendCharts
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  MarkLineComponent,
  LegendComponent
} from 'echarts/components'

// 注册ECharts组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  MarkLineComponent,
  LegendComponent
])

// Nuxt 3 Composition API 方式获取运行时配置
const { $config } = useNuxtApp()

// Chart refs
const rsrpChartRef = ref(null)
const rsrqChartRef = ref(null)
const sinrChartRef = ref(null)
const signalChartRef = ref(null)
const altitudeChartRef = ref(null)

// 当前选中的数据点索引
const selectedPointIndex = ref(null)
const hoveredPointIndex = ref(null)

// 形状定义
const CELL_SHAPES = ['circle', 'triangle', 'star', 'hexagon']

// 坐标转换工具类
class CoordinateTransform {
  static x_PI = 3.14159265358979324 * 3000.0 / 180.0
  static PI = 3.1415926535897932384626
  static a = 6378245.0  // 长半轴
  static ee = 0.00669342162296594323  // 偏心率平方

  static wgs84togcj02(lng, lat) {
    if (this.out_of_china(lng, lat)) {
      return [lng, lat]
    }
    let dlat = this.transformlat(lng - 105.0, lat - 35.0)
    let dlng = this.transformlng(lng - 105.0, lat - 35.0)
    let radlat = lat / 180.0 * this.PI
    let magic = Math.sin(radlat)
    magic = 1 - this.ee * magic * magic
    let sqrtmagic = Math.sqrt(magic)
    dlat = (dlat * 180.0) / ((this.a * (1 - this.ee)) / (magic * sqrtmagic) * this.PI)
    dlng = (dlng * 180.0) / (this.a / sqrtmagic * Math.cos(radlat) * this.PI)
    let mglat = lat + dlat
    let mglng = lng + dlng
    return [mglng, mglat]
  }

  static transformlat(lng, lat) {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * this.PI) + 20.0 * Math.sin(2.0 * lng * this.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lat * this.PI) + 40.0 * Math.sin(lat / 3.0 * this.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(lat / 12.0 * this.PI) + 320 * Math.sin(lat * this.PI / 30.0)) * 2.0 / 3.0
    return ret
  }

  static transformlng(lng, lat) {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
    ret += (20.0 * Math.sin(6.0 * lng * this.PI) + 20.0 * Math.sin(2.0 * lng * this.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(lng * this.PI) + 40.0 * Math.sin(lng / 3.0 * this.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(lng / 12.0 * this.PI) + 300.0 * Math.sin(lng / 30.0 * this.PI)) * 2.0 / 3.0
    return ret
  }

  static out_of_china(lng, lat) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
  }
}

// 查询表单
const queryForm = reactive({
  serialNumber: '',
  limit: 1000000,
  minutes: 600000
})

// 数据状态
const loading = ref(false)
const droneInfo = ref(null)
const trajectoryPoints = ref([])
const baseStations = ref(new Map())
const totalPoints = ref(0)
const timeMode = ref('minutes')
const dateRange = ref([])
const selectedCellId = ref('all')

// 地图相关
let map = null
let AMap = null
let polyline = null
let markers = []
let circleMarkers = []
let currentInfoWindow = null
const baseStationSectorShapeMap = new Map()
// 获取小区形状
const getCellShape = (baseId, sectorId) => {
  // 如果基站没有记录，创建一个新的Map
  if (!baseStationSectorShapeMap.has(baseId)) {
    baseStationSectorShapeMap.set(baseId, new Map())
  }
  
  const sectorMap = baseStationSectorShapeMap.get(baseId)
  
  // 如果这个小区已经分配了形状，直接返回
  if (sectorMap.has(sectorId)) {
    return CELL_SHAPES[sectorMap.get(sectorId)]
  }
  
  // 为新的小区分配形状
  // 获取当前基站已经分配的小区数量
  const assignedCount = sectorMap.size
  // 分配形状索引（0, 1, 2循环）
  const shapeIndex = assignedCount % 4
  
  // 记录分配结果
  sectorMap.set(sectorId, shapeIndex)
  
  return CELL_SHAPES[shapeIndex]
}

// 生成五角星点坐标
const generateStarPoints = (cx, cy, outerRadius, innerRadius, points) => {
  let angle = Math.PI / points
  let coords = []
  
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const x = cx + Math.cos(angle * i - Math.PI / 2) * radius
    const y = cy + Math.sin(angle * i - Math.PI / 2) * radius
    coords.push(`${x},${y}`)
  }
  
  return coords.join(' ')
}

// 获取形状SVG
const getShapeSvg = (shape, color) => {
  const size = 20
  const halfSize = size / 2
  
  switch(shape) {
    case 'circle':
      return `<svg width="${size}" height="${size}" style="vertical-align: middle;">
        <circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - 2}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>`
    
    case 'triangle':
      return `<svg width="${size}" height="${size}" style="vertical-align: middle;">
        <polygon points="${halfSize},2 ${size-2},${size-2} 2,${size-2}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>`
    
    case 'star':
      const starPoints = generateStarPoints(halfSize, halfSize, halfSize - 2, (halfSize - 2) * 0.4, 5)
      return `<svg width="${size}" height="${size}" style="vertical-align: middle;">
        <polygon points="${starPoints}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>`

    case 'rectangle':
      return `<svg width="${size}" height="${size}" style="vertical-align: middle;">
        <rect x="2" y="2" width="${size-4}" height="${size-4}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>`
    
    case 'hexagon': // 正六边形
      return `<svg width="${size}" height="${size}" style="vertical-align: middle;">
        <polygon points="${halfSize},4 ${size-4},${size/4} ${size-4},${(size*3)/4} ${halfSize},${size-4} 4,${(size*3)/4} 4,${size/4}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>`
    default:
      return getShapeSvg('circle', color)
  }
}

// 获取小形状SVG（用于下拉列表）
const getShapeSvgSmall = (shape, color) => {
  const size = 16
  const halfSize = size / 2
  
  switch(shape) {
    case 'circle':
      return `<svg width="${size}" height="${size}" style="vertical-align: middle; margin-right: 4px;">
        <circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - 2}" 
          fill="${color}" stroke="#fff" stroke-width="1.5"/>
      </svg>`
    
    case 'triangle':
      return `<svg width="${size}" height="${size}" style="vertical-align: middle; margin-right: 4px;">
        <polygon points="${halfSize},2 ${size-2},${size-2} 2,${size-2}" 
          fill="${color}" stroke="#fff" stroke-width="1.5"/>
      </svg>`
    
    case 'star':
      const starPoints = generateStarPoints(halfSize, halfSize, halfSize - 2, (halfSize - 2) * 0.4, 5)
      return `<svg width="${size}" height="${size}" style="vertical-align: middle; margin-right: 4px;">
        <polygon points="${starPoints}" 
          fill="${color}" stroke="#fff" stroke-width="1.5"/>
      </svg>`
    
    default:
      return getShapeSvgSmall('circle', color)
  }
}

// 生成基站颜色
const generateBaseColor = (baseIndex) => {
  const colors = [
    '#FF4444',  // 红色
    '#FF8800',  // 橙色
    '#FFD700',  // 金色
    '#00DD00',  // 绿色
    '#00DDDD',  // 青色
    '#0088FF',  // 蓝色
    '#8844FF',  // 紫色
    '#FF44FF',  // 品红色
    '#FF6B9D',  // 粉红色
    '#66BB6A',  // 浅绿色
    '#42A5F5',  // 浅蓝色
    '#FF7043',  // 深橙色
    '#9CCC65',  // 亮绿色
    '#5C6BC0',  // 靛蓝色
    '#EC407A',  // 玫瑰色
    '#26A69A',  // 青绿色
    '#FFA726',  // 琥珀色
    '#7E57C2',  // 深紫色
    '#29B6F6',  // 亮蓝色
  ]
  
  return colors[baseIndex % colors.length]
}

// 解析基站ID和小区ID
const parseCellId = (cellIdHex) => {
  if (!cellIdHex || cellIdHex === 'unknown' || cellIdHex.length < 7) {
    return {
      baseId: 'unknown',
      sectorId: '00',
      fullId: cellIdHex || 'unknown'
    }
  }
  
  const paddedId = cellIdHex.toUpperCase().padStart(7, '0')
  const baseId = paddedId.substring(0, 5)
  const sectorId = paddedId.substring(5, 7)
  
  return {
    baseId,
    sectorId,
    fullId: paddedId
  }
}

// 创建标记图标
const createMarkerIcon = (shape, color) => {
  const size = 18
  let svgContent = ''
  
  if (shape === 'triangle') {
    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${size/2},4 ${size-4},${size-4} 4,${size-4}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>
    `
  } else if (shape === 'star') {
    const starPoints = generateStarPoints(size/2, size/2, size/2-2, (size/2-2)*0.4, 5)
    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${starPoints}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>
    `
  }else if (shape === 'hexagon') {
    // 正六边形
    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${size/2},4 ${size-4},${size/4} ${size-4},${(size*3)/4} ${size/2},${size-4} 4,${(size*3)/4} 4,${size/4}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>
    `
  } else if (shape === 'rectangle') {
    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="${size-4}" height="${size-4}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>
    `
  } else { // 默认圆形
    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${(size/2)-2}" 
          fill="${color}" stroke="#fff" stroke-width="1"/>
      </svg>
    `
  }
  
  return `<div style="width: ${size}px; height: ${size}px;">${svgContent}</div>`
}

// 按基站分组的计算属性
const groupedBaseStations = computed(() => {
  const grouped = new Map()
  
  baseStations.value.forEach((info, cellId) => {
    const parsed = parseCellId(cellId)
    
    if (!grouped.has(parsed.baseId)) {
      grouped.set(parsed.baseId, [])
    }
    
    grouped.get(parsed.baseId).push({
      fullId: parsed.fullId,
      sectorId: parsed.sectorId,
      color: info.color,
      shape: info.shape
    })
  })
  
  grouped.forEach((cells, baseId) => {
    cells.sort((a, b) => a.sectorId.localeCompare(b.sectorId))
  })
  
  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))
})

// 计算唯一基站数量
const uniqueBaseStationCount = computed(() => {
  const uniqueBaseIds = new Set()
  baseStations.value.forEach((_, cellId) => {
    const parsed = parseCellId(cellId)
    uniqueBaseIds.add(parsed.baseId)
  })
  return uniqueBaseIds.size
})

// 计算过滤后的轨迹点
const filteredPoints = computed(() => {
  if (selectedCellId.value === 'all') {
    return trajectoryPoints.value
  }
  return trajectoryPoints.value.filter(point => point.cellId === selectedCellId.value)
})

// 创建基础图表配置
const createBaseChartOption = (data, yAxisName, color = '#409EFF') => {
  const markLineData = hoveredPointIndex.value !== null ? [{
    xAxis: hoveredPointIndex.value,
    lineStyle: {
      color: '#E6A23C',
      width: 2,
      type: 'solid'
    },
    label: {
      show: false
    }
  }] : []

  return {
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove',
      formatter: (params) => {
        if (params && params.length > 0) {
          const point = trajectoryPoints.value[params[0].dataIndex]
          const value = params[0].value
          return `
            <div style="padding: 8px;">
              <div><b>时间:</b> ${formatTime(point.timestamp)}</div>
              <div><b>${yAxisName}:</b> ${value !== null && value !== undefined ? value : 'N/A'}</div>
              <div><b>基站:</b> ${point.cellId}</div>
            </div>
          `
        }
        return ''
      }
    },
    grid: {
      left: '15%',
      right: '5%',
      top: '10%',
      bottom: '10%'
    },
    xAxis: {
      type: 'category',
      data: trajectoryPoints.value.map((_, index) => index + 1),
      axisLabel: {
        interval: Math.floor(trajectoryPoints.value.length / 10) || 1,
        fontSize: 10
      },
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      name: yAxisName,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: {
        fontSize: 11
      },
      axisLabel: {
        fontSize: 10
      },
      scale: true
    },
    series: [{
      data: data,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 2,
      lineStyle: {
        color: color,
        width: 2
      },
      itemStyle: {
        color: color
      },
      connectNulls: true,
      markLine: {
        silent: true,
        symbol: 'none',
        data: markLineData,
        animation: false
      }
    }]
  }
}

// 计算图表数据
const rsrpChartOption = computed(() => {
  const data = trajectoryPoints.value.map(p => p.extraInfo?.rsrp)
  return createBaseChartOption(data, 'RSRP (dBm)', '#67C23A')
})

const rsrqChartOption = computed(() => {
  const data = trajectoryPoints.value.map(p => p.extraInfo?.rsrq)
  return createBaseChartOption(data, 'RSRQ (dB)', '#E6A23C')
})

const sinrChartOption = computed(() => {
  const data = trajectoryPoints.value.map(p => p.extraInfo?.sinr)
  return createBaseChartOption(data, 'SINR (dB)', '#909399')
})

const signalChartOption = computed(() => {
  const data = trajectoryPoints.value.map(p => parseCsqToRssi(p.signalQuality))
  return createBaseChartOption(data, 'RSSI (dBm)', '#409EFF')
})

const altitudeChartOption = computed(() => {
  const data = trajectoryPoints.value.map(p => p.altitude)
  return createBaseChartOption(data, '高度 (m)', '#F56C6C')
})

// 获取图表引用
const getChartRef = (chartType) => {
  switch(chartType) {
    case 'rsrp': return rsrpChartRef.value
    case 'rsrq': return rsrqChartRef.value
    case 'sinr': return sinrChartRef.value
    case 'signal': return signalChartRef.value
    case 'altitude': return altitudeChartRef.value
    default: return null
  }
}

// 处理图表区域鼠标移动
const handleChartAreaMouseMove = (event, chartType) => {
  const chart = getChartRef(chartType)
  if (!chart || !chart.chart) return
  
  const chartInstance = chart.chart
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  
  const grid = chartInstance.getModel().getComponent('grid')
  const gridRect = grid.coordinateSystem.getRect()
  
  const totalPoints = trajectoryPoints.value.length
  const relativeX = x - gridRect.x
  const gridWidth = gridRect.width
  
  if (relativeX >= 0 && relativeX <= gridWidth) {
    const index = Math.round((relativeX / gridWidth) * (totalPoints - 1))
    if (index >= 0 && index < totalPoints) {
      hoveredPointIndex.value = index
    }
  }
}

// 处理图表区域鼠标离开
const handleChartAreaMouseLeave = () => {
  hoveredPointIndex.value = null
}

// 处理图表区域点击
const handleChartAreaClick = (event, chartType) => {
  const chart = getChartRef(chartType)
  if (!chart || !chart.chart) return
  
  const chartInstance = chart.chart
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  
  const grid = chartInstance.getModel().getComponent('grid')
  const gridRect = grid.coordinateSystem.getRect()
  
  const totalPoints = trajectoryPoints.value.length
  const relativeX = x - gridRect.x
  const gridWidth = gridRect.width
  
  if (relativeX >= 0 && relativeX <= gridWidth) {
    const index = Math.round((relativeX / gridWidth) * (totalPoints - 1))
    if (index >= 0 && index < totalPoints) {
      const point = trajectoryPoints.value[index]
      if (point && map) {
        map.setCenter([point.lng, point.lat])
        map.setZoom(16)
        showPointInfoWindow(point)
        selectedPointIndex.value = index
      }
    }
  }
}

// 监听过滤点变化
watch(filteredPoints, (newPoints) => {
  if (map && newPoints.length > 0) {
    drawTrajectory()
  } else if (map && newPoints.length === 0) {
    clearMapLayers()
    ElMessage.warning('当前筛选条件下无轨迹数据')
  }
})

// 初始化地图
const initMap = async () => {
  try {
    window._AMapSecurityConfig = {
      securityJsCode: $config.public.amapSecurityCode
    }
    
    AMap = await AMapLoader.load({
      key: $config.public.amapKey,
      version: '2.0',
      plugins: [
        'AMap.Scale', 
        'AMap.ToolBar', 
        'AMap.Marker', 
        'AMap.Polyline', 
        'AMap.CircleMarker',
        'AMap.InfoWindow',
        'AMap.Icon'
      ]
    })
    
    map = new AMap.Map('trajectory-map', {
      viewMode: '2D',
      zoom: 13,
      center: [114.27, 22.32]
    })
    
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({
      position: 'RT'
    }))
    
    ElMessage.success('地图加载成功')
  } catch (error) {
    console.error('地图加载失败:', error)
    ElMessage.error('地图加载失败，请检查配置')
  }
}

// 处理序列号搜索
const handleSNSearch = async (queryString, cb) => {
  if (queryString.length < 2) {
    cb([])
    return
  }
  
  try {
    const { data } = await $fetch(`/api/query-drone-sns`, {
      params: { sn: queryString }
    })
    
    const results = (data || []).map(item => ({
      ...item,
      value: item.serialNumber,
      model: item.model || '未知型号',
      last_seen_at: item.last_seen_at
    }))
    
    cb(results)
  } catch (error) {
    console.error('查询序列号失败:', error)
    cb([])
  }
}

// 选择序列号
const handleSNSelect = (item) => {
  queryForm.serialNumber = item.serialNumber
  ElMessage.success(`已选择无人机: ${item.serialNumber}`)
}

// 解析CSQ为RSSI
const parseCsqToRssi = (csq_val) => {
  return csq_val
  if (csq_val === 99) return -113
  if (csq_val === 31) return -51
  return -113 + (2 * csq_val)
}

// 查询轨迹
const queryTrajectory = async () => {
  if (!queryForm.serialNumber) {
    ElMessage.warning('请输入无人机序列号')
    return
  }
  
  loading.value = true
  
  try {
    const params = {
      serial_number: queryForm.serialNumber,
      limit: queryForm.limit
    }
    
    if (timeMode.value === 'minutes') {
      if (!queryForm.minutes) {
        ElMessage.warning('请输入查询时间范围')
        loading.value = false
        return
      }
      params.minutes = queryForm.minutes
    } else {
      if (!dateRange.value || dateRange.value.length !== 2) {
        ElMessage.warning('请选择时间范围')
        loading.value = false
        return
      }
      params.start = new Date(dateRange.value[0]).toISOString()
      params.end = new Date(dateRange.value[1]).toISOString()
    }
    
    ElMessage.info('正在查询轨迹数据...')
    
    const response = await $fetch('/api/query-drones-history-by-sn', {
      method: 'GET', 
      params
    })
    
    const data = response
    droneInfo.value = data.drone_info
    totalPoints.value = data.total_records || 0
    selectedCellId.value = 'all'
    selectedPointIndex.value = null
    hoveredPointIndex.value = null
    
    // 过滤4G数据和经纬度为0的点
    const filteredData = data.telemetry_data.filter(item => {
      return item.source === '4G' && 
             item.location && 
             item.location.length === 2 &&
             (Math.abs(item.location[0]) > 5 && Math.abs(item.location[1]) > 5)
    })
    
    if (filteredData.length === 0) {
      ElMessage.warning('未查询到有效的4G轨迹数据')
      clearTrajectory()
      return
    }
    
    // 处理轨迹数据
    processTrajectoryData(filteredData)
    
    ElMessage.success(`查询成功，共 ${totalPoints.value} 条记录，${trajectoryPoints.value.length} 个有效4G点`)
    
    // 如果数据量很大，提示用户
    if (trajectoryPoints.value.length > 1000) {
      ElMessageBox.confirm(
        `共查询到 ${trajectoryPoints.value.length} 个4G轨迹点，数据量较大可能影响显示性能，是否继续？`,
        '提示',
        {
          confirmButtonText: '继续',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(() => {
        drawTrajectory()
      }).catch(() => {
        clearTrajectory()
      })
    } else {
      drawTrajectory()
    }
  } catch (error) {
    console.error('查询失败:', error)
    ElMessage.error(`查询失败: ${error.data?.message || error.message}`)
  } finally {
    loading.value = false
  }
}

// 修改 processTrajectoryData 函数中调用 getCellShape 的部分
const processTrajectoryData = (data) => {
  trajectoryPoints.value = []
  baseStations.value.clear()
  baseStationSectorShapeMap.clear() // 清空形状分配记录
  
  // 用于存储基站ID到颜色的映射
  const baseStationColorMap = new Map()
  let baseColorIndex = 0
  
  // 按时间排序
  const sortedData = [...data].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  
  sortedData.forEach((point, index) => {
    // 获取基站ID（确保是7个字符的16进制）
    const rawCellId = point.extra_info?.cellid_hex || 'unknown'
    const parsed = parseCellId(rawCellId)
    const cellId = parsed.fullId
    const baseId = parsed.baseId
    const sectorId = parsed.sectorId
    
    let cellColor = '#999999' // 默认颜色
    let cellShape = 'circle' // 默认形状
    
    if (baseId !== 'unknown') {
      // 为新基站分配颜色
      if (!baseStationColorMap.has(baseId)) {
        const color = generateBaseColor(baseColorIndex++)
        baseStationColorMap.set(baseId, color)
      }
      
      // 获取基站的颜色
      cellColor = baseStationColorMap.get(baseId)
      
      // 根据基站ID和小区ID确定形状（修改这里）
      cellShape = getCellShape(baseId, sectorId)
      
      // 存储小区信息
      if (!baseStations.value.has(cellId)) {
        baseStations.value.set(cellId, {
          color: cellColor,
          shape: cellShape
        })
      }
    } else {
      // unknown基站使用灰色和圆形
      baseStations.value.set(cellId, {
        color: cellColor,
        shape: cellShape
      })
    }
    
    // WGS84转GCJ02坐标转换
    const wgs84Lng = point.location[0]
    const wgs84Lat = point.location[1]
    const [gcj02Lng, gcj02Lat] = CoordinateTransform.wgs84togcj02(wgs84Lng, wgs84Lat)
    
    const processedPoint = {
      originalLat: wgs84Lat,
      originalLng: wgs84Lng,
      lat: gcj02Lat,
      lng: gcj02Lng,
      altitude: point.altitude,
      speed: point.speed,
      timestamp: point.timestamp,
      cellId: cellId,
      baseId: baseId,
      sectorId: sectorId,
      color: cellColor,
      shape: cellShape,
      signalQuality: point.signal_quality,
      satellites: point.satellites,
      extraInfo: point.extra_info,
      index: index
    }
    
    trajectoryPoints.value.push(processedPoint)
  })
}


// 绘制轨迹
const drawTrajectory = () => {
  if (!AMap || !map) return
  
  clearMapLayers()
  
  const points = filteredPoints.value
  if (points.length === 0) return
  
  // 准备轨迹线坐标
  const path = points.map(p => [p.lng, p.lat])
  
  // 绘制轨迹线
  polyline = new AMap.Polyline({
    path: path,
    strokeColor: '#3388ff',
    strokeWeight: 3,
    strokeOpacity: 0.7,
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 5,
    showDir: true
  })
  map.add(polyline)
  
  // 绘制轨迹点
  points.forEach((point) => {
    let marker
    
    if (point.shape === 'circle') {
      // 圆形标记
      marker = new AMap.CircleMarker({
        center: [point.lng, point.lat],
        radius: 5,
        strokeColor: '#fff',
        strokeWeight: 1,
        strokeOpacity: 1,
        fillColor: point.color,
        fillOpacity: 0.8,
        zIndex: 10,
        bubble: true,
        cursor: 'pointer',
        extData: point
      })
    } else {
      // 三角形或五角星使用自定义图标
      const iconContent = createMarkerIcon(point.shape, point.color)
      marker = new AMap.Marker({
        position: [point.lng, point.lat],
        content: iconContent,
        offset: new AMap.Pixel(-10, -10),
        zIndex: 10,
        extData: point
      })
    }
    
    // 添加点击事件
    marker.on('click', (e) => {
      const data = e.target.getExtData()
      showPointInfoWindow(data)
    })
    
    circleMarkers.push(marker)
  })
  
  // 批量添加标记
  if (circleMarkers.length > 0) {
    map.add(circleMarkers)
  }
  
  // 自适应显示
  setTimeout(() => {
    map.setFitView()
  }, 100)
}

// 显示点的信息窗口
const showPointInfoWindow = (point) => {
  if (!AMap || !map) return
  
  if (currentInfoWindow) {
    currentInfoWindow.close()
  }
  
  const content = createPopupContent(point)
  
  currentInfoWindow = new AMap.InfoWindow({
    content: content,
    offset: new AMap.Pixel(0, -20)
  })
  
  currentInfoWindow.open(map, [point.lng, point.lat])
}

// 创建弹出框内容
const createPopupContent = (point) => {
  const rssi = parseCsqToRssi(point.signalQuality)
  const shapeNames = {
    'circle': '圆形',
    'triangle': '三角形',
    'star': '五角星'
  }
  
  return `
    <div style="padding: 10px; width: 350px; max-width: 400px;">
      <h4 style="margin: 0 0 10px 0; color: #333;">轨迹点 #${point.index + 1}</h4>
      <div style="line-height: 1.8;">
        <div><b>时间:</b> ${formatTime(point.timestamp)}</div>
        <div><b>高度:</b> ${point.altitude} m</div>
        <div><b>速度:</b> ${(point.speed / 3.6).toFixed(2)} m/s</div>
        <div>
          <b>基站:</b> 
          <span style="color: ${point.color}; font-weight: bold;">
            ${point.baseId}
          </span>
          <span style="color: #909399; font-size: 12px;">
            (小区 ${point.sectorId} - ${shapeNames[point.shape] || '未知'})
          </span>
        </div>
        <div><b>Cell ID:</b> ${point.cellId}</div>
        <div><b>信号强度:</b> ${rssi} dBm</div>
        <div><b>卫星数:</b> ${point.satellites}</div>
        ${point.extraInfo ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
            <div><b>网络模式:</b> ${point.extraInfo.mode || 'N/A'}</div>
            <div><b>RSRP:</b> ${point.extraInfo.rsrp || 'N/A'} dBm</div>
            <div><b>RSRQ:</b> ${point.extraInfo.rsrq || 'N/A'} dB</div>
            <div><b>SINR:</b> ${point.extraInfo.sinr || 'N/A'} dB</div>
            <div><b>PCI:</b> ${point.extraInfo.pci || 'N/A'}</div>
            <div><b>频段:</b> Band ${point.extraInfo.freq_band_ind || 'N/A'}</div>
            <div><b>连接状态:</b> ${point.extraInfo.state || 'N/A'}</div>
          </div>
        ` : ''}
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
          <div><b>原始坐标(WGS84):</b></div>
          <div>经度: ${point.originalLng.toFixed(6)}</div>
          <div>纬度: ${point.originalLat.toFixed(6)}</div>
        </div>
      </div>
    </div>
  `
}

// 处理基站选择变化
const handleCellIdChange = () => {
  if (filteredPoints.value.length > 0) {
    drawTrajectory()
  }
}

// 清除地图图层
const clearMapLayers = () => {
  if (currentInfoWindow) {
    currentInfoWindow.close()
    currentInfoWindow = null
  }
  
  if (polyline) {
    map && map.remove(polyline)
    polyline = null
  }
  
  if (circleMarkers.length > 0) {
    map && map.remove(circleMarkers)
    circleMarkers = []
  }
  
  if (markers.length > 0) {
    map && map.remove(markers)
    markers = []
  }
}

// 清除轨迹
const clearTrajectory = () => {
  droneInfo.value = null
  trajectoryPoints.value = []
  baseStations.value.clear()
  baseStationSectorShapeMap.clear() // 清空形状分配记录
  totalPoints.value = 0
  selectedCellId.value = 'all'
  selectedPointIndex.value = null
  hoveredPointIndex.value = null
  clearMapLayers()
}

// 获取基站点数
const getCellIdCount = (cellId) => {
  return trajectoryPoints.value.filter(p => p.cellId === cellId).length
}

// 格式化最后上线时间
const formatLastSeen = (timestamp) => {
  if (!timestamp) return '未知'
  
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  
  return date.toLocaleDateString('zh-CN')
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 格式化日期时间为picker格式
const formatDateTimeForPicker = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 生命周期
onMounted(() => {
  initMap()
  
  // 初始化时间
  const now = new Date()
  const start = new Date(now.getTime() - 60 * 60 * 1000)
  dateRange.value = [
    formatDateTimeForPicker(start),
    formatDateTimeForPicker(now)
  ]
})

onUnmounted(() => {
  if (map) {
    map.destroy()
  }
})
</script>

<style scoped>
.drone-trajectory-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  position: relative;
  background: #f5f7fa;
}

/* 控制面板样式 */
.control-panel {
  width: 380px;
  background: white;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  padding: 24px;
  overflow-y: auto;
  z-index: 10;
}

.panel-title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

/* 自动补全样式 */
.suggestion-item-content {
  padding: 8px 0;
}

.sn-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.sn-icon {
  color: #409eff;
}

.sn-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.sn-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 24px;
}

.last-seen {
  font-size: 12px;
  color: #909399;
}

/* 基站筛选 */
.base-station-filter {
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

/* 统计信息 */
.stats {
  margin-top: 24px;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #303133;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

/* 基站图例 */
.legend-panel {
  margin-top: 24px;
}

/* 增强基站分组的视觉效果 */
.base-station-group {
  margin-bottom: 16px;
  padding: 8px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #e8eaed;
}

.base-station-group:last-child {
  margin-bottom: 0;
}

.base-station-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
  padding: 6px 10px;
  background: linear-gradient(90deg, #e8f4ff 0%, #f5f7fa 100%);
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 4px 12px;
  background: white;
  border-radius: 4px;
  transition: all 0.3s;
}

.legend-item:hover {
  background: #f0f8ff;
  transform: translateX(2px);
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-shape {
  display: inline-block;
  width: 20px;
  height: 20px;
  margin-right: 12px;
  flex-shrink: 0;
  vertical-align: middle;
}

.legend-text {
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sector-label {
  font-size: 11px;
  color: #909399;
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
}

/* 曲线图面板 */
.charts-panel {
  margin-top: 24px;
}

.charts-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chart-item {
  width: 100%;
}

.chart-title {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid #409EFF;
}

.chart-wrapper {
  position: relative;
  width: 100%;
  height: 120px;
  cursor: crosshair;
}

.chart {
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 地图容器 */
.map-container {
  flex: 1;
  height: 100%;
  position: relative;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-autocomplete) {
  width: 100%;
}

:deep(.el-select) {
  width: 100%;
}

:deep(.el-select-group__title) {
  color: #303133;
  font-weight: 600;
  padding-left: 12px;
}

:deep(.el-select-group__wrap:not(:last-of-type)) {
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

:deep(.el-badge__content) {
  transform: translateY(-50%) translateX(50%) scale(0.9);
}

:deep(.el-card) {
  border: none;
  background: #f8f9fa;
}

:deep(.el-card__header) {
  padding: 12px 16px;
  background: white;
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-radio-group) {
  display: flex;
  width: 100%;
}

:deep(.el-radio-button) {
  flex: 1;
}

:deep(.el-radio-button__inner) {
  width: 100%;
}
</style>