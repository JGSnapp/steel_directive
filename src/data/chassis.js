// Chassis stats. Models are produced by tools/blender/build_assets.py.
// HP_SCALE stretches fights to ~1.5-2 minutes so plans have time to play out.
const HP_SCALE = 1.7;
export const CHASSIS = {
  // The 2064 piloted frame from the Ring Incident; cutscene only, never offered in the briefing.
  ring: {
    id: 'ring', hidden: true, armor: { kinetic: 1, explosive: 1, rail: 1, thermal: 1 }, armorNote: '', name: 'RING-07', model: 'mech_ring', hp: 300 * HP_SCALE, speed: 5.6, turn: .9, torsoTurn: 1.2,
    sensor: 60, fov: Math.PI * .8, radius: 2.15, height: 7.8, blurb: '',
  },
  pathfinder: {
    id: 'pathfinder', armor: { kinetic: 1, explosive: 1, rail: 1, thermal: 1 }, armorNote: {"ru": "Стандартное шасси лиги. Ни сильных, ни слабых сторон брони.", "en": "Standard league armor with no strengths or weaknesses.", "zh": "联赛标准装甲，没有长处也没有短板。"}, name: 'PATHFINDER', model: 'mech_pathfinder', hp: 300 * HP_SCALE, speed: 6.2, turn: .95, torsoTurn: 1.3,
    sensor: 62, fov: Math.PI * .8, radius: 2.05, height: 7.6,
    blurb: {"ru": "Лига выпустила их четыреста штук для первого сезона после Акта. Средняя скорость, средняя броня, широкий обзор. Хорошая база, чтобы понять, чего не хватает.", "en": "The league built four hundred of these for the first season after the Act. Average speed, average armor, wide sensors. A good base for finding out what you’re missing.", "zh": "法案之后的第一个赛季，联赛造了四百台。速度中等、装甲中等、视野宽阔。用来摸清自己缺什么，很合适。"},
  },
  hound: {
    id: 'hound', armor: { kinetic: 1, explosive: .8, rail: 1, thermal: 1 }, armorNote: {"ru": "Тяжёлые плиты гасят пятую часть урона от взрывов.", "en": "Heavy plates soak a fifth of explosive damage.", "zh": "厚重装甲板吸收五分之一的爆炸伤害。"}, name: 'HOUND', model: 'mech_hound', hp: 340 * HP_SCALE, speed: 5.4, turn: .8, torsoTurn: 1.1,
    sensor: 56, fov: Math.PI * .72, radius: 2.3, height: 7.8,
    blurb: {"ru": "Шасси IRON HOUNDS. Самое прочное в лиге после CASTLE, но самое медленное: 5,4 м/с. Узкий сектор обзора, торс поворачивается тяжело.", "en": "The IRON HOUNDS chassis. Toughest in the league after CASTLE and the slowest at 5.4 m/s. Narrow field of view and a heavy torso traverse.", "zh": "IRON HOUNDS 的底盘。耐久仅次于 CASTLE，但速度最慢，5.4 米/秒。视野窄，躯干转动沉重。"},
  },
  vector: {
    id: 'vector', armor: { kinetic: .68, explosive: 1.5, rail: 1, thermal: 1 }, armorNote: {"ru": "Дефлекторы срезают треть урона от пуль. Композит получает в полтора раза больше от взрывов.", "en": "Deflectors cut a third of bullet damage. The composite takes 1.5× from explosions.", "zh": "偏转护盾削减三分之一子弹伤害。复合装甲承受 1.5 倍爆炸伤害。"}, name: 'VECTOR', model: 'mech_vector', hp: 220 * HP_SCALE, speed: 7.2, turn: 1.05, torsoTurn: 1.55,
    sensor: 76, fov: Math.PI * .95, radius: 1.95, height: 8.2,
    blurb: {"ru": "Разведчик SILENT VECTOR с прошивкой Накамуры. Видит дальше всех, 76 м, и почти по кругу. Брони мало, поэтому VECTOR воюет издалека и прячется.", "en": "The SILENT VECTOR scout running Nakamura’s firmware. Sees furthest of all, 76 m, almost all the way around. Light armor, so it fights from range and hides.", "zh": "SILENT VECTOR 的侦察机，运行中村的固件。看得最远，76 米，几乎无死角。装甲薄，所以远程作战并躲藏。"},
  },
  spark: {
    id: 'spark', armor: { kinetic: .4, explosive: .7, rail: 1.5, thermal: .75 }, armorNote: {"ru": "Энергощиты пропускают 40% пуль и 75% нагрева. ЭМ-удар рельсы бьёт в полтора раза сильнее.", "en": "Energy shields let through 40% of bullets and 75% of heat. An EM rail hit does 1.5×.", "zh": "能量护盾只让 40% 的子弹和 75% 的热能伤害通过。电磁炮造成 1.5 倍伤害。"}, name: 'SPARK', model: 'mech_spark', hp: 240 * HP_SCALE, speed: 7.9, turn: 1.2, torsoTurn: 1.6,
    sensor: 58, fov: Math.PI * .8, radius: 1.95, height: 7.4,
    blurb: {"ru": "Гоночная рама BLACK SPARK, 7,9 м/с, самая быстрая в лиге. Щиты Вера сняла с промышленных погрузчиков в Доках.", "en": "BLACK SPARK’s racing frame, 7.9 m/s, the fastest in the league. Vera pulled the shields off industrial loaders in the Docks.", "zh": "BLACK SPARK 的赛车框架，7.9 米/秒，联赛最快。护盾是薇拉从码头区的工业装卸机上拆下来的。"},
  },
  castle: {
    id: 'castle', armor: { kinetic: .6, explosive: .6, rail: .75, thermal: 1.8 }, armorNote: {"ru": "Керамика держит пули, взрывы и рельсу. Нагрев проходит почти вдвое сильнее.", "en": "Ceramics hold bullets, blasts and rails. Heat gets through at nearly double.", "zh": "陶瓷装甲挡得住子弹、爆炸和电磁炮，热能伤害接近翻倍。"}, name: 'CASTLE', model: 'mech_castle', hp: 300 * HP_SCALE, speed: 5.9, turn: .9, torsoTurn: 1.25,
    sensor: 64, fov: Math.PI * .82, radius: 2.15, height: 8.4,
    blurb: {"ru": "Шасси RED CASTLE. Керамические плиты, корона-радар и тяжёлый торс. Медленнее VECTOR, крепче всех, кроме элитного HOUND.", "en": "The RED CASTLE chassis. Ceramic plates, a crown radar and a heavy torso. Slower than VECTOR, tougher than anything except an elite HOUND.", "zh": "RED CASTLE 的底盘。陶瓷装甲板、王冠雷达和沉重的躯干。比 VECTOR 慢，耐久仅次于精英 HOUND。"},
  },
};

// Material role colours: [paint_primary, paint_secondary, trim, glow].
export const PALETTES = {
  league2064: [0xd8d2c4, 0xd4601a, 0x3a3f44, 0xff9b3a],
  league2064b: [0x2a3f5c, 0xe8e4d8, 0x3a3f44, 0x6ab8ff],
  signal: [0x2f4a52, 0x15252a, 0x8aa1a6, 0x3fe0f5],
  signalAlt: [0x3a4f58, 0x1c2c33, 0x9fb3b8, 0x7cf7ff],
  hounds: [0x1c1c1f, 0xb3161b, 0xd9d9d6, 0xff2a1f],
  vector: [0xe8edf2, 0x1b2446, 0x9aa7b8, 0x49a6ff],
  spark: [0x151219, 0xd4148c, 0x3a3440, 0xff3ad6],
  castle: [0x2a1a18, 0x8e1420, 0xc9a24a, 0xffc15e],
};
