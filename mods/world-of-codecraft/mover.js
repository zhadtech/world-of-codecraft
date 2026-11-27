// The « ∷ » grip in each movable panel's top right corner. Drag it and release over the left
// side, the right side or the bottom; or click it for buttons. Every move rebuilds the layout tree
// (layout.set).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, layout, notify, shared, setShared } from "herdr";
import { ZONES, DEFAULT, find, read, valid, zoneOf, move, shift, remember, build, dropTarget } from "./arrange.js";
import { P, txt } from "./ui.js";
import { t } from "./i18n.js";

/** Sizes in window px, written by the top bar, the rail and the panels, to find the drop target. */
export const GEO = { winW: 0, zoom: 1, railH: 0, size: {}, watcher: null };

export function immersive() {
  try { const n = find(layout(), "place-immersion"); return Boolean(n && !n.hidden); } catch { return false; }
}
/** The shown layout is the truth, so a reset or reinstalled layout stays right. The immersive tree
 *  moves panels aside for a while: then the stored arrangement is the one to go back to. */
export function arrangement() {
  return immersive() ? valid(shared("wocc.arr")) : read(layout());
}
export function slotShown(id) {
  try { const n = find(layout(), id); return Boolean(n && !n.hidden); } catch { return false; }
}

export function apply(next, imm = immersive()) {
  const tree = layout();
  // the immersive tree is a temporary shape: its sizes aren't the person's
  const sizes = immersive() ? shared("wocc.sizes") ?? {} : remember(tree, shared("wocc.sizes") ?? {});
  setShared("wocc.sizes", sizes);
  setShared("wocc.arr", next);
  send(build(tree, next, imm, sizes)).catch((e) => notify({ title: "World of Codecraft", body: `${t("moveFailed")} ${e}`, level: "error" }));
}

// Through the command line: run() refuses arguments nested more than 16 levels, as this tree is.
async function send(tree) {
  const r = await exec("herdr-app", ["do", "layout.set", "--layout", JSON.stringify(tree)]);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (!/"ok":\s*true/.test(out)) throw new Error(out.slice(0, 200));
}

const chip = (id, label, on) => div().id(id).flex_none().h(20).px(5).flex().items_center().justify_center().rounded(2).cursor_pointer()
  .bg(on ? P.parch : "#0b0810e6").hover((s) => s.bg(on ? P.parch : "#3a2c40"))
  .child(txt(label, 13, on ? P.ink2 : P.cream, 800));

/** `view` is the panel's object: it keeps the drag and open state. */
export function mover(view, panel) {
  if (immersive()) return div();
  const a = arrangement(), here = zoneOf(a, panel), names = t("zones");
  const target = (pos) => dropTarget(pos, a, panel, GEO);
  const finish = (e, cx, released) => {
    const d = view.moving;
    if (!d) return;
    view.moving = null;
    cx.notify();
    if (!released) return;
    if (!d.moved) { view.open = !view.open; return; }
    const to = target(e.position);
    if (to) apply(move(a, panel, to.zone, to.index));
  };
  const to = view.moving?.to;
  const label = view.moving?.moved ? (to ? t("moveDrop", names[to.zone], to.index + 1) : t("moveNone")) : "∷";
  const grip = chip(`grip-${panel}`, label, Boolean(view.moving)).cursor_grab().tooltip(t("moveTip"))
    .on_mouse_down("left", (e, cx) => { view.moving = { x: e.position.x, y: e.position.y, to: null, moved: false }; cx.stop_propagation(); cx.notify(); })
    .on_window_mouse_move((e, cx) => {
      const d = view.moving;
      if (!d) return;
      if (e.pressed_button !== "left") { finish(e, cx, false); return; }
      const moved = d.moved || Math.hypot(e.position.x - d.x, e.position.y - d.y) > 8;
      const next = target(e.position);
      if (moved !== d.moved || JSON.stringify(next) !== JSON.stringify(d.to)) { d.moved = moved; d.to = next; cx.notify(); }
    })
    .on_window_mouse_up("left", (e, cx) => finish(e, cx, true));
  const button = (id, text, on, fn) => chip(`${id}-${panel}`, text, on).on_click((_e, cx) => { view.open = false; cx.notify(); fn(); });
  const i = a[here].indexOf(panel), row = here === "bottom";
  const order = [[-1, row ? "←" : "↑", i > 0], [1, row ? "→" : "↓", i < a[here].length - 1]].filter(([, , can]) => can);
  return v_flex().id(`mover-${panel}`).absolute().right(3).top(3).gap(3).items_end()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(grip)
    .when(Boolean(view.open), (el) => el
      .child(h_flex().gap(3).children(ZONES.map((z) => button(`to-${z}`, names[z], z === here, () => { if (z !== here) apply(move(a, panel, z)); }))))
      .child(h_flex().gap(3)
        .children(order.map(([by, arrow]) => button(`by${by}`, arrow, false, () => apply(shift(a, panel, by)))))
        .child(button("reset", t("moveReset"), false, () => apply(DEFAULT)))));
}
