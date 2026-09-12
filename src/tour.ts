interface TourStep {
  target: string | null;
  title: string;
  text: string;
  needsFile?: boolean;
  action?: string;
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: "Welcome",
    text: "This viewer plays the PAN animation files from Covert Action and shows the virtual machine driving them. This tour takes about a minute. Use Next and Back, or Skip to leave at any time.",
  },
  {
    target: ".file-pick",
    title: "Open a file",
    text: "Pick a .PAN file with this button, or drop one anywhere on the page. Nothing is uploaded; everything runs in your browser. No game files to hand? Load the demo animation instead. Open one now to continue.",
    needsFile: true,
    action: "Load demo",
  },
  {
    target: "#screen-wrap",
    title: "The screen",
    text: "This is the draw page exactly as the game would show it: the background page plus every visible sprite, through the file's colour block. Colour 0 shows as black.",
  },
  {
    target: ".transport",
    title: "Playback",
    text: "Play and pause, step one frame either way, or rewind. Space, the arrow keys and Home do the same. Playback runs at the file's own frame delay; the Speed box scales it.",
  },
  {
    target: "#scrub",
    title: "Scrubbing",
    text: "Drag to any frame. Every frame is recomputed from frame 0 with the same inputs, so going backwards is exact and the animation is always deterministic.",
  },
  {
    target: ".registers",
    title: "Starting register values",
    text: "The VM has 51 registers. Before playing an animation the game writes values into some of them to choose what appears, for example which character walks in or which door opens. A row appears here for each register the file reads. Set a value with frame 0 to start the animation with it, or press Now to apply it at the current frame.",
  },
  {
    target: ".debug",
    title: "Under the hood",
    text: "These tabs show the file's images, the instruction and step listings with the instruction pointer highlighted, every sprite slot, the VM stack and registers, and any warnings.",
  },
  {
    target: "#help-open",
    title: "More help",
    text: "Hover over almost any label, button, instruction or step name for an explanation. The Help button opens the full reference, and Tour replays this walkthrough.",
  },
];

const PAD = 6;

export class Tour {
  private index = 0;
  private active = false;
  private fileLoaded = false;
  private shades: HTMLDivElement[] = [];
  private ring = document.createElement("div");
  private card = document.createElement("div");
  private title = document.createElement("div");
  private text = document.createElement("div");
  private counter = document.createElement("span");
  private back = document.createElement("button");
  private next = document.createElement("button");
  private skip = document.createElement("button");
  private action = document.createElement("button");

  constructor(private hasFile: () => boolean, private runAction: () => void) {
    for (let i = 0; i < 4; i++) {
      const shade = document.createElement("div");
      shade.className = "tour-shade";
      this.shades.push(shade);
    }
    this.ring.className = "tour-ring";
    this.card.className = "tour-card";
    this.title.className = "tour-title";
    this.back.textContent = "Back";
    this.next.textContent = "Next";
    this.skip.textContent = "Skip";
    this.back.type = this.next.type = this.skip.type = this.action.type = "button";
    this.action.className = "tour-action";
    const buttons = document.createElement("div");
    buttons.className = "tour-buttons";
    buttons.append(this.counter, this.action, this.skip, this.back, this.next);
    this.action.onclick = () => this.runAction();
    for (const shade of this.shades) shade.onclick = () => this.stop();
    this.card.append(this.title, this.text, buttons);
    this.back.onclick = () => this.go(this.index - 1);
    this.next.onclick = () => this.go(this.index + 1);
    this.skip.onclick = () => this.stop();
    window.addEventListener("resize", () => this.layout());
    window.addEventListener("scroll", () => this.layout(), true);
    document.addEventListener("keydown", (e) => {
      if (!this.active || e.key !== "Escape") return;
      this.stop();
    });
  }

  start(): void {
    this.fileLoaded = this.hasFile();
    this.active = true;
    document.body.append(...this.shades, this.ring, this.card);
    this.go(0);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    for (const node of [...this.shades, this.ring, this.card]) node.remove();
    try {
      localStorage.setItem("tourDone", "1");
    } catch {
      /* storage unavailable */
    }
  }

  notifyFileLoaded(): void {
    this.fileLoaded = true;
    if (this.active && STEPS[this.index].needsFile) this.go(this.index + 1);
  }

  static shouldAutoStart(): boolean {
    try {
      return !localStorage.getItem("tourDone");
    } catch {
      return false;
    }
  }

  private go(index: number): void {
    if (index >= STEPS.length) return this.stop();
    if (index > 1 && !this.fileLoaded) index = 1;
    this.index = Math.max(0, index);
    const step = STEPS[this.index];
    this.title.textContent = step.title;
    this.action.hidden = !step.action;
    this.action.textContent = step.action ?? "";
    this.text.textContent = step.text;
    this.counter.textContent = `${this.index + 1} / ${STEPS.length}`;
    this.back.disabled = this.index === 0;
    this.next.disabled = !!step.needsFile && !this.fileLoaded;
    this.next.textContent = this.index === STEPS.length - 1 ? "Done" : "Next";
    const target = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    target?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    this.layout();
  }

  private layout(): void {
    if (!this.active) return;
    const step = STEPS[this.index];
    const target = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = this.card;
    if (!target) {
      this.ring.hidden = true;
      this.placeShades(0, 0, 0, 0);
      card.style.left = `${Math.max(8, (vw - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(8, (vh - card.offsetHeight) / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    const left = Math.max(0, r.left - PAD);
    const top = Math.max(0, r.top - PAD);
    const right = Math.min(vw, r.right + PAD);
    const bottom = Math.min(vh, r.bottom + PAD);
    this.ring.hidden = false;
    Object.assign(this.ring.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    this.placeShades(left, top, right, bottom);
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let cardLeft = Math.min(left, vw - cw - 8);
    let cardTop = bottom + 12;
    if (cardTop + ch > vh - 8) {
      cardTop = top - ch - 12;
      if (cardTop < 8) {
        cardTop = Math.max(8, Math.min(top, vh - ch - 8));
        cardLeft = right + 12 + cw <= vw ? right + 12 : Math.max(8, left - cw - 12);
      }
    }
    card.style.left = `${Math.max(8, cardLeft)}px`;
    card.style.top = `${cardTop}px`;
  }

  private placeShades(left: number, top: number, right: number, bottom: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxes = [
      [0, 0, vw, top],
      [0, bottom, vw, vh - bottom],
      [0, top, left, bottom - top],
      [right, top, vw - right, bottom - top],
    ];
    boxes.forEach(([x, y, w, h], i) => {
      Object.assign(this.shades[i].style, { left: `${x}px`, top: `${y}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
    });
  }
}
