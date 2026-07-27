// ====================================================================
//  音乐 DNA 画像引擎 — 分析用户听歌历史，生成品味画像
// ====================================================================
const { callLongCatCached, parseJSON, sanitizeInput } = require('./longcat-client');

// 分析听歌历史，生成 DNA 画像
async function generateMusicDNA(listenHistory) {
  // 限制历史记录数量，避免 prompt 过长
  const history = (listenHistory || []).slice(-50);
  const totalSongs = history.length;

  if (totalSongs === 0) {
    return getEmptyDNA();
  }

  // 统计基础数据
  const artistCount = {};
  const nameCount = {};
  const hourDistribution = new Array(24).fill(0);
  let totalDuration = 0;

  history.forEach(song => {
    if (!song || !song.artist) return;
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

  // 缓存 key 基于统计数据
  const cacheKey = `dna:${totalSongs}:${summaryData.uniqueArtists}:${summaryData.topArtists}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 512, 'MusicDNA');
    const parsed = parseJSON(raw);

    if (!parsed) {
      console.warn('[MusicDNA] JSON 解析失败，使用 fallback');
      return generateFallbackDNA(summaryData);
    }

    return {
      source: 'longcat',
      ...summaryData,
      title: sanitizeInput(parsed.title, 20) || '音乐探索者',
      description: sanitizeInput(parsed.description, 200) || '你有着独特的音乐品味',
      traits: Array.isArray(parsed.traits) ? parsed.traits.slice(0, 4) : generateDefaultTraits(),
      emoji: sanitizeInput(parsed.emoji, 10) || '🎵',
      color: sanitizeInput(parsed.color, 10) || '#00F5D4',
      recommend_genre: sanitizeInput(parsed.recommend_genre, 50) || '独立音乐',
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
