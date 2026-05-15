// Load actual game sprites from the C++ project assets
const GameSprites = (() => {
  function img(src) {
    const i = new Image();
    i.src = src;
    return i;
  }

  return {
    // player_run.png: 192x128, 6 cols × 4 rows, each frame = 32x32
    // 4 rows = 4 different character skins (one per player slot)
    playerRun: { img: img('/assets/player_run.png'), fw: 32, fh: 32, cols: 6, rows: 4 },

    // rock.png: 128x92  — small chasers
    rock: img('/assets/rock.png'),

    // pingpong.png: 256x256 — big tanks (round ball)
    pingpong: img('/assets/pingpong.png'),

    // Pickup / decoration
    sheep:   img('/assets/sheep_idle.png'),    // 64x16, 4 frames 16x16
    chicken: img('/assets/chicken_idle.png'),
    pig:     img('/assets/pig_idle.png'),
  };
})();
