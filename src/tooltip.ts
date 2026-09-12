import { GLOSSARY } from "./glossary";

const GAP = 8;

const STORAGE_KEY = "pan-tips";

export function installTooltips(toggle: HTMLInputElement): void {
  let enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  toggle.checked = enabled;
  toggle.onchange = () => {
    enabled = toggle.checked;
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  };

  const tip = document.createElement("div");
  tip.id = "tooltip";
  tip.hidden = true;
  const title = document.createElement("div");
  title.className = "tooltip-title";
  const text = document.createElement("div");
  tip.append(title, text);
  const popover = "showPopover" in tip;
  if (popover) tip.setAttribute("popover", "manual");
  document.body.append(tip);
  let current: Element | null = null;

  const hide = () => {
    current = null;
    if (popover && tip.matches(":popover-open")) tip.hidePopover();
    tip.hidden = true;
  };

  const show = (target: Element) => {
    const key = target.getAttribute("data-tip") ?? "";
    const entry = GLOSSARY[key];
    if (!entry || (!enabled && key !== "tips")) return hide();
    current = target;
    title.textContent = entry[0];
    text.textContent = entry[1];
    tip.hidden = false;
    if (popover) tip.showPopover();
    const rect = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - width - GAP);
    left = Math.max(GAP, left);
    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - GAP) top = Math.max(GAP, rect.top - height - GAP);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const from = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);
  document.addEventListener("mouseover", (e) => {
    const target = from(e);
    if (target === current) return;
    if (target) show(target);
    else hide();
  });
  document.addEventListener("mouseleave", hide);
  document.addEventListener("focusin", (e) => {
    const target = from(e);
    if (target) show(target);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}
