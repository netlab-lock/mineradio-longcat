// ====================================================================
//  高级 AI 功能 — 自然语言点歌 / 歌词分析 / 智能歌单 / 音乐问答
// ====================================================================
const { callLongCatCached, parseJSON, sanitizeInput } = require('./longcat-client');

// ========== 1. 自然语言点歌 ==========
async function naturalLanguageSearch(query, context = {}) {
  const cleanQuery = sanitizeInput(query, 200);
  const weather = sanitizeInput(context.weather, 50);
  const mood = sanitizeInput(context.mood, 50);

  const prompt = `你是一个音乐搜索助手。用户用自然语言描述他们想听的歌，你需要理解并转换为搜索关键词。

用户说: "${cleanQuery}"
当前天气: ${weather || '未知'}
当前情绪: ${mood || '未知'}

请分析用户的真实需求，输出:
1. 核心搜索关键词（2-4个）
2. 音乐风格/年代/场景标签
3. 为什么这样推荐（一句话）

## 输出格式 (JSON only)
{
  "keywords": ["关键词1", "关键词2"],
  "tags": ["风格标签", "年代标签", "场景标签"],
  "reason": "一句话解释"
}

示例:
用户: "我想听那种闷热夜晚空调房里听的歌"
输出: {"keywords": ["夏日 chill", "空调房 R&B", "夜晚 lo-fi"], "tags": ["chill", "R&B", "夜晚"], "reason": "闷热天气适合听清凉舒缓的音乐"}

只输出 JSON，不要其他内容。`;

  const cacheKey = `nls:${cleanQuery}:${weather}:${mood}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 256, 'NLSearch');
    const parsed = parseJSON(raw);

    if (!parsed) {
      return {
        keywords: [cleanQuery],
        tags: [],
        reason: '按原词搜索',
        source: 'fallback',
      };
    }

    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 4) : [cleanQuery],
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      reason: sanitizeInput(parsed.reason, 100),
      source: 'longcat',
    };
  } catch (err) {
    console.error('[NLSearch] 失败:', err.message);
    return {
      keywords: [cleanQuery],
      tags: [],
      reason: '按原词搜索',
      source: 'fallback',
    };
  }
}

// ========== 2. 歌词分析 ==========
async function analyzeLyrics(lyric, songInfo = {}) {
  const cleanLyric = sanitizeInput(lyric, 2000);
  const title = sanitizeInput(songInfo.name, 100);
  const artist = sanitizeInput(songInfo.artist, 100);

  if (!cleanLyric || cleanLyric.length < 20) {
    return {
      summary: '歌词太短，无法分析',
      sentiment: 'neutral',
      keywords: [],
      translation: '',
      source: 'fallback',
    };
  }

  const prompt = `你是一个歌词分析师。分析以下歌词的情感、主题和关键词。

歌曲: ${title || '未知'}
歌手: ${artist || '未知'}
歌词:
${cleanLyric.slice(0, 1500)}

请输出:
1. 歌词主题总结（50字以内）
2. 情感倾向（positive/neutral/negative/mixed）
3. 关键词（3-5个）
4. 一句点评（30字以内）

## 输出格式 (JSON only)
{
  "summary": "主题总结",
  "sentiment": "positive/neutral/negative/mixed",
  "keywords": ["关键词1", "关键词2"],
  "comment": "一句点评"
}

只输出 JSON，不要其他内容。`;

  const cacheKey = `lyric:${title}:${artist}:${cleanLyric.length}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 256, 'Lyric');
    const parsed = parseJSON(raw);

    if (!parsed) {
      return {
        summary: '歌词分析中...',
        sentiment: 'neutral',
        keywords: [],
        comment: '',
        source: 'fallback',
      };
    }

    return {
      summary: sanitizeInput(parsed.summary, 100),
      sentiment: ['positive', 'neutral', 'negative', 'mixed'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
      comment: sanitizeInput(parsed.comment, 50),
      source: 'longcat',
    };
  } catch (err) {
    console.error('[Lyric] 分析失败:', err.message);
    return {
      summary: '歌词分析中...',
      sentiment: 'neutral',
      keywords: [],
      comment: '',
      source: 'fallback',
    };
  }
}

// ========== 3. 智能播放列表生成 ==========
async function generateSmartPlaylist(scenario, options = {}) {
  const cleanScenario = sanitizeInput(scenario, 200);
  const count = Math.min(Math.max(options.count || 8, 3), 15);
  const weather = sanitizeInput(options.weather, 50);
  const mood = sanitizeInput(options.mood, 50);

  const prompt = `你是一个音乐播放列表策划师。根据用户场景生成一个播放列表。

场景: "${cleanScenario}"
天气: ${weather || '未知'}
情绪: ${mood || '轻松'}
歌曲数量: ${count} 首

请生成一个符合场景的播放列表，每首歌需要:
1. 歌名（可以是真实存在的歌，也可以是描述性的）
2. 艺术家
3. 为什么适合这个场景（一句话）

## 输出格式 (JSON only)
{
  "title": "播放列表名称（10字以内）",
  "description": "播放列表描述（30字以内）",
  "songs": [
    {"name": "歌名", "artist": "艺术家", "reason": "为什么适合"}
  ]
}

只输出 JSON，不要其他内容。`;

  const cacheKey = `pl:${cleanScenario}:${count}:${weather}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 512, 'Playlist');
    const parsed = parseJSON(raw);

    if (!parsed || !Array.isArray(parsed.songs)) {
      return generateFallbackPlaylist(cleanScenario, count);
    }

    return {
      title: sanitizeInput(parsed.title, 20) || '智能歌单',
      description: sanitizeInput(parsed.description, 50) || cleanScenario,
      songs: parsed.songs.slice(0, count).map(s => ({
        name: sanitizeInput(s.name, 50),
        artist: sanitizeInput(s.artist, 50),
        reason: sanitizeInput(s.reason, 80),
      })),
      source: 'longcat',
    };
  } catch (err) {
    console.error('[Playlist] 生成失败:', err.message);
    return generateFallbackPlaylist(cleanScenario, count);
  }
}

function generateFallbackPlaylist(scenario, count) {
  const playlists = {
    '深夜学习': { title: '深夜专注', songs: [{name: 'Lo-fi Study', artist: 'Chillhop'}, {name: 'Deep Focus', artist: 'Ambient'}] },
    '运动健身': { title: '运动能量', songs: [{name: 'Eye of the Tiger', artist: 'Survivor'}, {name: 'Stronger', artist: 'Kanye West'}] },
    '雨天': { title: '雨天心情', songs: [{name: 'Rainy Day', artist: 'Jazz'}, {name: 'Umbrella', artist: 'Rihanna'}] },
    '旅行': { title: '路上风景', songs: [{name: 'On the Road', artist: 'Travel'}, {name: 'Country Roads', artist: 'John Denver'}] },
  };

  const match = Object.entries(playlists).find(([k]) => scenario.includes(k));
  if (match) return { ...match[1], source: 'fallback' };

  return {
    title: '为你推荐',
    description: scenario,
    songs: [{name: '热门推荐', artist: 'Various Artists'}],
    source: 'fallback',
  };
}

// ========== 4. 音乐知识问答 ==========
async function generateMusicQuiz(difficulty = 'medium') {
  const prompt = `你是一个音乐知识问答游戏主持人。生成一道音乐知识选择题。

难度: ${difficulty} (easy/medium/hard)

题目类型随机选择:
- 歌词填空（给出一句歌词，问出自哪首歌）
- 歌手识别（给出歌名，问歌手是谁）
- 音乐年代（给出一首歌，问发行年代）
- 音乐风格（给出一首歌，问属于什么风格）
- 音乐冷知识（有趣的音乐相关常识）

要求:
1. 题目要有趣、有挑战性但不过于冷门
2. 选项 4 个，只有 1 个正确
3. 给出正确答案的解释（30字以内）

## 输出格式 (JSON only)
{
  "question": "题目文字",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "answer": 0-3,
  "explanation": "正确答案解释",
  "type": "歌词/歌手/年代/风格/冷知识"
}

只输出 JSON，不要其他内容。`;

  const cacheKey = `quiz:${difficulty}:${Date.now() % 1000000}`; // 不缓存问答，每次不同

  try {
    const { callLongCat } = require('./longcat-client');
    const raw = await callLongCat(prompt, 256, 'Quiz');
    const parsed = parseJSON(raw);

    if (!parsed || !Array.isArray(parsed.options)) {
      return generateFallbackQuiz();
    }

    return {
      question: sanitizeInput(parsed.question, 200),
      options: parsed.options.slice(0, 4).map(o => sanitizeInput(o, 50)),
      answer: typeof parsed.answer === 'number' && parsed.answer >= 0 && parsed.answer <= 3 ? parsed.answer : 0,
      explanation: sanitizeInput(parsed.explanation, 80),
      type: sanitizeInput(parsed.type, 20),
      source: 'longcat',
    };
  } catch (err) {
    console.error('[Quiz] 生成失败:', err.message);
    return generateFallbackQuiz();
  }
}

function generateFallbackQuiz() {
  const quizzes = [
    {
      question: '"夜空中最亮的心"是哪首歌的歌词？',
      options: ['夜曲', '星空', '夜空中最亮的星', '流星'],
      answer: 2,
      explanation: '逃跑计划的《夜空中最亮的星》',
      type: '歌词',
    },
    {
      question: '《青花瓷》的作曲者是？',
      options: ['周杰伦', '方文山', '林俊杰', '王力宏'],
      answer: 0,
      explanation: '周杰伦作曲，方文山填词',
      type: '歌手',
    },
  ];
  return quizzes[Math.floor(Math.random() * quizzes.length)];
}

// ========== 5. 听歌时间轴统计 ==========
function generateTimelineStats(listenHistory) {
  const history = (listenHistory || []).slice(-200);

  if (history.length === 0) {
    return {
      totalSongs: 0,
      totalMinutes: 0,
      byHour: [],
      byDay: [],
      byArtist: [],
      streaks: 0,
      source: 'empty',
    };
  }

  // 按小时统计
  const hourMap = {};
  const dayMap = {};
  const artistMap = {};
  const dateSet = new Set();

  history.forEach(song => {
    const d = new Date(song.timestamp);
    const hour = d.getHours();
    const day = d.toISOString().slice(0, 10);

    hourMap[hour] = (hourMap[hour] || 0) + 1;
    dayMap[day] = (dayMap[day] || 0) + 1;
    dateSet.add(day);

    if (song.artist) {
      artistMap[song.artist] = (artistMap[song.artist] || 0) + 1;
    }
  });

  // 计算连续听歌天数
  const dates = Array.from(dateSet).sort();
  let streaks = 0;
  let maxStreaks = 0;
  for (let i = 0; i < dates.length; i++) {
    if (i === 0) {
      streaks = 1;
    } else {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      streaks = diff <= 1 ? streaks + 1 : 1;
    }
    maxStreaks = Math.max(maxStreaks, streaks);
  }

  // 格式化输出
  const byHour = Object.entries(hourMap)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
    .sort((a, b) => a.hour - b.hour);

  const byDay = Object.entries(dayMap)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);

  const byArtist = Object.entries(artistMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSongs: history.length,
    totalMinutes: Math.round(history.reduce((s, h) => s + (h.duration || 0), 0) / 60000),
    byHour,
    byDay,
    byArtist,
    streaks: maxStreaks,
    topDay: byDay.sort((a, b) => b.count - a.count)[0] || null,
    source: 'computed',
  };
}

module.exports = {
  naturalLanguageSearch,
  analyzeLyrics,
  generateSmartPlaylist,
  generateMusicQuiz,
  generateTimelineStats,
};
