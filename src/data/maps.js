// Arena layouts. Obstacles are collision boxes {t,x,z,w,d,h,r}; `t` picks the
// visual (Blender prop or procedural). `sym` entries are mirrored through the
// centre (x,z) -> (-x,-z) so both spawns get the same terrain.
// Heading convention: forward = (sin h, cos h); blue spawns at +Z facing -Z.
const o = (t, x, z, w, d, h, r = 0) => ({ t, x, z, w, d, h, r });

function layout(solo, sym) {
  return [...solo, ...sym, ...sym.map(b => ({ ...b, x: -b.x, z: -b.z }))];
}

export const MAPS = {
  foundry: {
    id: 'foundry', name: 'FOUNDRY-9', subtitle: {"ru": "Литейный цех IRON HOUNDS", "en": "IRON HOUNDS foundry", "zh": "IRON HOUNDS 铸造厂"}, size: 120,
    blurb: {"ru": "Закрытый литейный цех в промзоне Меридиана. Узкие проходы между контейнерами и силосами, лужи раскалённого шлака. Длинных линий огня почти нет.", "en": "A shut-down foundry in Meridian’s industrial belt. Narrow lanes between containers and silos, pools of molten slag. Hardly any long sightlines.", "zh": "子午城工业带的一座停产铸造厂。集装箱和筒仓之间是狭窄通道，地上有熔渣池。几乎没有长射界。"},
    sky: { top: 0x120a08, horizon: 0x8a3f1c, sun: 0xffa060 },
    fog: { color: 0x3a2014, density: .0135 }, sightMul: 1,
    sun: { color: 0xffb070, intensity: 3.4, pos: [-40, 30, 26] }, hemi: { sky: 0xffc8a0, ground: 0x24140c, intensity: 1.3 },
    exposure: 1.05, floor: 'foundry', weather: 'embers', grade: { tint: [1.06, .98, .9], contrast: 1.08, saturation: 1.05 },
    accents: [[0xff6a1a, [0, 6, 22]], [0xff6a1a, [0, 6, -22]], [0xff8a3a, [-38, 5, 0]], [0xff8a3a, [38, 5, 0]]],
    decor: [{ t: 'slag', x: -24, z: 8, s: 7 }, { t: 'slag', x: 24, z: -8, s: 7 }, { t: 'slag', x: 0, z: 30, s: 4.5 }, { t: 'slag', x: 0, z: -30, s: 4.5 }],
    obstacles: layout([o('silo', 0, 0, 9, 9, 13)], [
      o('container', -14, 10, 12, 4.8, 5.2, .1), o('container', 20, -6, 4.8, 12, 10.4, .05), o('wall', -30, -18, 3, 16, 8, .2),
      o('silo', -32, 20, 7, 7, 11), o('barrier', -8, 26, 10, 2, 2.4, .3), o('crate', 9, 21, 4, 4, 4, .2), o('crate', 12.5, 24.5, 3, 3, 3, .5),
      o('wall', 34, 6, 14, 3, 7, -.1), o('container', -44, -4, 12, 4.8, 5.2, 1.4), o('barrier', 27, 31, 8, 2, 2.4, -.2), o('wall', -18, -35, 12, 3, 6, .15),
    ]),
    search: [[0, 22], [0, -22], [-36, 0], [36, 0], [-22, -24], [22, 24]],
  },
  whiteout: {
    id: 'whiteout', name: 'WHITEOUT STATION', subtitle: {"ru": "Полярная станция SILENT VECTOR", "en": "SILENT VECTOR polar station", "zh": "SILENT VECTOR 极地站"}, size: 120,
    blurb: {"ru": "Испытательный полигон Накамуры за полярным кругом. Метель сокращает обзор на треть, сенсорные мачты и скалы режут линии видимости.", "en": "Nakamura’s test range above the Arctic circle. The blizzard cuts sight by a third; sensor masts and rocks break the sightlines.", "zh": "中村位于北极圈的试验场。暴风雪让视野缩短三分之一，传感器桅杆和岩石切断视线。"},
    sky: { top: 0x8ea2b4, horizon: 0xdfe8ef, sun: 0xffffff },
    fog: { color: 0xa9b8c6, density: .017 }, sightMul: .66,
    sun: { color: 0xe6f0ff, intensity: 2.3, pos: [30, 40, -20] }, hemi: { sky: 0xdfefff, ground: 0x4a5560, intensity: 1.2 },
    exposure: .78, floor: 'snow', weather: 'snow', grade: { tint: [.93, .99, 1.07], contrast: 1.12, saturation: .9 },
    accents: [[0x49a6ff, [0, 5, 0]], [0x49a6ff, [-36, 9, -14]], [0x49a6ff, [36, 9, 14]]],
    decor: [{ t: 'drift', x: -20, z: -6, s: 9 }, { t: 'drift', x: 20, z: 6, s: 9 }, { t: 'drift', x: -40, z: 40, s: 12 }, { t: 'drift', x: 40, z: -40, s: 12 }],
    obstacles: layout([o('wall', 0, 0, 20, 4, 7)], [
      o('rock', -16, 14, 8, 7, 6, .4), o('rock', 22, 9, 6, 6, 5, 1.1), o('wall', -30, -6, 4, 18, 8, .1), o('wall', 14, -22, 14, 4, 7, -.2),
      o('pylon', -6, 30, 2.5, 2.5, 12), o('pylon', 36, -14, 2.5, 2.5, 12), o('rock', 40, 22, 9, 8, 7, .7), o('barrier', -24, 28, 9, 2, 2.4, .4),
      o('crate', 6, 16, 4, 4, 4, .3), o('container', -42, -30, 12, 4.8, 5.2, .6),
    ]),
    search: [[0, 18], [0, -18], [-30, 12], [30, -12], [-40, -10], [40, 10]],
  },
  neon: {
    id: 'neon', name: 'NEON YARD', subtitle: {"ru": "Подпольный двор BLACK SPARK", "en": "BLACK SPARK underground yard", "zh": "BLACK SPARK 地下场"}, size: 120,
    blurb: {"ru": "Бывшая арена подпольных боёв в Доках. Ночь, дождь, неон. Штабеля контейнеров складываются в лабиринт с засадой за каждым углом.", "en": "A former underground arena in the Docks. Night, rain, neon. Stacked containers form a maze with an ambush behind every corner.", "zh": "码头区一座昔日的地下竞技场。黑夜、雨水、霓虹。层叠的集装箱组成迷宫，每个拐角都可能有埋伏。"},
    sky: { top: 0x05030b, horizon: 0x2c0f3c, sun: 0xff3ad6 },
    fog: { color: 0x170a22, density: .02 }, sightMul: .9,
    sun: { color: 0x9a8cff, intensity: .9, pos: [20, 40, 30] }, hemi: { sky: 0x6a4a9a, ground: 0x100818, intensity: .9 },
    exposure: 1.15, floor: 'wet', weather: 'rain', grade: { tint: [1.02, .96, 1.08], contrast: 1.12, saturation: 1.2 },
    accents: [[0xff3ad6, [-34, 6, -10]], [0x2ee6ff, [34, 6, 10]], [0xff3ad6, [30, 6, -26]], [0x2ee6ff, [-30, 6, 26]], [0xff9a2e, [0, 8, 0]]],
    decor: [{ t: 'neon', x: -34, z: -10, s: 1, c: 0xff3ad6 }, { t: 'neon', x: 34, z: 10, s: 1, c: 0x2ee6ff }, { t: 'neon', x: 30, z: -24.4, s: 1, c: 0x2ee6ff, r: Math.PI / 2 }, { t: 'neon', x: -30, z: 24.4, s: 1, c: 0xff3ad6, r: Math.PI / 2 }],
    obstacles: layout([o('container', 0, 0, 12, 4.8, 10.4)], [
      o('container', -12, -14, 4.8, 12, 5.2), o('container', 18, 6, 12, 4.8, 10.4, .3), o('crate', -24, 8, 4, 4, 4, .2), o('crate', -27.5, 11.5, 3, 3, 3, .6),
      o('wall', -34, -10, 3, 18, 9), o('wall', 30, -26, 16, 3, 8), o('barrier', 6, -26, 10, 2, 2.4), o('container', 42, 18, 4.8, 12, 5.2),
      o('crate', 12, 31, 4, 4, 4, .4), o('wall', -40, 32, 12, 3, 7, .3),
    ]),
    search: [[0, 16], [0, -16], [-24, -2], [24, 2], [-42, 10], [42, -10]],
  },
  citadel: {
    id: 'citadel', name: 'THE CITADEL', subtitle: {"ru": "Шахматная площадь RED CASTLE", "en": "RED CASTLE chess plaza", "zh": "RED CASTLE 棋盘广场"}, size: 120,
    blurb: {"ru": "Площадь перед офисом лиги, расчерченная клетками по двадцать метров. Башни-ладьи, стены и чистые диагонали. Позиция решает больше, чем огневая мощь.", "en": "The plaza in front of league headquarters, marked in twenty-metre squares. Rook towers, walls and clean diagonals. Position matters more than firepower.", "zh": "联赛总部前的广场，划成二十米见方的格子。车形塔楼、墙体和干净的对角线。站位比火力更重要。"},
    sky: { top: 0x2a1c3a, horizon: 0xff9a55, sun: 0xffc07a },
    fog: { color: 0x7a4a3e, density: .011 }, sightMul: 1.05,
    sun: { color: 0xffc080, intensity: 3.1, pos: [-50, 22, -30] }, hemi: { sky: 0xffd0a8, ground: 0x2a1c1a, intensity: 1.2 },
    exposure: 1.02, floor: 'checker', weather: 'dust', grade: { tint: [1.07, .99, .92], contrast: 1.06, saturation: 1.08 },
    accents: [[0xffc15e, [0, 9, 0]], [0xffc15e, [-26, 8, -22]], [0xffc15e, [26, 8, 22]]],
    decor: [{ t: 'banner', x: -18, z: 7.2, s: 1 }, { t: 'banner', x: 18, z: -7.2, s: 1 }, { t: 'banner', x: -40, z: 8, s: 1 }, { t: 'banner', x: 40, z: -8, s: 1 }],
    obstacles: layout([o('rook', 0, 0, 8, 8, 14)], [
      o('wall', -18, 0, 3, 14, 7), o('rook', -26, -22, 6, 6, 11), o('wall', 10, -20, 16, 3, 6), o('rook', 30, 18, 6, 6, 11),
      o('wall', 40, -2, 3, 16, 8), o('crate', -12, 20, 4, 4, 4, .8), o('wall', -36, 30, 12, 3, 7), o('barrier', 20, 34, 8, 2, 2.4),
    ]),
    search: [[0, 20], [0, -20], [-30, 0], [30, 0], [-14, -30], [14, 30]],
  },
};

export const SPAWNS = {
  blue: [{ x: 0, z: 48 }, { x: -9, z: 46 }, { x: 9, z: 46 }],
  red: [{ x: 0, z: -48 }, { x: 9, z: -46 }, { x: -9, z: -46 }],
};
