// ====================================================================
//  AI DJ 电台 — LongCat 生成导播语 + 播放列表编排
// ====================================================================
const { callLongCatCached, sanitizeInput } = require('./longcat-client');

// 为单首歌生成导播语
async function generateSongIntro(song, context = {}) {
  const name = sanitizeInput(song.name, 100);
  const artist = sanitizeInput(song.artist, 100);
  const album = sanitizeInput(song.album, 100);
  const weather = sanitizeInput(context.weather, 50);
  const mood = sanitizeInput(context.mood, 50);
  const userName = sanitizeInput(context.userName, 50) || '听众';

  if (!name || !artist) {
    return { intro: '接下来为你播放', source: 'fallback' };
  }

  const prompt = `你是一个音乐 DJ，用一句话（30字以内）介绍这首歌，要有温度和个性。

歌曲: ${name}
歌手: ${artist}
专辑: ${album || '未知'}
当前天气: ${weather || '未知'}
当前情绪氛围: ${mood || '轻松'}
听众: ${userName}

要求：
- 30字以内
- 不要"接下来请听"之类的套话
- 可以联系天气、情绪、歌手故事
- 一句话，自然口语化
- 只输出介绍文字，不要引号`;

  // 缓存 key 基于歌曲和天气
  const cacheKey = `dj:intro:${name}:${artist}:${weather}:${mood}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 128, 'AI-DJ');
    let intro = raw.trim().replace(/^["'""]|["'""]$/g, '').trim();
    if (intro.length > 60) intro = intro.slice(0, 57) + '...';
    return { intro, source: 'longcat' };
  } catch (err) {
    console.error('[AI-DJ] 导播语生成失败:', err.message);
    return {
      intro: `接下来是 ${artist} 的《${name}》`,
      source: 'fallback',
    };
  }
}

// 为整个播放列表生成节目单
async function generatePlaylistScript(songs, context = {}) {
  const weather = sanitizeInput(context.weather, 50);
  const mood = sanitizeInput(context.mood, 50) || '轻松';
  const userName = sanitizeInput(context.userName, 50) || '听众';

  const songList = (songs || []).slice(0, 8).map((s, i) =>
    `${i + 1}. ${sanitizeInput(s.name, 50)} - ${sanitizeInput(s.artist, 50)}`
  ).join('\n');

  const prompt = `你是一个音乐电台 DJ，为以下播放列表写一段开场白（80字以内）。

播放列表:
${songList}

当前天气: ${weather || '未知'}
情绪氛围: ${mood}
听众: ${userName}

要求：
- 80字以内
- 概括这个列表的"旅程感"
- 有 DJ 的个性和温度
- 不要罗列歌名
- 只输出开场白文字`;

  const cacheKey = `dj:script:${weather}:${mood}:${songList.length}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 256, 'AI-DJ');
    return { script: raw.trim(), source: 'longcat' };
  } catch (err) {
    console.error('[AI-DJ] 节目单生成失败:', err.message);
    return {
      script: `为你准备了 ${(songs || []).length} 首歌，希望你喜欢`,
      source: 'fallback',
    };
  }
}

// 生成过渡语（歌与歌之间）
async function generateTransition(fromSong, toSong, context = {}) {
  const fromName = sanitizeInput(fromSong.name, 50);
  const fromArtist = sanitizeInput(fromSong.artist, 50);
  const toName = sanitizeInput(toSong.name, 50);
  const toArtist = sanitizeInput(toSong.artist, 50);
  const userName = sanitizeInput(context.userName, 50) || '听众';

  const prompt = `${userName} 刚听完 ${fromArtist} 的《${fromName}》，
接下来是 ${toArtist} 的《${toName}》。
用一句话（20字以内）自然过渡，不要套话。只输出文字。`;

  const cacheKey = `dj:trans:${fromName}:${fromArtist}:${toName}:${toArtist}`;

  try {
    const raw = await callLongCatCached(cacheKey, prompt, 96, 'AI-DJ');
    let text = raw.trim().replace(/^["'""]|["'""]$/g, '').trim();
    if (text.length > 40) text = text.slice(0, 37) + '...';
    return { text, source: 'longcat' };
  } catch (err) {
    return { text: `接下来，${toArtist} 的《${toName}》`, source: 'fallback' };
  }
}

module.exports = {
  generateSongIntro,
  generatePlaylistScript,
  generateTransition,
};
