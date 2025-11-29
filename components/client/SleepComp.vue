<template>
  <div class="sleep-stage-annotation">
    <div class="container">
      <!-- 文件上传区域 -->
      <div class="upload-section">
        <h2>WiFi睡眠阶段标注工具</h2>
        <div class="file-upload">
          <div class="upload-options">
            <input 
              type="file" 
              @change="handleFileUpload" 
              accept=".npz,.json,.txt"
              ref="fileInput"
              style="display: none"
            >
            <button @click="$refs.fileInput.click()" class="upload-btn">
              选择数据文件
            </button>
            <button @click="loadDemoData" class="upload-btn demo-btn">
              加载示例数据
            </button>
          </div>
          <span v-if="fileName" class="file-name">当前文件: {{ fileName }}</span>
        </div>
      </div>
      <!-- 睡眠阶段选择 -->
      <div v-if="dataLoaded" class="stage-selection">
        <h3>选择标注阶段</h3>
        <div class="radio-group">
          <label v-for="stage in stages" :key="stage.value" class="radio-label">
            <input 
              type="radio" 
              v-model="selectedStage" 
              :value="stage.value"
              name="sleepStage"
            >
            <span :style="{color: stage.color}">{{ stage.label }}</span>
          </label>
        </div>
      </div>
      <!-- 多曲线管理 -->
      <div v-if="dataLoaded" class="charts-manager">
        <div class="charts-header">
          <h3>数据曲线</h3>
          <button @click="addChart" class="btn-add-chart" :disabled="chartConfigs.length >= features.length">
            <span class="add-icon">+</span> 添加曲线
          </button>
        </div>
        <!-- 垂直排列的图表区域 -->
        <div class="charts-vertical">
          <div v-for="(config, index) in chartConfigs" :key="config.id" class="chart-item-vertical">
            <div class="chart-header">
              <select v-model="config.selectedFeature" @change="updateChart(index)" class="feature-selector">
                <option v-for="feature in getAvailableFeatures(index)" :key="feature" :value="feature">
                  {{ feature }}
                </option>
              </select>
              <button 
                v-if="chartConfigs.length > 1" 
                @click="removeChart(index)" 
                class="btn-remove-chart"
                title="删除曲线"
              >
                ×
              </button>
            </div>
            <div class="chart-container-vertical">
              <div class="canvas-wrapper">
                <canvas :ref="'chartCanvas_' + index"></canvas>
                <div 
                  v-if="isSelecting && activeChartIndex === index" 
                  class="selection-overlay"
                  :style="getSelectionStyle(index)"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 操作按钮 -->
      <div v-if="dataLoaded" class="action-buttons">
        <button @click="showComparison" class="btn btn-primary">
          对比分析
        </button>
        <button @click="showGroundTruth" class="btn btn-secondary">
          显示标签曲线
        </button>
        <button @click="clearAnnotations" class="btn btn-danger">
          清除所有标注
        </button>
        <button @click="exportAnnotations" class="btn btn-export">
          导出标注
        </button>
      </div>
      <!-- 标注区间列表 -->
      <div v-if="annotations.length > 0" class="annotations-list">
        <h3>标注区间 (共{{ annotations.length }}个)</h3>
        <div class="annotation-items">
          <div v-for="(ann, index) in annotations" :key="index" class="annotation-item">
            <span class="stage-label" :style="{backgroundColor: stages.find(s => s.value === ann.stage)?.color + '20', color: stages.find(s => s.value === ann.stage)?.color}">
              {{ stages.find(s => s.value === ann.stage)?.label }}
            </span>
            <span class="range">[{{ formatTime(ann.start) }} - {{ formatTime(ann.end) }}]</span>
            <span class="duration">({{ formatDuration(ann.end - ann.start + 1) }})</span>
            <button @click="removeAnnotation(index)" class="btn-small">删除</button>
          </div>
        </div>
      </div>
    </div>
    <!-- 对比分析对话框 -->
    <div v-if="showComparisonDialog" class="modal" @click.self="showComparisonDialog = false">
      <div class="modal-content modal-large">
        <h3>标注对比分析</h3>
        
        <div class="current-stage-info">
          <strong>分析阶段：</strong>
          <span :style="{color: stages.find(s => s.value === selectedStage)?.color, fontSize: '18px', fontWeight: 'bold'}">
            {{ getCurrentStageName() }}
          </span>
        </div>
        <div class="comparison-charts-vertical">
          <div class="chart-section">
            <h4>标签曲线（Ground Truth）</h4>
            <canvas ref="gtComparisonCanvas"></canvas>
          </div>
          <div class="chart-section">
            <h4>标注曲线（Annotation）</h4>
            <canvas ref="annComparisonCanvas"></canvas>
          </div>
        </div>
        <div class="comparison-stats">
          <h4>统计分析</h4>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">标签曲线 - {{ getCurrentStageName() }}阶段</div>
              <div class="stat-value">{{ comparisonStats.gtStagePoints }} 点</div>
              <div class="stat-percent">占比: {{ ((comparisonStats.gtStagePoints / comparisonStats.totalPoints) * 100).toFixed(1) }}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">标注曲线 - {{ getCurrentStageName() }}阶段</div>
              <div class="stat-value">{{ comparisonStats.annStagePoints }} 点</div>
              <div class="stat-percent">占比: {{ ((comparisonStats.annStagePoints / comparisonStats.totalPoints) * 100).toFixed(1) }}%</div>
            </div>
            <div class="stat-card highlight">
              <div class="stat-label">重合点数</div>
              <div class="stat-value">{{ comparisonStats.overlapPoints }} 点</div>
              <div class="stat-percent">重合率: {{ comparisonStats.overlapRate.toFixed(1) }}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">总点数</div>
              <div class="stat-value">{{ comparisonStats.totalPoints }} 点</div>
            </div>
          </div>
          <div class="comparison-table">
            <h4>各阶段详细对比</h4>
            <table>
              <thead>
                <tr>
                  <th>睡眠阶段</th>
                  <th>标签点数</th>
                  <th>标注点数</th>
                  <th>重合点数</th>
                  <th>重合率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="stage in stages" :key="stage.value" 
                    :class="{ 'current-row': stage.value === selectedStage }">
                  <td>
                    <span :style="{color: stage.color, fontWeight: 'bold'}">
                      {{ stage.label }}
                    </span>
                  </td>
                  <td>{{ stageComparison[stage.value].gtPoints }}</td>
                  <td>{{ stageComparison[stage.value].annPoints }}</td>
                  <td>{{ stageComparison[stage.value].overlapPoints }}</td>
                  <td>
                    <span class="overlap-rate">
                      {{ stageComparison[stage.value].overlapRate.toFixed(1) }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <button @click="showComparisonDialog = false" class="btn btn-primary">关闭</button>
      </div>
    </div>
    <!-- 标签曲线对话框 -->
    <div v-if="showGtDialog" class="modal" @click.self="showGtDialog = false">
      <div class="modal-content modal-large">
        <h3>Ground Truth 标签曲线</h3>
        <div class="gt-chart-container">
          <canvas ref="gtChartCanvas"></canvas>
        </div>
        <div class="stage-legend">
          <div v-for="stage in stages" :key="stage.value" class="legend-item">
            <span class="legend-color" :style="{backgroundColor: stage.color}"></span>
            <span>{{ stage.label }} ({{ stage.value }})</span>
          </div>
        </div>
        <button @click="showGtDialog = false" class="btn btn-primary">关闭</button>
      </div>
    </div>
  </div>
</template>
<script>
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
Chart.register(...registerables, zoomPlugin);
export default {
  name: 'SleepStageAnnotation',
  data() {
    return {
      fileName: '',
      npzData: null,
      features: [],
      dataLoaded: false,
      groundTruth: null,
      
      // 多图表配置
      chartConfigs: [],
      charts: {},
      chartIdCounter: 0,
      
      stages: [
        { value: 0, label: 'Wake', color: '#FF6B6B' },
        { value: 1, label: 'Light', color: '#4ECDC4' },
        { value: 2, label: 'Deep', color: '#45B7D1' },
        { value: 3, label: 'REM', color: '#96CEB4' }
      ],
      selectedStage: 0,
      
      gtChart: null,
      gtComparisonChart: null,
      annComparisonChart: null,
      annotations: [],
      
      isSelecting: false,
      activeChartIndex: null,
      selectionStartX: null,
      selectionEndX: null,
      
      showComparisonDialog: false,
      showGtDialog: false,
      
      comparisonStats: {
        totalPoints: 0,
        gtStagePoints: 0,
        annStagePoints: 0,
        overlapPoints: 0,
        overlapRate: 0
      },
      
      stageComparison: {},
      
      mouseHandlers: {},
      
      // 时间相关配置
      totalHours: 8, // 总时长8小时
      samplingRate: 256 // 每小时的采样点数 (2048点/8小时)
    };
  },
  
  methods: {
    // 将采样点索引转换为时间（小时）
    indexToTime(index) {
      return (index / this.samplingRate).toFixed(2);
    },
    
    // 格式化时间显示
    formatTime(index) {
      const hours = Math.floor(index / this.samplingRate);
      const minutes = Math.floor(((index % this.samplingRate) / this.samplingRate) * 60);
      return `${hours}h${minutes.toString().padStart(2, '0')}m`;
    },
    
    // 格式化持续时间
    formatDuration(points) {
      const totalMinutes = Math.floor((points / this.samplingRate) * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) {
        return `${hours}h${minutes}m`;
      }
      return `${minutes}m`;
    },
    
    // 生成时间标签 - 为每个数据点生成标签
    generateTimeLabels(dataLength) {
      const labels = [];
      for (let i = 0; i < dataLength; i++) {
        labels.push(i); // 直接使用索引作为标签
      }
      return labels;
    },
    
    // 生成X轴配置
    generateXAxisConfig(dataLength) {
      const pointsPerHour = dataLength / this.totalHours;
      
      return {
        display: true,
        title: {
          display: true,
          text: '时间（小时）'
        },
        ticks: {
          maxTicksLimit: 9, // 显示9个刻度（0-8小时）
          callback: function(value, index, ticks) {
            // value 是实际的数据点索引
            const hour = value / pointsPerHour;
            // 只在整小时位置显示刻度
            if (hour % 1 === 0 && hour <= 8) {
              return hour + 'h';
            }
            return '';
          },
          autoSkip: false,
          maxRotation: 0,
          minRotation: 0
        },
        grid: {
          display: true,
          drawOnChartArea: true,
          drawTicks: true,
          color: function(context) {
            // 在整小时位置显示更明显的网格线
            const hour = context.tick.value / pointsPerHour;
            if (hour % 1 === 0) {
              return 'rgba(0, 0, 0, 0.1)';
            }
            return 'rgba(0, 0, 0, 0.05)';
          }
        }
      };
    },
    
    async handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      this.fileName = file.name;
      
      if (file.name.endsWith('.json')) {
        await this.loadJsonFile(file);
      } else if (file.name.endsWith('.npz')) {
        await this.loadNpzFile(file);
      } else if (file.name.endsWith('.txt')) {
        await this.loadTextFile(file);
      } else {
        alert('不支持的文件格式，请使用 .json, .npz 或 .txt 文件');
      }
    },
    
    async loadJsonFile(file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        this.groundTruth = data.gt;
        this.features = Object.keys(data).filter(key => key !== 'gt');
        this.npzData = data;
        
        // 根据数据长度更新采样率
        if (this.groundTruth && this.groundTruth.length > 0) {
          this.samplingRate = this.groundTruth.length / this.totalHours;
        }
        
        if (this.features.length > 0) {
          this.dataLoaded = true;
          await this.$nextTick();
          this.initializeCharts();
        }
      } catch (error) {
        console.error('Error loading JSON file:', error);
        alert('加载JSON文件失败：' + error.message);
      }
    },
    
    async loadTextFile(file) {
      try {
        const text = await file.text();
        const lines = text.trim().split('\n');
        
        const headers = lines[0].split(',').map(h => h.trim());
        const data = {};
        
        headers.forEach(header => {
          data[header] = [];
        });
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => parseFloat(v.trim()));
          headers.forEach((header, idx) => {
            data[header].push(values[idx]);
          });
        }
        
        this.groundTruth = data.gt || data.GT || data.label || data.labels;
        this.features = headers.filter(h => !['gt', 'GT', 'label', 'labels'].includes(h));
        this.npzData = data;
        
        // 根据数据长度更新采样率
        if (this.groundTruth && this.groundTruth.length > 0) {
          this.samplingRate = this.groundTruth.length / this.totalHours;
        }
        
        if (this.features.length > 0) {
          this.dataLoaded = true;
          await this.$nextTick();
          this.initializeCharts();
        }
      } catch (error) {
        console.error('Error loading text file:', error);
        alert('加载文本文件失败：' + error.message);
      }
    },
    
    async loadNpzFile(file) {
      alert('NPZ文件处理较复杂，建议将数据转换为JSON格式。\n正在加载示例数据...');
      this.loadDemoData();
    },
    
    async loadDemoData() {
      const length = 2048; // 8小时的数据点
      this.samplingRate = length / this.totalHours; // 256点/小时
      
      this.groundTruth = [];
      let currentStage = 0;
      let stageLength = 0;
      
      for (let i = 0; i < length; i++) {
        if (stageLength <= 0) {
          currentStage = Math.floor(Math.random() * 4);
          stageLength = Math.floor(Math.random() * 200) + 50;
        }
        this.groundTruth.push(currentStage);
        stageLength--;
      }
      
      this.features = ['amplitude', 'phase', 'subcarrier_1', 'subcarrier_2', 'subcarrier_3'];
      this.npzData = { gt: this.groundTruth };
      
      this.features.forEach(feature => {
        this.npzData[feature] = new Array(length).fill(0).map((_, i) => {
          const base = Math.sin(i * 0.02) * 30 + Math.cos(i * 0.01) * 20;
          const stageEffect = this.groundTruth[i] * 15;
          const noise = (Math.random() - 0.5) * 10;
          const breathing = Math.sin(i * 0.05) * 5;
          const heartbeat = Math.sin(i * 0.2) * 2;
          
          return base + stageEffect + noise + breathing + heartbeat;
        });
      });
      
      this.dataLoaded = true;
      this.fileName = '示例数据';
      
      await this.$nextTick();
      this.initializeCharts();
    },
    
    initializeCharts() {
      // 清理旧的图表
      this.clearAllCharts();
      
      // 初始化一个默认图表
      this.addChart();
    },
    
    addChart() {
      const id = this.chartIdCounter++;
      const availableFeatures = this.getAvailableFeatures(this.chartConfigs.length);
      
      if (availableFeatures.length === 0) {
        alert('没有更多可用的特征');
        return;
      }
      
      const config = {
        id: id,
        selectedFeature: availableFeatures[0]
      };
      
      this.chartConfigs.push(config);
      
      this.$nextTick(() => {
        this.createChart(this.chartConfigs.length - 1);
      });
    },
    
    removeChart(index) {
      if (this.chartConfigs.length <= 1) {
        alert('至少需要保留一个曲线');
        return;
      }
      
      const chartId = this.chartConfigs[index].id;
      
      // 销毁图表
      if (this.charts[chartId]) {
        this.removeMouseEvents(index);
        this.charts[chartId].destroy();
        delete this.charts[chartId];
      }
      
      // 移除配置
      this.chartConfigs.splice(index, 1);
      
      // 更新所有剩余图表
      this.$nextTick(() => {
        this.updateAllCharts();
      });
    },
    
    getAvailableFeatures(currentIndex) {
      const usedFeatures = this.chartConfigs
        .filter((_, idx) => idx !== currentIndex)
        .map(config => config.selectedFeature);
      
      return this.features.filter(feature => !usedFeatures.includes(feature));
    },
    
    updateChart(index) {
      this.createChart(index);
    },
    
    updateAllCharts() {
      this.chartConfigs.forEach((_, index) => {
        this.createChart(index);
      });
    },
    
    async createChart(index) {
      await this.$nextTick();
      
      const config = this.chartConfigs[index];
      const canvas = this.$refs['chartCanvas_' + index]?.[0];
      
      if (!canvas) {
        console.error('Canvas element not found for index:', index);
        return;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        return;
      }
      
      // 销毁旧图表
      if (this.charts[config.id]) {
        this.removeMouseEvents(index);
        this.charts[config.id].destroy();
      }
      
      const currentFeatureData = this.npzData[config.selectedFeature];
      const timeLabels = this.generateTimeLabels(currentFeatureData.length);
      
      const datasets = [{
        label: config.selectedFeature,
        data: currentFeatureData,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.1
      }];
      
      // 添加标注区间
      this.annotations.forEach((ann, idx) => {
        const color = this.stages.find(s => s.value === ann.stage)?.color || '#000';
        datasets.push({
          label: `${this.stages.find(s => s.value === ann.stage)?.label}_${idx + 1}`,
          data: Array.from({ length: currentFeatureData.length }, (_, i) => {
            return (i >= ann.start && i <= ann.end) ? currentFeatureData[i] : null;
          }),
          borderColor: color,
          backgroundColor: color + '40',
          borderWidth: 2,
          pointRadius: 0,
          fill: true
        });
      });
      
      this.charts[config.id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          transitions: {
            active: {
              animation: {
                duration: 0
              }
            }
          },
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            zoom: {
              limits: {
                x: {min: 0, max: currentFeatureData.length - 1},
              },
              pan: {
                enabled: true,
                mode: 'x',
              },
              zoom: {
                wheel: {
                  enabled: true,
                },
                pinch: {
                  enabled: true
                },
                mode: 'x',
              }
            },
            legend: {
              display: true,
              position: 'top',
              labels: {
                filter: function(item) {
                  return item.datasetIndex === 0;
                }
              }
            },
            tooltip: {
              enabled: true,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return `时间: ${this.formatTime(index)}`;
                },
                label: (context) => {
                  return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            x: this.generateXAxisConfig(currentFeatureData.length),
            y: {
              display: true,
              title: {
                display: true,
                text: '幅值'
              }
            }
          }
        }
      });
      
      await this.$nextTick();
      this.setupMouseEvents(index);
    },
    
    setupMouseEvents(index) {
      const canvas = this.$refs['chartCanvas_' + index]?.[0];
      if (!canvas) return;
      
      this.removeMouseEvents(index);
      
      const handlers = {
        mousedown: (e) => this.handleMouseDown(e, index),
        mousemove: (e) => this.handleMouseMove(e, index),
        mouseup: (e) => this.handleMouseUp(e, index),
        mouseleave: (e) => this.handleMouseLeave(e, index)
      };
      
      this.mouseHandlers[index] = handlers;
      
      canvas.addEventListener('mousedown', handlers.mousedown);
      canvas.addEventListener('mousemove', handlers.mousemove);
      canvas.addEventListener('mouseup', handlers.mouseup);
      canvas.addEventListener('mouseleave', handlers.mouseleave);
    },
    
    removeMouseEvents(index) {
      const canvas = this.$refs['chartCanvas_' + index]?.[0];
      if (!canvas || !this.mouseHandlers[index]) return;
      
      const handlers = this.mouseHandlers[index];
      canvas.removeEventListener('mousedown', handlers.mousedown);
      canvas.removeEventListener('mousemove', handlers.mousemove);
      canvas.removeEventListener('mouseup', handlers.mouseup);
      canvas.removeEventListener('mouseleave', handlers.mouseleave);
      
      delete this.mouseHandlers[index];
    },
    
    handleMouseDown(event, index) {
      const config = this.chartConfigs[index];
      const chart = this.charts[config.id];
      if (!chart) return;
      
      const rect = event.target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      
      const chartArea = chart.chartArea;
      if (chartArea && x >= chartArea.left && x <= chartArea.right) {
        this.isSelecting = true;
        this.activeChartIndex = index;
        this.selectionStartX = event.clientX;
        this.selectionEndX = event.clientX;
      }
    },
    
    handleMouseMove(event, index) {
      if (!this.isSelecting || this.activeChartIndex !== index) return;
      
      const config = this.chartConfigs[index];
      const chart = this.charts[config.id];
      if (!chart) return;
      
      const rect = event.target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      
      const chartArea = chart.chartArea;
      if (chartArea) {
        if (x >= chartArea.left && x <= chartArea.right) {
          this.selectionEndX = event.clientX;
        }
      }
    },
    
    handleMouseUp(event, index) {
      if (!this.isSelecting || this.activeChartIndex !== index) return;
      
      const config = this.chartConfigs[index];
      const chart = this.charts[config.id];
      if (!chart) return;
      
      this.isSelecting = false;
      
      const rect = event.target.getBoundingClientRect();
      const xAxis = chart.scales.x;
      if (!xAxis) return;
      
      const startX = this.selectionStartX - rect.left;
      const endX = this.selectionEndX - rect.left;
      
      const startIndex = Math.round(xAxis.getValueForPixel(Math.min(startX, endX)));
      const endIndex = Math.round(xAxis.getValueForPixel(Math.max(startX, endX)));
      
      if (endIndex - startIndex >= 5) {
        this.addAnnotation(startIndex, endIndex, this.selectedStage);
      }
      
      this.selectionStartX = null;
      this.selectionEndX = null;
      this.activeChartIndex = null;
    },
    
    handleMouseLeave(event, index) {
      if (this.activeChartIndex === index) {
        this.isSelecting = false;
        this.selectionStartX = null;
        this.selectionEndX = null;
        this.activeChartIndex = null;
      }
    },
    
    getSelectionStyle(index) {
      if (!this.isSelecting || this.activeChartIndex !== index) return {};
      
      const config = this.chartConfigs[index];
      const chart = this.charts[config.id];
      if (!chart) return {};
      
      const chartArea = chart.chartArea;
      if (!chartArea) return {};
      
      const canvas = this.$refs['chartCanvas_' + index]?.[0];
      if (!canvas) return {};
      
      const canvasRect = canvas.getBoundingClientRect();
      const left = Math.min(this.selectionStartX, this.selectionEndX) - canvasRect.left;
      const width = Math.abs(this.selectionEndX - this.selectionStartX);
      
      return {
        left: `${left}px`,
        width: `${width}px`,
        top: `${chartArea.top}px`,
        height: `${chartArea.bottom - chartArea.top}px`,
        backgroundColor: this.stages.find(s => s.value === this.selectedStage)?.color + '30',
        position: 'absolute',
        pointerEvents: 'none',
        borderColor: this.stages.find(s => s.value === this.selectedStage)?.color
      };
    },
    
    addAnnotation(start, end, stage) {
      const dataLength = this.npzData[this.features[0]].length;
      start = Math.max(0, Math.min(start, dataLength - 1));
      end = Math.max(0, Math.min(end, dataLength - 1));
      
      const newAnnotation = { start, end, stage };
      const merged = this.mergeAnnotations([...this.annotations, newAnnotation]);
      this.annotations = merged;
      
      // 更新所有图表
      this.updateAllCharts();
    },
    
    mergeAnnotations(annotations) {
      if (annotations.length === 0) return [];
      
      const grouped = {};
      annotations.forEach(ann => {
        if (!grouped[ann.stage]) {
          grouped[ann.stage] = [];
        }
        grouped[ann.stage].push(ann);
      });
      
      const result = [];
      
      Object.keys(grouped).forEach(stage => {
        const stageAnns = grouped[stage].sort((a, b) => a.start - b.start);
        const merged = [];
        
        stageAnns.forEach(ann => {
          if (merged.length === 0) {
            merged.push({...ann});
          } else {
            const last = merged[merged.length - 1];
            if (ann.start <= last.end + 1) {
              last.end = Math.max(last.end, ann.end);
            } else {
              merged.push({...ann});
            }
          }
        });
        
        result.push(...merged);
      });
      
      return result.sort((a, b) => a.start - b.start);
    },
    
    removeAnnotation(index) {
      this.annotations.splice(index, 1);
      this.updateAllCharts();
    },
    
    clearAnnotations() {
      if (confirm('确定要清除所有标注吗？')) {
        this.annotations = [];
        this.updateAllCharts();
      }
    },
    
    clearAllCharts() {
      // 清理所有图表
      Object.keys(this.charts).forEach(chartId => {
        if (this.charts[chartId]) {
          this.charts[chartId].destroy();
        }
      });
      this.charts = {};
      this.chartConfigs = [];
      this.chartIdCounter = 0;
    },
    
    showComparison() {
      if (!this.groundTruth) {
        alert('请先加载包含ground truth的数据');
        return;
      }
      
      if (this.annotations.length === 0) {
        alert('请先进行标注');
        return;
      }
      
      this.calculateComparisonStats();
      this.showComparisonDialog = true;
      this.$nextTick(() => {
        this.createComparisonCharts();
      });
    },
    
    calculateComparisonStats() {
      const totalPoints = this.groundTruth.length;
      
      const annotationArray = new Array(totalPoints).fill(-1);
      this.annotations.forEach(ann => {
        for (let i = ann.start; i <= ann.end && i < totalPoints; i++) {
          annotationArray[i] = ann.stage;
        }
      });
      
      this.stageComparison = {};
      this.stages.forEach(stage => {
        this.stageComparison[stage.value] = {
          gtPoints: 0,
          annPoints: 0,
          overlapPoints: 0,
          overlapRate: 0
        };
      });
      
      for (let i = 0; i < totalPoints; i++) {
        const gtValue = this.groundTruth[i];
        const annValue = annotationArray[i];
        
        if (gtValue >= 0 && gtValue <= 3) {
          this.stageComparison[gtValue].gtPoints++;
        }
        
        if (annValue >= 0 && annValue <= 3) {
          this.stageComparison[annValue].annPoints++;
        }
        
        if (gtValue === annValue && annValue >= 0) {
          this.stageComparison[gtValue].overlapPoints++;
        }
      }
      
      this.stages.forEach(stage => {
        const stats = this.stageComparison[stage.value];
        if (stats.gtPoints > 0) {
          stats.overlapRate = (stats.overlapPoints / stats.gtPoints) * 100;
        }
      });
      
      const currentStageStats = this.stageComparison[this.selectedStage];
      this.comparisonStats = {
        totalPoints: totalPoints,
        gtStagePoints: currentStageStats.gtPoints,
        annStagePoints: currentStageStats.annPoints,
        overlapPoints: currentStageStats.overlapPoints,
        overlapRate: currentStageStats.overlapRate
      };
    },
    
    async createComparisonCharts() {
      await this.$nextTick();
      
      const gtCanvas = this.$refs.gtComparisonCanvas;
      const annCanvas = this.$refs.annComparisonCanvas;
      
      if (!gtCanvas || !annCanvas) return;
      
      if (this.gtComparisonChart) {
        this.gtComparisonChart.destroy();
      }
      if (this.annComparisonChart) {
        this.annComparisonChart.destroy();
      }
      
      const annotationArray = new Array(this.groundTruth.length).fill(-1);
      this.annotations.forEach(ann => {
        for (let i = ann.start; i <= ann.end && i < this.groundTruth.length; i++) {
          annotationArray[i] = ann.stage;
        }
      });
      
      const timeLabels = this.generateTimeLabels(this.groundTruth.length);
      
      const gtColors = this.groundTruth.map(val => 
        this.stages.find(s => s.value === val)?.color || '#ccc'
      );
      
      this.gtComparisonChart = new Chart(gtCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            label: '标签',
            data: this.groundTruth,
            borderColor: gtColors,
            backgroundColor: gtColors.map(c => c + '40'),
            segment: {
              borderColor: ctx => gtColors[ctx.p0DataIndex] || '#ccc',
              backgroundColor: ctx => (gtColors[ctx.p0DataIndex] || '#ccc') + '40'
            },
            borderWidth: 2,
            pointRadius: 0,
            stepped: 'middle',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { 
              enabled: true,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return `时间: ${this.formatTime(index)}`;
                },
                label: (context) => {
                  const stage = this.stages.find(s => s.value === context.parsed.y);
                  return stage ? `阶段: ${stage.label}` : '';
                }
              }
            },
            zoom: {
              pan: { enabled: true, mode: 'x' },
              zoom: {
                wheel: { enabled: true },
                mode: 'x',
              }
            }
          },
          scales: {
            x: this.generateXAxisConfig(this.groundTruth.length),
            y: {
              display: true,
              title: { display: true, text: '阶段' },
              ticks: {
                stepSize: 1,
                callback: (value) => {
                  const stage = this.stages.find(s => s.value === value);
                  return stage?.label || '';
                }
              },
              min: -0.5,
              max: 3.5
            }
          }
        }
      });
      
      const annColors = annotationArray.map(val => {
        if (val === -1) return '#e0e0e0';
        return this.stages.find(s => s.value === val)?.color || '#ccc';
      });
      
      this.annComparisonChart = new Chart(annCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            label: '标注',
            data: annotationArray.map(v => v === -1 ? null : v),
            borderColor: annColors,
            backgroundColor: annColors.map(c => c + '40'),
            segment: {
              borderColor: ctx => annColors[ctx.p0DataIndex] || '#e0e0e0',
              backgroundColor: ctx => (annColors[ctx.p0DataIndex] || '#e0e0e0') + '40'
            },
            borderWidth: 2,
            pointRadius: 0,
            stepped: 'middle',
            fill: true,
            spanGaps: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { 
              enabled: true,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return `时间: ${this.formatTime(index)}`;
                },
                label: (context) => {
                  const stage = this.stages.find(s => s.value === context.parsed.y);
                  return stage ? `阶段: ${stage.label}` : '未标注';
                }
              }
            },
            zoom: {
              pan: { enabled: true, mode: 'x' },
              zoom: {
                wheel: { enabled: true },
                mode: 'x',
              }
            }
          },
          scales: {
            x: this.generateXAxisConfig(annotationArray.length),
            y: {
              display: true,
              title: { display: true, text: '阶段' },
              ticks: {
                stepSize: 1,
                callback: (value) => {
                  const stage = this.stages.find(s => s.value === value);
                  return stage?.label || '';
                }
              },
              min: -0.5,
              max: 3.5
            }
          }
        }
      });
    },
    
    getCurrentStageName() {
      return this.stages.find(s => s.value === this.selectedStage)?.label || '';
    },
    
    async showGroundTruth() {
      if (!this.groundTruth) {
        alert('没有ground truth数据');
        return;
      }
      
      this.showGtDialog = true;
      await this.$nextTick();
      this.createGtChart();
    },
    
    async createGtChart() {
      await this.$nextTick();
      
      const canvas = this.$refs.gtChartCanvas;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      if (this.gtChart) {
        this.gtChart.destroy();
        this.gtChart = null;
      }
      
      const timeLabels = this.generateTimeLabels(this.groundTruth.length);
      const pointColors = this.groundTruth.map(val => 
        this.stages.find(s => s.value === val)?.color || '#000'
      );
      
      this.gtChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            label: '睡眠阶段',
            data: this.groundTruth,
            borderColor: pointColors,
            backgroundColor: pointColors.map(c => c + '40'),
            segment: {
              borderColor: ctx => pointColors[ctx.p0DataIndex] || '#000',
              backgroundColor: ctx => (pointColors[ctx.p0DataIndex] || '#000') + '40'
            },
            borderWidth: 2,
            pointRadius: 0,
            stepped: 'middle',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { 
              enabled: true,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return `时间: ${this.formatTime(index)}`;
                },
                label: (context) => {
                  const stage = this.stages.find(s => s.value === context.parsed.y);
                  return stage ? `阶段: ${stage.label}` : '';
                }
              }
            },
            zoom: {
              limits: {
                x: {min: 0, max: this.groundTruth.length - 1},
                y: {min: -0.5, max: 3.5}
              },
              pan: { enabled: true, mode: 'x' },
              zoom: {
                wheel: { enabled: true },
                mode: 'x',
              }
            }
          },
          scales: {
            x: this.generateXAxisConfig(this.groundTruth.length),
            y: {
              display: true,
              title: { display: true, text: '睡眠阶段' },
              ticks: {
                stepSize: 1,
                callback: (value) => {
                  const stage = this.stages.find(s => s.value === value);
                  return stage?.label || value;
                }
              },
              min: -0.5,
              max: 3.5
            }
          }
        }
      });
    },
    
    exportAnnotations() {
      const exportData = {
        fileName: this.fileName,
        totalHours: this.totalHours,
        samplingRate: this.samplingRate,
        charts: this.chartConfigs.map(config => ({
          feature: config.selectedFeature
        })),
        annotations: this.annotations.map(ann => ({
          ...ann,
          startTime: this.formatTime(ann.start),
          endTime: this.formatTime(ann.end),
          duration: this.formatDuration(ann.end - ann.start + 1)
        })),
        stages: this.stages,
        timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annotations_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  },
  
  beforeUnmount() {
    // 清理所有事件监听器
    this.chartConfigs.forEach((_, index) => {
      this.removeMouseEvents(index);
    });
    
    // 销毁所有图表
    this.clearAllCharts();
    
    if (this.gtChart) {
      this.gtChart.destroy();
      this.gtChart = null;
    }
    if (this.gtComparisonChart) {
      this.gtComparisonChart.destroy();
      this.gtComparisonChart = null;
    }
    if (this.annComparisonChart) {
      this.annComparisonChart.destroy();
      this.annComparisonChart = null;
    }
  }
};
</script>
<style scoped>
.sleep-stage-annotation {
  height: 100vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
  max-width: 1600px;
  margin: 0 auto;
}

.upload-section {
  margin-bottom: 30px;
  padding: 25px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.upload-section h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2d3748;
  font-size: 28px;
}

.file-upload {
  margin-bottom: 20px;
}

.upload-options {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.upload-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.upload-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.demo-btn {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
}

.demo-btn:hover {
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
}

.file-name {
  color: #4a5568;
  font-size: 14px;
  padding: 8px 16px;
  background: #f7fafc;
  border-radius: 6px;
  display: inline-block;
}

.stage-selection {
  margin-bottom: 30px;
  padding: 25px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.stage-selection h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2d3748;
  font-size: 20px;
}

.radio-group {
  display: flex;
  gap: 35px;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 16px;
  border-radius: 8px;
  transition: all 0.3s;
}

.radio-label:hover {
  background: #f7fafc;
}

.radio-label input[type="radio"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.radio-label span {
  font-weight: 600;
}

/* 新增多曲线管理样式 */
.charts-manager {
  margin-bottom: 30px;
  padding: 25px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.charts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.charts-header h3 {
  margin: 0;
  color: #2d3748;
  font-size: 20px;
}

.btn-add-chart {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #56ab2f 0%, #a8e063 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(168, 224, 99, 0.3);
}

.btn-add-chart:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(168, 224, 99, 0.4);
}

.btn-add-chart:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-icon {
  font-size: 20px;
  font-weight: bold;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 20px;
}

.chart-item {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 15px;
  background: #fafafa;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.feature-selector {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: all 0.3s;
  max-width: 200px;
}

.feature-selector:hover {
  border-color: #cbd5e0;
}

.feature-selector:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.btn-remove-chart {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #ef4444;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 10px;
}

.btn-remove-chart:hover {
  background: #dc2626;
  transform: scale(1.1);
}

.chart-container {
  height: 350px;
  background: white;
  border-radius: 8px;
  padding: 15px;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 300px;
}

.canvas-wrapper canvas {
  width: 100% !important;
  height: 100% !important;
}

.selection-overlay {
  position: absolute;
  pointer-events: none;
  border: 2px dashed currentColor;
  border-radius: 4px;
  z-index: 10;
}

.action-buttons {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 28px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
}

.btn-secondary {
  background: linear-gradient(135deg, #56ab2f 0%, #a8e063 100%);
  color: white;
}

.btn-secondary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(168, 224, 99, 0.3);
}

.btn-danger {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
  color: white;
}

.btn-danger:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(235, 51, 73, 0.3);
}

.btn-export {
  background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
  color: white;
}

.btn-export:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(25, 84, 123, 0.3);
}

.btn-small {
  padding: 5px 12px;
  background: #f7fafc;
  color: #4a5568;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  margin-left: auto;
  transition: all 0.3s;
}

.btn-small:hover {
  background: #edf2f7;
  color: #2d3748;
  border-color: #cbd5e0;
}

.annotations-list {
  padding: 25px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.annotations-list h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2d3748;
  font-size: 20px;
}

.annotation-items {
  max-height: 300px;
  overflow-y: auto;
}

.annotation-item {
  padding: 12px 16px;
  margin-bottom: 10px;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  font-size: 14px;
  transition: all 0.3s;
}

.annotation-item:hover {
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.stage-label {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  margin-right: 12px;
}

.range {
  color: #4a5568;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  margin-right: 8px;
}

.duration {
  color: #718096;
  font-size: 13px;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 35px;
  border-radius: 16px;
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-large {
  max-width: 1200px;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 25px;
  color: #2d3748;
  font-size: 24px;
}

.current-stage-info {
  padding: 15px;
  background: #f7fafc;
  border-radius: 10px;
  margin-bottom: 25px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.comparison-charts-vertical {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 30px;
}

.chart-section {
  background: #f7fafc;
  padding: 20px;
  border-radius: 10px;
}

.chart-section h4 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #2d3748;
  font-size: 16px;
}

.chart-section canvas {
  height: 200px !important;
}

.comparison-stats {
  margin-top: 30px;
}

.comparison-stats h4 {
  margin-bottom: 20px;
  color: #2d3748;
  font-size: 18px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.stat-card {
  padding: 20px;
  background: #f7fafc;
  border-radius: 10px;
  text-align: center;
  border: 2px solid #e2e8f0;
  transition: all 0.3s;
}

.stat-card.highlight {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  border-color: #667eea;
}

.stat-label {
  font-size: 14px;
  color: #718096;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #2d3748;
  margin-bottom: 5px;
}

.stat-percent {
  font-size: 14px;
  color: #4a5568;
}

.comparison-table {
  margin-top: 30px;
  padding: 20px;
  background: #f7fafc;
  border-radius: 10px;
}

.comparison-table h4 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2d3748;
}

.comparison-table table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.comparison-table th {
  background: #edf2f7;
  font-weight: 600;
  color: #2d3748;
}

.comparison-table tr.current-row {
  background: linear-gradient(135deg, #667eea10 0%, #764ba210 100%);
}

.comparison-table tr:hover {
  background: #f7fafc;
}

.overlap-rate {
  font-weight: 600;
  color: #667eea;
}

.gt-chart-container {
  height: 350px;
  margin-bottom: 20px;
}

.stage-legend {
  display: flex;
  justify-content: center;
  gap: 25px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #4a5568;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* 滚动条样式 */
.annotation-items::-webkit-scrollbar,
.modal-content::-webkit-scrollbar {
  width: 8px;
}

.annotation-items::-webkit-scrollbar-track,
.modal-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.annotation-items::-webkit-scrollbar-thumb,
.modal-content::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

.annotation-items::-webkit-scrollbar-thumb:hover,
.modal-content::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>