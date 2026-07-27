// ====================================================================
//  音乐 DNA 画像引擎 — 分析用户听歌历史，生成品味画像
// ====================================================================
const { spawn } = require('child_process');
const path = require('path');

const HERMES_CLI = '/home/atios/.local/bin/hermes';
const TIMEOUT_MS = 30000;

function callLongCat(prompt, maxTokens = 512) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const proc = spawn(HERMES_CLI, ['-z', prompt], {
      timeout: TIMEOUT_MS,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (code !== 0) {
        console.error(`[MusicDNA] 退出码 ${code}, 耗时 ${elapsed}ms`);
        reject(new Error(`LongCat 调用失败 (exit ${code})`));
        return;
      }
      const result = stdout.trim();
      if (!result) { reject(new Error('LongCat 返回空结果')); return; }
      console.log(`[MusicDNA] 完成, 耗时 ${elapsed}ms`);
      resolve(result);
    });

    proc.on('error', (err) => {
      console.error('[MusicDNA] 进程错误:', err.message);
      reject(err);
    });
  });
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch {} }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch {} }
  return null;
}

// 分析听歌历史，生成 DNA 画像
async function generateMusicDNA(listenHistory) {
  // listenHistory: [{ name, artist, album, duration, timestamp, genre }]
  const totalSongs = listenHistory.length;

  if (totalSongs === 0) {
    return getEmptyDNA();
  }

  // 统计基础数据
  const artistCount = {};
  const nameCount = {};
  const hourDistribution = new Array(24).fill(0);
  let totalDuration = 0;

  listenHistory.forEach(song => {
    artistCount[song.artist] = (artistCount[song.artist] || 0) + 1;
    nameCount[song.name] = (nameCount[song.name] || 0) + 1;
    totalDuration += song.duration || 0;

    if (song.timestamp) {
      const hour = new Date(song.timestamp).getHours();
      hourDistribution[hour]++;
    }
  });

  // Top 艺术家
  const topArtists = Object.entries(artistCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Top 歌曲
  const topSongs = Object.entries(nameCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // 听歌时段偏好
  const peakHour = hourDistribution.indexOf(Math.max(...hourDistribution));
  const timePreference = getTimePreference(hourDistribution);

  // 准备给 LongCat 的数据
  const summaryData = {
    totalSongs,
    totalHours: Math.round(totalDuration / 3600000 * 10) / 10,
    uniqueArtists: Object.keys(artistCount).length,
    uniqueSongs: Object.keys(nameCount).length,
    topArtists: topArtists.slice(0, 5).map(a => `${a.name}(${a.count}次)`).join(', '),
    topSongs: topSongs.slice(0, 5).map(s => s.name).join(', '),
    peakHour: `${peakHour}:00`,
    timePreference,
  };

  // 调用 LongCat 生成画像
  const prompt = `你是一个音乐品味分析师。根据以下听歌数据生成音乐 DNA 画像：

## 听歌数据
- 累计听歌: ${summaryData.totalSongs} 首
- 累计时长: ${summaryData.totalHours} 小时
- 独立歌手: ${summaryData.uniqueArtists} 位
- 独立歌曲: ${summaryData.uniqueSongs} 首
- Top 歌手: ${summaryData.topArtists}
- Top 歌曲: ${summaryData.topSongs}
- 高峰时段: ${summaryData.peakHour}
- 时段偏好: ${summaryData.timePreference}

## 输出格式 (JSON only)
{
  "title": "一个 2-4 字的品味标签，如'深夜浪漫派'、'夏日 chill 型'",
  "description": "一段 50-80 字的品味描述，有个性、有温度",
  "traits": [
    { "name": "能量值", "value": 0.0-1.0 },
    { "name": "浪漫值", "value": 0.0-1.0 },
    { "name": "探索欲", "value": 0.0-1.0 },
    { "name": "怀旧值", "value": 0.0-1.0 }
  ],
  "emoji": "一个代表风格的 emoji",
  "color": "一个 hex 颜色代码，代表你的音乐人格",
  "recommend_genre": "推荐探索的一个新风格"
}

只输出 JSON，不要其他内容。`;

  try {
    const raw = await callLongCat(prompt, 512);
    const parsed = parseJSON(raw);

    if (!parsed) {
      console.warn('[MusicDNA] JSON 解析失败，使用 fallback');
      return generateFallbackDNA(summaryData);
    }

    return {
      source: 'longcat',
      ...summaryData,
      title: parsed.title || '音乐探索者',
      description: parsed.description || '你有着独特的音乐品味',
      traits: Array.isArray(parsed.traits) ? parsed.traits : generateDefaultTraits(),
      emoji: parsed.emoji || '🎵',
      color: parsed.color || '#00F5D4',
      recommend_genre: parsed.recommend_genre || '独立音乐',
      generatedAt: Date.now(),
    };
  } catch (err) {
    console.error('[MusicDNA] LongCat 调用失败:', err.message);
    return generateFallbackDNA(summaryData);
  }
}

function getTimePreference(hourDist) {
  const morning = hourDist.slice(6, 12).reduce((a, b) => a + b, 0);
  const afternoon = hourDist.slice(12, 18).reduce((a, b) => a + b, 0);
  const evening = hourDist.slice(18, 24).reduce((a, b) => a + b, 0);
  const night = hourDist.slice(0, 6).reduce((a, b) => a + b, 0);

  const max = Math.max(morning, afternoon, evening, night);
  if (max === night) return '深夜型';
  if (max === evening) return '夜晚型';
  if (max === afternoon) return '午后型';
  if (max === morning) return '晨间型';
  return '均匀型';
}

function generateDefaultTraits() {
  return [
    { name: '能量值', value: 0.5 },
    { name: '浪漫值', value: 0.5 },
    { name: '探索欲', value: 0.5 },
    { name: '怀旧值', value: 0.5 },
  ];
}

function getEmptyDNA() {
  return {
    source: 'empty',
    totalSongs: 0,
    totalHours: 0,
    uniqueArtists: 0,
    uniqueSongs: 0,
    topArtists: '',
    topSongs: '',
    peakHour: '-',
    timePreference: '未知',
    title: '音乐新生儿',
    description: '还没有听歌记录，开始你的音乐之旅吧',
    traits: generateDefaultTraits(),
    emoji: '🌱',
    color: '#00F5D4',
    recommend_genre: '流行',
    generatedAt: Date.now(),
  };
}

function generateFallbackDNA(data) {
  const titles = [
    { condition: data.totalSongs > 100, title: '资深乐迷', emoji: '🎧' },
    { condition: data.timePreference === '深夜型', title: '深夜浪漫派', emoji: '🌙' },
    { condition: data.timePreference === '晨间型', title: '晨光音乐族', emoji: '🌅' },
    { condition: data.uniqueArtists > 50, title: '风格探索者', emoji: '🧭' },
    { condition: true, title: '音乐探索者', emoji: '🎵' },
  ];

  const match = titles.find(t => t.condition);

  return {
    source: 'fallback',
    ...data,
    title: match.title,
    description: `你累计听了 ${data.totalSongs} 首歌，${data.totalHours} 小时，最常在 ${data.peakHour} 听歌。`,
    traits: [
      { name: '能量值', value: 0.5 },
      { name: '浪漫值', value: 0.5 },
      { name: '探索欲', value: Math.min(data.uniqueArtists / 100, 1) },
      { name: '怀旧值', value: 0.4 },
    ],
    emoji: match.emoji,
    color: '#00F5D4',
    recommend_genre: '独立音乐',
    generatedAt: Date.now(),
  };
}

module.exports = {
  generateMusicDNA,
  getEmptyDNA,
};
