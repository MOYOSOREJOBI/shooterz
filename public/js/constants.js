// Shared between server and client (loaded via <script> on client, require() on server)

const C = {
  // Arena (world units = pixels at 1x scale)
  ARENA_W: 740,
  ARENA_H: 540,
  ARENA_HW: 370,  // half-width
  ARENA_HH: 270,  // half-height

  // Physics (pixels per second)
  PLAYER_SPEED: 250,
  PROJ_SPEED: 520,
  CHASER_SPEED: 150,   // 50% faster than original
  TANK_SPEED: 80,      // 50% faster than original

  // Sizes (pixels, radius for circles)
  PLAYER_R: 14,
  CHASER_R: 12,
  TANK_R: 20,
  PROJ_W: 10,
  PROJ_H: 4,
  PICKUP_R: 10,

  // HP
  PLAYER_HP: 100,
  CHASER_HP: 30,
  TANK_HP: 90,

  // Damage
  PROJ_DAMAGE_ENEMY: 20,    // vs enemies (5 shots to kill chaser)
  PROJ_DAMAGE_PLAYER: 0.2,  // vs players (500 shots to kill)
  CHASER_DAMAGE: 15,
  TANK_DAMAGE: 25,
  PICKUP_HEAL: 30,

  // Timings (seconds)
  FIRE_CD: 0.18,
  HIT_CD: 0.8,
  WAVE_GRACE: 2.0,          // 50% faster (original 4.0)
  PICKUP_CHANCE: 0.4,

  // Server
  TICK_RATE: 60,            // server physics Hz
  SEND_RATE: 20,            // state broadcast Hz
  MAX_PLAYERS: 4,

  // Game modes
  MODES: {
    SOLO:     'solo',
    V1V1:     '1v1',
    V1V1V1:   '1v1v1',
    V1V1V1V1: '1v1v1v1',
    V2V2:     '2v2',
    COOP:     'coop',
  },

  // Entity types
  TYPE: {
    PLAYER:     'player',
    CHASER:     'chaser',
    TANK:       'tank',
    PROJECTILE: 'proj',
    PICKUP:     'pickup',
  },

  // Events
  EVT: {
    JOIN:        'join_room',
    LEAVE:       'leave_room',
    INPUT:       'input',
    STATE:       'game_state',
    EVENT:       'game_event',
    GAME_OVER:   'game_over',
    LEADERBOARD: 'leaderboard',
    ROOM_LIST:   'room_list',
    ROOM_JOINED: 'room_joined',
    CHAT:        'chat',
    PING:        'ping',
    PONG:        'pong',
  },

  // Team colors (RGBA strings)
  TEAM_COLORS: ['#00d4ff', '#ff4455', '#44ff88', '#ffcc00'],
  TEAM_NAMES:  ['Blue', 'Red', 'Green', 'Gold'],

  // Avatar names pool
  AVATAR_NAMES: [
    'Blaze','Nova','Viper','Storm','Echo','Raze','Flux','Neon',
    'Frag','Kira','Zoid','Pyro','Volt','Axe','Grim','Luna',
    'Rex','Dusk','Ace','Bolt','Riot','Hex','Claw','Dread'
  ],
};

if (typeof module !== 'undefined') module.exports = C;
