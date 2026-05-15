const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || null;
const LB_KEY = 'shooterz:leaderboard';
const LB_MAX = 100;

class Leaderboard {
  constructor() {
    this.redis = null;
    this.memory = []; // fallback if no Redis
    this._connect();
  }

  _connect() {
    if (!REDIS_URL) return;
    try {
      this.redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redis.on('error', () => { this.redis = null; });
    } catch (_) { this.redis = null; }
  }

  async submit(entry) {
    // entry: { name, wave, kills, time, mode, ts }
    const score = entry.wave * 10000 + entry.kills * 100 + Math.floor(entry.time);
    const data = JSON.stringify({ ...entry, score });

    if (this.redis) {
      try {
        await this.redis.zadd(LB_KEY, score, data);
        await this.redis.zremrangebyrank(LB_KEY, 0, -(LB_MAX + 1));
        return;
      } catch (_) {}
    }
    // In-memory fallback
    this.memory.push({ ...entry, score });
    this.memory.sort((a, b) => b.score - a.score);
    if (this.memory.length > LB_MAX) this.memory.length = LB_MAX;
  }

  async getTop(n = 20) {
    if (this.redis) {
      try {
        const raw = await this.redis.zrevrange(LB_KEY, 0, n - 1, 'WITHSCORES');
        const out = [];
        for (let i = 0; i < raw.length; i += 2) {
          try { out.push({ ...JSON.parse(raw[i]), score: parseInt(raw[i + 1]) }); } catch (_) {}
        }
        return out;
      } catch (_) {}
    }
    return this.memory.slice(0, n);
  }
}

module.exports = new Leaderboard();
