// Where the three movable panels sit: Districts, Map + Unit, and the village. Each goes in the left
// column, the right column or the bottom row, in any order. Pure functions (no herdr imports):
// they turn an arrangement into a layout tree, and a pointer position into a drop target.

export const ZONES = ["left", "right", "bottom"];
export const PANELS = { districts: "tableau", map: "commande", town: "place" }; // panel -> layout node id
export const DEFAULT = { left: ["districts"], right: [], bottom: ["map", "town"] };
const ROLE = { districts: "tableau", map: "commande", town: "place" };
const FILL = ["town", "districts", "map"]; // the first of these in a zone takes the room left over
const SIZE = { "col:districts": 360, "col:map": 400, "col:town": 320, "row:districts": 262, "row:map": 262, "row:town": 600, left: 262, right: 420, bottom: 400 };
const LINE = { width: 1, color: "#00000000", hover: "#f2c25a", active: "#ffe39a" };

export const find = (n, id) => (!n || typeof n !== "object" ? null : n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);

/** A stored arrangement, repaired so that every panel appears exactly once. */
export function valid(a) {
  const seen = new Set(), out = { left: [], right: [], bottom: [] };
  for (const z of ZONES) for (const p of a?.[z] ?? []) if (PANELS[p] && !seen.has(p)) { seen.add(p); out[z].push(p); }
  for (const z of ZONES) for (const p of DEFAULT[z]) if (!seen.has(p)) out[z].push(p);
  return out;
}

export const zoneOf = (a, panel) => ZONES.find((z) => a[z].includes(panel));

/** `panel` moved to `zone`, before the item at `index` (counted without it; omitted: last). */
export function move(a, panel, zone, index) {
  const out = {};
  for (const z of ZONES) out[z] = a[z].filter((p) => p !== panel);
  out[zone].splice(index ?? out[zone].length, 0, panel);
  return out;
}

/** One place earlier (-1) or later (+1) in its zone. */
export function shift(a, panel, by) {
  const z = zoneOf(a, panel), i = a[z].indexOf(panel);
  return move(a, panel, z, Math.max(0, Math.min(a[z].length - 1, i + by)));
}

/** The arrangement the tree shows. */
export function read(tree) {
  const out = {};
  for (const z of ZONES) out[z] = (find(tree, `zone-${z}`)?.children ?? []).map((c) => Object.keys(PANELS).find((p) => PANELS[p] === c.id)).filter(Boolean);
  return valid(out);
}

/** The sizes the person dragged, read from the shown tree and added to `sizes`. */
export function remember(tree, sizes) {
  const out = { ...sizes };
  for (const z of ZONES) {
    const node = find(tree, `zone-${z}`);
    if (!node) continue;
    if (node.size?.px) out[z] = node.size.px;
    for (const c of node.children ?? []) {
      const panel = Object.keys(PANELS).find((p) => PANELS[p] === c.id);
      if (panel && c.size?.px) out[`${z === "bottom" ? "row" : "col"}:${panel}`] = c.size.px;
    }
  }
  return out;
}

function zoneNode(zone, items, sizes) {
  const row = zone === "bottom", axis = row ? "row" : "col";
  const fill = FILL.find((p) => items.includes(p));
  const children = items.map((p) => ({
    id: PANELS[p], type: "block", content: { mod: "world-of-codecraft", props: { role: ROLE[p] } },
    size: p === fill ? { weight: 1 } : { px: sizes[`${axis}:${p}`] ?? SIZE[`${axis}:${p}`] },
    min: row ? 200 : 140, background: p === "districts" ? "#1d1410" : "#120c0e", hidden: false,
  }));
  return {
    id: `zone-${zone}`, type: row ? "row" : "column", size: { px: sizes[zone] ?? SIZE[zone] },
    min: row ? 140 : 200, max: 900, resizable: true, divider: LINE, ...(row ? {} : { gap: 6 }), children,
  };
}

/** The layout tree for arrangement `a`. Immersive: the big village takes the centre, and the other
 *  bottom panels go under the left column. Everything else in the tree is kept as it is. */
export function build(tree, a, immersive, sizes) {
  const centre = JSON.parse(JSON.stringify(find(tree, "droite")));
  const big = find(centre, "place-immersion"), arena = find(centre, "arene");
  big.hidden = !immersive;
  arena.size = immersive ? { px: 400 } : { weight: 1 };
  const shown = immersive
    ? { left: [...a.left, ...a.bottom].filter((p) => p !== "town"), right: a.right.filter((p) => p !== "town"), bottom: [] }
    : a;
  const zone = (z) => (shown[z].length ? [zoneNode(z, shown[z], sizes)] : []);
  const corps = find(tree, "corps"), bourg = find(tree, "bourg");
  const middle = { ...bourg, resizable: true, divider: LINE, children: [...zone("left"), centre, ...zone("right")] };
  return {
    ...tree,
    children: [find(tree, "fronton"), { ...corps, resizable: true, divider: LINE, children: [middle, ...zone("bottom")] }],
  };
}

/** Where a panel dragged to `pos` (window px) lands, or null over the terminals. geo: winW, zoom,
 *  railH (height of the frame's side rail) and size: { panel: { w, h } }, all window px. */
export function dropTarget(pos, a, panel, geo) {
  const z = geo.zoom, top = 54 * z, topEnd = geo.railH + 88 * z;
  const others = (zone) => a[zone].filter((p) => p !== panel);
  const width = (zone) => Math.max(geo.winW * 0.2, ...a[zone].map((p) => geo.size[p]?.w ?? 0));
  let zone = null;
  if (pos.y > topEnd - (a.bottom.length ? 0 : topEnd * 0.15)) zone = "bottom";
  else if (pos.x < width("left")) zone = "left";
  else if (pos.x > geo.winW - width("right")) zone = "right";
  if (!zone) return null;
  const row = zone === "bottom", items = others(zone);
  let at = row ? 0 : top, index = 0;
  for (const p of items) {
    const len = (row ? geo.size[p]?.w : geo.size[p]?.h) ?? 0;
    if ((row ? pos.x : pos.y) > at + len / 2) index++;
    at += len;
  }
  return { zone, index };
}
