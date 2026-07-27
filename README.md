# Mineradio + LongCat AI

基于 [Mineradio Web](https://github.com/ElijahZhao/mineradio-WebAPP) 的增强版，添加了 LongCat AI 驱动的智能推荐、AI DJ 和音乐 DNA 画像功能。

## 原始功能

- 网易云音乐 + QQ Music 双源搜索播放
- Three.js 粒子视觉 + 3D 歌单架
- 天气电台（根据天气生成歌单）
- WebSocket 实现在线计数
- PWA 支持
- 桌面悬浮歌词

## 新增 AI 功能

### 1. LongCat 智能推荐

根据天气、时间、用户状态生成个性化推荐语和搜索关键词。

```
GET /api/smart-recommend?city=Shanghai&userName=测试用户
```

```json
{
  "source": "longcat",
  "mood_analysis": "晴朗夜晚，万籁俱寂，适合沉淀心绪",
  "energy": 0.25, "warmth": 0.55, "focus": 0.45, "melancholy": 0.35,
  "keywords": ["夜晚轻音乐", "chill night", "星空钢琴"],
  "recommendation": "夜空澄澈，城市安静下来，正是让音乐包裹自己的好时刻..."
}
```

### 2. AI DJ 电台

为每首歌生成导播语，为播放列表生成节目单开场白。

```
GET /api/ai-dj/intro?song=My+Jinji&artist=落日飞车&weather=阴天闷热&mood=闷热夜听
GET /api/ai-dj/script?weather=hot&mood=chill&songs=[...]
```

```json
{
  "intro": "热到融化的时候，就让这首歌给你放个假。",
  "source": "longcat"
}
```

### 3. 音乐 DNA 画像

分析听歌历史，生成品味画像卡片。

```
GET /api/music-dna?history=[{"name":"xxx","artist":"xxx","duration":400000,"timestamp":1722000000000}]
```

```json
{
  "title": "深夜浪漫派",
  "description": "你是午夜时分独自驾车穿过城市霓虹的那类人...",
  "traits": [
    {"name": "能量值", "value": 0.35},
    {"name": "浪漫值", "value": 0.88},
    {"name": "探索欲", "value": 0.72},
    {"name": "怀旧值", "value": 0.55}
  ],
  "emoji": "🌙",
  "color": "#6B5B95",
  "recommend_genre": "City Pop / 都市流行"
}
```

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/netlab-lock/mineradio-longcat.git
cd mineradio-longcat

# 安装依赖
npm install

# 启动服务
npm start
```

打开 http://localhost:3000

## 技术栈

- **后端**: Node.js 零框架 (原生 http 模块)
- **前端**: Three.js + GSAP + mpg123-decoder (WASM)
- **AI**: LongCat-2.0 (通过 hermes CLI 调用)
- **音乐源**: 网易云音乐 + QQ Music
- **天气**: Open-Meteo API

## 项目结构

```
├── server.js              # 后端主入口 (路由 + API + WebSocket)
├── longcat-recommend.js   # LongCat 智能推荐引擎
├── ai-dj.js               # AI DJ 导播语生成
├── music-dna.js           # 音乐 DNA 画像
├── dj-analyzer.js         # 音频节拍分析 (Biquad 滤波器)
├── public/
│   ├── index.html         # 主播放器 (~27K 行)
│   ├── landing.html        # 粒子背景首页
│   ├── desktop-lyrics.html # 桌面悬浮歌词
│   └── vendor/            # Three.js / GSAP / music-tempo
└── tests/                 # Jest 单元测试 (32 tests)
```

## 安全特性

- SSRF 防护（代理目标白名单 + 私网 IP 拦截）
- 速率限制 (300 req/min)
- 安全 Headers (HSTS / CSP / X-Content-Type-Options)
- Cookie 安全 (HttpOnly + SameSite=Lax + Secure)
- WebSocket 安全 (Origin 验证 + 帧大小限制)

## 原始项目

本项目基于 [Mineradio Web](https://github.com/ElijahZhao/mineradio-WebAPP) (GPL-3.0) 二次开发。
