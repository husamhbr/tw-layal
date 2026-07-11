import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { property } from "lit/decorators.js";
import type {
  LayalOrbitalConfig,
  OrbitView,
  ProductSelection,
  SallaProduct,
  SallaStorefrontApi,
} from "./types";

const FULL_TURN = Math.PI * 2;
const DEFAULT_BACKGROUND = "#11151e";
const DEFAULT_ACCENT = "#8ed1c7";
const DEFAULT_HEIGHT = 720;
const DEFAULT_ROTATION_SECONDS = 42;
const MAX_ORBIT_PRODUCTS = 6;
const DRAG_THRESHOLD = 8;

export default class LayalOrbitalShowcase extends LitElement {
  @property({ type: Object })
  config?: LayalOrbitalConfig;

  private featuredSelection?: ProductSelection;
  private orbitSelections: ProductSelection[] = [];
  private featuredProduct?: SallaProduct;
  private orbitProducts: Array<SallaProduct | undefined> = [];
  private readonly productCache = new Map<string, Promise<SallaProduct | undefined>>();
  private readonly failedImages = new Set<string>();
  private loadVersion = 0;

  private stageElement?: HTMLElement;
  private intersectionObserver?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private reducedMotionQuery?: MediaQueryList;
  private finePointerQuery?: MediaQueryList;
  private isConnectedToPage = false;
  private isVisible = true;
  private reducedMotion = false;
  private hasFinePointer = false;

  private animationFrame?: number;
  private lastFrameTime = 0;
  private orbitAngle = -Math.PI / 2;
  private orbitRadiusX = 420;
  private orbitRadiusY = 170;
  private tiltX = 0;
  private tiltY = 0;
  private targetTiltX = 0;
  private targetTiltY = 0;
  private pointerBounds?: DOMRect;

  private activePointerId?: number;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartAngle = 0;
  private didDrag = false;
  private isDragging = false;
  private hoverPaused = false;
  private focusPaused = false;
  private resumeAfter = 0;
  private suppressClickUntil = 0;
  private focusReleaseTimer?: number;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      color: #f5f5f2;
      contain: layout paint style;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .orbital-section {
      --layal-background: #11151e;
      --layal-accent: #8ed1c7;
      --layal-section-height: ${DEFAULT_HEIGHT}px;
      position: relative;
      isolation: isolate;
      width: 100%;
      height: var(--layal-section-height);
      min-height: 580px;
      overflow: hidden;
      background-color: var(--layal-background);
      background:
        radial-gradient(circle at 50% 44%, color-mix(in srgb, var(--layal-accent) 13%, transparent) 0, transparent 32%),
        radial-gradient(circle at 16% 18%, rgba(124, 151, 182, 0.11), transparent 31%),
        radial-gradient(circle at 82% 76%, rgba(114, 91, 145, 0.11), transparent 29%),
        var(--layal-background);
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
    }

    .background-image,
    .background-veil,
    .light-bloom {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .background-image {
      z-index: -3;
      background-position: center;
      background-size: cover;
      opacity: 0.34;
      filter: saturate(0.72) contrast(1.08);
    }

    .background-veil {
      z-index: -2;
      background: linear-gradient(180deg, rgba(7, 10, 16, 0.28), rgba(7, 10, 16, 0.1) 45%, rgba(7, 10, 16, 0.44));
    }

    .light-bloom {
      z-index: -1;
      left: 50%;
      top: 48%;
      width: min(62vw, 780px);
      height: min(62vw, 780px);
      inset-inline-start: 50%;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--layal-accent) 11%, transparent), transparent 66%);
      transform: translate(-50%, -50%);
      filter: blur(24px);
      opacity: 0.72;
    }

    .perspective-shell {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      perspective: 1350px;
      perspective-origin: 50% 46%;
    }

    .stage {
      --orbit-x: 420px;
      --orbit-y: 170px;
      position: relative;
      width: min(100%, 1440px);
      height: 100%;
      transform-style: preserve-3d;
      will-change: transform;
    }

    .orbit-ring {
      position: absolute;
      z-index: 1;
      left: 50%;
      top: 50%;
      width: calc(var(--orbit-x) * 2);
      height: calc(var(--orbit-y) * 2);
      border: 1px solid color-mix(in srgb, var(--layal-accent) 34%, transparent);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow:
        0 0 24px color-mix(in srgb, var(--layal-accent) 7%, transparent),
        inset 0 0 18px color-mix(in srgb, var(--layal-accent) 4%, transparent);
      opacity: 0.72;
      pointer-events: none;
    }

    .orbit-ring::before,
    .orbit-ring::after {
      content: "";
      position: absolute;
      border-radius: inherit;
      pointer-events: none;
    }

    .orbit-ring::before {
      inset: 9%;
      border: 1px dashed color-mix(in srgb, var(--layal-accent) 16%, transparent);
    }

    .orbit-ring::after {
      inset: -1px;
      border-top: 1px solid color-mix(in srgb, var(--layal-accent) 76%, transparent);
      transform: rotate(-18deg);
      opacity: 0.58;
    }

    .central-wrap {
      position: absolute;
      z-index: 45;
      left: 50%;
      top: 50%;
      width: clamp(230px, 29vw, 390px);
      height: min(78%, 590px);
      transform: translate(-50%, -50%) translateZ(42px);
      display: grid;
      place-items: center;
      pointer-events: none;
      transform-style: preserve-3d;
    }

    .central-product {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      min-width: 44px;
      min-height: 44px;
      color: inherit;
      text-decoration: none;
      pointer-events: auto;
      outline: none;
    }

    .central-product::before {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 6%;
      width: 58%;
      height: 8%;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.5);
      filter: blur(15px);
      transform: translateX(-50%);
      opacity: 0.56;
    }

    .central-product:focus-visible {
      border-radius: 12px;
      outline: 2px solid var(--layal-accent);
      outline-offset: 7px;
    }

    .central-image {
      position: relative;
      z-index: 2;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 28px 28px rgba(0, 0, 0, 0.36));
      animation: central-float 7s ease-in-out infinite;
      -webkit-user-drag: none;
    }

    .central-placeholder {
      position: relative;
      z-index: 2;
      display: grid;
      place-items: center;
      width: min(72%, 270px);
      aspect-ratio: 0.68;
      padding: 30px;
      color: rgba(245, 245, 242, 0.72);
      text-align: center;
      font-size: 0.82rem;
      line-height: 1.7;
      letter-spacing: 0.02em;
      border: 1px solid color-mix(in srgb, var(--layal-accent) 28%, transparent);
      border-radius: 48% 48% 24% 24% / 18% 18% 10% 10%;
      background:
        linear-gradient(145deg, color-mix(in srgb, var(--layal-accent) 9%, transparent), rgba(255, 255, 255, 0.015)),
        rgba(14, 19, 28, 0.64);
      box-shadow: 0 24px 50px rgba(0, 0, 0, 0.25);
    }

    .orbit-item {
      position: absolute;
      left: 50%;
      top: 50%;
      display: grid;
      place-items: center;
      width: clamp(78px, 9vw, 122px);
      min-width: 44px;
      min-height: 44px;
      aspect-ratio: 0.78;
      color: #f8faf8;
      text-decoration: none;
      outline: none;
      transform-origin: center;
      transform-style: preserve-3d;
      will-change: transform, opacity, filter;
      cursor: grab;
    }

    .orbit-item:active {
      cursor: grabbing;
    }

    .orbit-item:focus-visible::after {
      content: "";
      position: absolute;
      inset: -6px;
      border: 2px solid var(--layal-accent);
      border-radius: 44% 44% 28% 28%;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--layal-accent) 16%, transparent);
    }

    .orbit-image,
    .orbit-placeholder {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      -webkit-user-drag: none;
    }

    .orbit-image {
      filter: drop-shadow(0 14px 14px rgba(0, 0, 0, 0.34));
      transition: filter 180ms ease;
    }

    .orbit-placeholder {
      border: 1px solid color-mix(in srgb, var(--layal-accent) 25%, transparent);
      border-radius: 46% 46% 26% 26% / 22% 22% 12% 12%;
      background:
        linear-gradient(145deg, color-mix(in srgb, var(--layal-accent) 10%, transparent), rgba(255, 255, 255, 0.018)),
        rgba(15, 20, 29, 0.72);
      box-shadow: 0 14px 26px rgba(0, 0, 0, 0.2);
    }

    .orbit-item:hover .orbit-image,
    .orbit-item:focus-visible .orbit-image {
      filter:
        drop-shadow(0 16px 18px rgba(0, 0, 0, 0.38))
        drop-shadow(0 0 12px color-mix(in srgb, var(--layal-accent) 18%, transparent));
    }

    .product-name {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      width: max-content;
      max-width: 170px;
      padding: 3px 7px;
      color: rgba(250, 251, 249, 0.86);
      font-size: 0.72rem;
      line-height: 1.35;
      text-align: center;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
      transform: translateX(-50%);
      opacity: 0.82;
      pointer-events: none;
    }

    .interaction-hint {
      position: absolute;
      z-index: 90;
      inset-inline-start: 50%;
      bottom: 24px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      color: rgba(247, 248, 245, 0.7);
      font-size: 0.72rem;
      letter-spacing: 0.025em;
      transform: translateX(-50%);
      pointer-events: none;
    }

    .interaction-hint::before {
      content: "↔";
      color: var(--layal-accent);
      font-size: 1rem;
    }

    .setup-note {
      position: absolute;
      z-index: 92;
      inset-inline-start: 50%;
      top: 24px;
      max-width: min(84vw, 390px);
      padding: 7px 11px;
      color: rgba(247, 248, 245, 0.72);
      font-size: 0.72rem;
      line-height: 1.55;
      text-align: center;
      transform: translateX(-50%);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 999px;
      background: rgba(8, 12, 19, 0.38);
      backdrop-filter: blur(8px);
      pointer-events: none;
    }

    @keyframes central-float {
      0%,
      100% {
        transform: translate3d(0, 0, 0);
      }
      50% {
        transform: translate3d(0, -9px, 0);
      }
    }

    @media (max-width: 700px) {
      .orbital-section {
        height: clamp(510px, 148vw, 620px);
        min-height: 510px;
      }

      .perspective-shell {
        perspective: 900px;
      }

      .central-wrap {
        top: 49%;
        width: clamp(168px, 51vw, 216px);
        height: 57%;
      }

      .orbit-item {
        width: clamp(72px, 23vw, 92px);
      }

      .orbit-ring {
        opacity: 0.58;
      }

      .product-name {
        max-width: 118px;
        font-size: 0.66rem;
      }

      .interaction-hint {
        bottom: 16px;
      }

      .setup-note {
        top: 16px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .central-image {
        animation: none;
      }

      .orbit-image,
      .stage {
        transition: none;
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.isConnectedToPage = true;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.setupMediaQueries();
    this.setupIntersectionObserver();
  }

  disconnectedCallback(): void {
    this.isConnectedToPage = false;
    this.stopAnimationLoop();
    this.intersectionObserver?.disconnect();
    this.resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.reducedMotionQuery?.removeEventListener("change", this.handleMotionPreferenceChange);
    this.finePointerQuery?.removeEventListener("change", this.handlePointerPreferenceChange);
    if (this.focusReleaseTimer !== undefined) {
      window.clearTimeout(this.focusReleaseTimer);
    }
    this.resetPointerState();
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.stageElement = this.renderRoot.querySelector<HTMLElement>(".stage") ?? undefined;
    this.setupResizeObserver();
    this.measureStage();
    this.applySceneFrame();
    this.syncAnimationLoop();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("config")) {
      this.failedImages.clear();
      void this.loadConfiguredProducts();
    }
    this.stageElement = this.renderRoot.querySelector<HTMLElement>(".stage") ?? this.stageElement;
    this.applySceneFrame();
    this.syncAnimationLoop();
  }

  private setupMediaQueries(): void {
    if (typeof window.matchMedia !== "function") return;

    this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    this.reducedMotion = this.reducedMotionQuery.matches;
    this.hasFinePointer = this.finePointerQuery.matches;
    this.reducedMotionQuery.addEventListener("change", this.handleMotionPreferenceChange);
    this.finePointerQuery.addEventListener("change", this.handlePointerPreferenceChange);
  }

  private setupIntersectionObserver(): void {
    if (!("IntersectionObserver" in window)) return;

    this.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry?.isIntersecting ?? false;
        this.syncAnimationLoop();
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    this.intersectionObserver.observe(this);
  }

  private setupResizeObserver(): void {
    if (!this.stageElement || !("ResizeObserver" in window)) return;

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.updateOrbitDimensions(entry.contentRect.width, entry.contentRect.height);
    });
    this.resizeObserver.observe(this.stageElement);
  }

  private measureStage(): void {
    if (!this.stageElement) return;
    const bounds = this.stageElement.getBoundingClientRect();
    this.updateOrbitDimensions(bounds.width, bounds.height);
  }

  private updateOrbitDimensions(width: number, height: number): void {
    const mobile = width <= 700;
    this.orbitRadiusX = mobile ? Math.min(width * 0.39, 158) : Math.min(width * 0.39, 520);
    this.orbitRadiusY = mobile ? Math.min(height * 0.225, 126) : Math.min(height * 0.245, 190);
    this.stageElement?.style.setProperty("--orbit-x", `${this.orbitRadiusX}px`);
    this.stageElement?.style.setProperty("--orbit-y", `${this.orbitRadiusY}px`);
    this.applySceneFrame();
  }

  private readonly handleVisibilityChange = (): void => {
    this.syncAnimationLoop();
  };

  private readonly handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
    if (this.reducedMotion) {
      this.targetTiltX = 0;
      this.targetTiltY = 0;
      this.tiltX = 0;
      this.tiltY = 0;
      this.applySceneFrame();
    }
    this.syncAnimationLoop();
  };

  private readonly handlePointerPreferenceChange = (event: MediaQueryListEvent): void => {
    this.hasFinePointer = event.matches;
    if (!this.hasFinePointer) this.resetTilt();
  };

  private syncAnimationLoop(): void {
    const shouldRun = this.isConnectedToPage && this.isVisible && !document.hidden && !this.reducedMotion;
    if (shouldRun) {
      this.startAnimationLoop();
    } else {
      this.stopAnimationLoop();
    }
  }

  private startAnimationLoop(): void {
    if (this.animationFrame !== undefined) return;
    this.lastFrameTime = 0;
    this.animationFrame = window.requestAnimationFrame(this.animationTick);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrame !== undefined) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    this.lastFrameTime = 0;
  }

  private readonly animationTick = (timestamp: number): void => {
    this.animationFrame = undefined;
    if (!this.isConnectedToPage || !this.isVisible || document.hidden || this.reducedMotion) return;

    const deltaSeconds = this.lastFrameTime === 0 ? 0 : Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = timestamp;

    if (this.shouldRotateAutomatically(timestamp)) {
      const direction = this.booleanSetting("reverse_direction", false) ? -1 : 1;
      const secondsPerTurn = this.numberSetting("rotation_speed", DEFAULT_ROTATION_SECONDS, 20, 90);
      this.orbitAngle = this.normalizeAngle(
        this.orbitAngle + direction * (FULL_TURN / secondsPerTurn) * deltaSeconds,
      );
    }

    const smoothing = 1 - Math.exp(-deltaSeconds * 7);
    this.tiltX += (this.targetTiltX - this.tiltX) * smoothing;
    this.tiltY += (this.targetTiltY - this.tiltY) * smoothing;
    this.applySceneFrame();
    this.animationFrame = window.requestAnimationFrame(this.animationTick);
  };

  private shouldRotateAutomatically(timestamp: number): boolean {
    return (
      !this.isDragging &&
      !this.hoverPaused &&
      !this.focusPaused &&
      timestamp >= this.resumeAfter
    );
  }

  private applySceneFrame(): void {
    const items = this.renderRoot.querySelectorAll<HTMLElement>("[data-orbit-item]");
    const count = items.length;

    items.forEach((item, index) => {
      const itemAngle = this.orbitAngle + (FULL_TURN * index) / Math.max(count, 1);
      const cosine = Math.cos(itemAngle);
      const sine = Math.sin(itemAngle);
      const normalizedDepth = (sine + 1) / 2;
      const x = cosine * this.orbitRadiusX;
      const y = sine * this.orbitRadiusY;
      const z = -80 + normalizedDepth * 190;
      const scale = 0.68 + normalizedDepth * 0.44;
      const opacity = 0.48 + normalizedDepth * 0.52;
      const blur = (1 - normalizedDepth) * 0.72;
      const zIndex = Math.round(12 + normalizedDepth * 64);

      item.style.transform = `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%) scale(${scale})`;
      item.style.opacity = opacity.toFixed(3);
      item.style.filter = `blur(${blur.toFixed(2)}px)`;
      item.style.zIndex = String(zIndex);
    });

    if (this.stageElement) {
      this.stageElement.style.transform = `rotateX(${this.tiltX.toFixed(3)}deg) rotateY(${this.tiltY.toFixed(3)}deg)`;
    }
  }

  private normalizeAngle(angle: number): number {
    return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
  }

  private async loadConfiguredProducts(): Promise<void> {
    const version = ++this.loadVersion;
    this.featuredSelection = this.selectionList("featured_product", 1)[0];
    this.orbitSelections = this.selectionList("orbit_products", MAX_ORBIT_PRODUCTS);
    this.featuredProduct = undefined;
    this.orbitProducts = [];
    this.requestUpdate();

    const salla = this.getSallaApi();
    if (!salla) return;

    try {
      await Promise.resolve(salla.onReady());
    } catch {
      return;
    }

    const featuredRequest = this.featuredSelection
      ? this.getProduct(this.featuredSelection.value, salla)
      : Promise.resolve(undefined);
    const orbitRequests = this.orbitSelections.map((selection) => this.getProduct(selection.value, salla));
    const [featured, ...orbit] = await Promise.all([featuredRequest, ...orbitRequests]);

    if (version !== this.loadVersion || !this.isConnectedToPage) return;
    this.featuredProduct = featured;
    this.orbitProducts = orbit;
    this.requestUpdate();
  }

  private getProduct(id: string | number, salla: SallaStorefrontApi): Promise<SallaProduct | undefined> {
    const cacheKey = String(id);
    const cached = this.productCache.get(cacheKey);
    if (cached) return cached;

    const request = salla.product.api
      .getDetails(id)
      .then((response) => response?.data)
      .catch(() => undefined);
    this.productCache.set(cacheKey, request);
    return request;
  }

  private getSallaApi(): SallaStorefrontApi | undefined {
    return (globalThis as unknown as { Salla?: SallaStorefrontApi }).Salla;
  }

  private selectionList(field: "featured_product" | "orbit_products", maximum: number): ProductSelection[] {
    const value = this.config?.[field];
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is ProductSelection => item !== null && typeof item === "object" && "value" in item)
      .slice(0, maximum);
  }

  private orbitViews(): OrbitView[] {
    if (this.orbitSelections.length === 0) {
      return Array.from({ length: 5 }, (_, index) => ({
        key: `setup-${index}`,
        name: "",
        alt: "",
        placeholder: true,
      }));
    }

    return this.orbitSelections.map((selection, index) => {
      const product = this.orbitProducts[index];
      const key = String(selection.key ?? selection.value ?? index);
      const imageKey = `orbit-${key}`;
      const imageUrl = this.failedImages.has(imageKey) ? undefined : product?.image?.url;
      const name = product?.name || selection.label || this.fallbackProductLabel();
      return {
        key,
        name,
        url: product?.url,
        imageUrl,
        alt: product?.image?.alt || name,
        placeholder: !imageUrl,
      };
    });
  }

  private featuredView(): OrbitView {
    const override = this.stringSetting("featured_image");
    const overrideAvailable = Boolean(override && !this.failedImages.has("featured-override"));
    const productImageAvailable = Boolean(
      this.featuredProduct?.image?.url && !this.failedImages.has("featured-product"),
    );
    const name = this.featuredProduct?.name || this.featuredSelection?.label || this.fallbackProductLabel();
    const configuredAlt = this.stringSetting("featured_alt");

    return {
      key: "featured",
      name,
      url: this.featuredProduct?.url,
      imageUrl: overrideAvailable
        ? override
        : productImageAvailable
          ? this.featuredProduct?.image?.url
          : undefined,
      alt: configuredAlt || this.featuredProduct?.image?.alt || name,
      placeholder: !overrideAvailable && !productImageAvailable,
    };
  }

  private fallbackProductLabel(): string {
    return this.isRtl() ? "قطعة مختارة" : "Selected piece";
  }

  private isRtl(): boolean {
    const fallback = document.documentElement.dir.toLowerCase() === "rtl";
    const configured = this.getSallaApi()?.config?.get("theme.is_rtl", fallback);
    return typeof configured === "boolean" ? configured : fallback;
  }

  private stringSetting(field: keyof LayalOrbitalConfig): string {
    const value = this.config?.[field];
    return typeof value === "string" ? value.trim() : "";
  }

  private numberSetting(
    field: "section_height" | "rotation_speed",
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const parsed = Number(this.config?.[field]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  private booleanSetting(
    field:
      | "reverse_direction"
      | "enable_pointer_tilt"
      | "enable_drag"
      | "show_product_names"
      | "show_interaction_hint",
    fallback: boolean,
  ): boolean {
    const value = this.config?.[field];
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "string") return !["false", "0", "off", "no"].includes(value.toLowerCase());
    return Boolean(value);
  }

  private onSectionPointerEnter(event: PointerEvent): void {
    if (event.pointerType === "touch") return;
    this.pointerBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  }

  private onSectionPointerMove(event: PointerEvent): void {
    if (
      event.pointerType === "touch" ||
      this.isDragging ||
      this.reducedMotion ||
      !this.hasFinePointer ||
      !this.booleanSetting("enable_pointer_tilt", true)
    ) {
      return;
    }

    const bounds = this.pointerBounds;
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;
    const normalizedX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const normalizedY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    this.targetTiltY = Math.max(-1, Math.min(1, normalizedX)) * 3;
    this.targetTiltX = Math.max(-1, Math.min(1, -normalizedY)) * 2.3;
  }

  private onSectionPointerLeave(): void {
    this.pointerBounds = undefined;
    this.resetTilt();
  }

  private resetTilt(): void {
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    if (this.reducedMotion) {
      this.tiltX = 0;
      this.tiltY = 0;
      this.applySceneFrame();
    }
  }

  private onDragStart(event: PointerEvent): void {
    if (!this.booleanSetting("enable_drag", true) || event.button !== 0 || !event.isPrimary) return;
    this.activePointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartAngle = this.orbitAngle;
    this.didDrag = false;
    this.isDragging = true;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
  }

  private onDragMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId || !this.isDragging) return;
    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    if (!this.didDrag && Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) >= DRAG_THRESHOLD) {
      this.didDrag = true;
      const target = event.currentTarget as HTMLElement;
      if (!target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);
    }
    if (!this.didDrag) return;

    event.preventDefault();
    this.orbitAngle = this.normalizeAngle(this.dragStartAngle + deltaX * 0.0065);
    this.applySceneFrame();
  }

  private onDragEnd(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (this.didDrag) this.suppressClickUntil = performance.now() + 420;
    this.resumeAfter = performance.now() + 950;
    this.resetPointerState();
  }

  private resetPointerState(): void {
    this.activePointerId = undefined;
    this.isDragging = false;
    this.didDrag = false;
  }

  private onProductClick(event: MouseEvent): void {
    if (performance.now() < this.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private onInteractiveEnter(event: PointerEvent): void {
    if (event.pointerType !== "touch") this.hoverPaused = true;
  }

  private onInteractiveLeave(event: PointerEvent): void {
    if (event.pointerType !== "touch") {
      this.hoverPaused = false;
      this.resumeAfter = performance.now() + 450;
    }
  }

  private onInteractiveFocus(): void {
    this.focusPaused = true;
    if (this.focusReleaseTimer !== undefined) window.clearTimeout(this.focusReleaseTimer);
  }

  private onInteractiveBlur(): void {
    if (this.focusReleaseTimer !== undefined) window.clearTimeout(this.focusReleaseTimer);
    this.focusReleaseTimer = window.setTimeout(() => {
      const active = this.shadowRoot?.activeElement;
      this.focusPaused = active instanceof HTMLElement && active.matches(".central-product, .orbit-item");
      this.resumeAfter = performance.now() + 450;
    }, 0);
  }

  private onImageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    const imageKey = image.dataset.imageKey;
    if (!imageKey) return;
    this.failedImages.add(imageKey);
    this.requestUpdate();
  }

  private renderCentralProduct(view: OrbitView) {
    const imageKey = this.stringSetting("featured_image") && !this.failedImages.has("featured-override")
      ? "featured-override"
      : "featured-product";
    const contents = html`
      ${view.imageUrl
        ? html`<img
            class="central-image"
            src=${view.imageUrl}
            alt=${view.alt}
            data-image-key=${imageKey}
            loading="eager"
            decoding="async"
            draggable="false"
            @error=${this.onImageError}
          />`
        : html`<div class="central-placeholder" aria-hidden="true">${view.name}</div>`}
    `;

    return view.url
      ? html`<a
          class="central-product"
          href=${view.url}
          aria-label=${view.name}
          @click=${this.onProductClick}
          @pointerenter=${this.onInteractiveEnter}
          @pointerleave=${this.onInteractiveLeave}
          @focus=${this.onInteractiveFocus}
          @blur=${this.onInteractiveBlur}
        >${contents}</a>`
      : html`<div class="central-product" aria-label=${view.name}>${contents}</div>`;
  }

  private renderOrbitItem(view: OrbitView, index: number) {
    const showName = this.booleanSetting("show_product_names", true) && Boolean(view.name);
    const contents = html`
      ${view.imageUrl
        ? html`<img
            class="orbit-image"
            src=${view.imageUrl}
            alt=${view.alt}
            data-image-key=${`orbit-${view.key}`}
            loading="lazy"
            decoding="async"
            draggable="false"
            @error=${this.onImageError}
          />`
        : html`<span class="orbit-placeholder" aria-hidden="true"></span>`}
      ${showName ? html`<span class="product-name">${view.name}</span>` : nothing}
    `;

    return view.url
      ? html`<a
          class="orbit-item"
          data-orbit-item
          data-orbit-index=${index}
          href=${view.url}
          aria-label=${view.name}
          @click=${this.onProductClick}
          @pointerenter=${this.onInteractiveEnter}
          @pointerleave=${this.onInteractiveLeave}
          @focus=${this.onInteractiveFocus}
          @blur=${this.onInteractiveBlur}
        >${contents}</a>`
      : html`<div
          class="orbit-item"
          data-orbit-item
          data-orbit-index=${index}
          aria-hidden=${view.name ? "false" : "true"}
          aria-label=${view.name || nothing}
        >${contents}</div>`;
  }

  private renderSetupNote(rtl: boolean) {
    if (this.featuredSelection || this.orbitSelections.length > 0) return nothing;
    return html`<div class="setup-note" role="status">
      ${rtl
        ? "اختر القطعة الرئيسية ومنتجات المدار من إعدادات القسم"
        : "Select a featured piece and orbit products in the section settings"}
    </div>`;
  }

  render() {
    const rtl = this.isRtl();
    const featured = this.featuredView();
    const orbit = this.orbitViews();
    const backgroundImage = this.stringSetting("background_image");
    const backgroundColor = this.stringSetting("background_color") || DEFAULT_BACKGROUND;
    const accentColor = this.stringSetting("accent_color") || DEFAULT_ACCENT;
    const sectionHeight = this.numberSetting("section_height", DEFAULT_HEIGHT, 560, 900);
    const sectionStyle = `--layal-background: ${backgroundColor}; --layal-accent: ${accentColor}; --layal-section-height: ${sectionHeight}px;`;

    return html`
      <section
        class="orbital-section"
        dir=${rtl ? "rtl" : "ltr"}
        style=${sectionStyle}
        aria-label=${rtl ? "ليال — العرض المداري" : "Layal — Orbital Showcase"}
        @pointerenter=${this.onSectionPointerEnter}
        @pointermove=${this.onSectionPointerMove}
        @pointerleave=${this.onSectionPointerLeave}
      >
        ${backgroundImage
          ? html`<div
              class="background-image"
              style=${`background-image: url("${backgroundImage.replace(/"/g, "%22")}");`}
              aria-hidden="true"
            ></div>`
          : nothing}
        <div class="background-veil" aria-hidden="true"></div>
        <div class="light-bloom" aria-hidden="true"></div>

        ${this.renderSetupNote(rtl)}

        <div class="perspective-shell">
          <div
            class="stage"
            @pointerdown=${this.onDragStart}
            @pointermove=${this.onDragMove}
            @pointerup=${this.onDragEnd}
            @pointercancel=${this.onDragEnd}
          >
            <div class="orbit-ring" aria-hidden="true"></div>
            <div class="central-wrap">${this.renderCentralProduct(featured)}</div>
            ${orbit.map((item, index) => this.renderOrbitItem(item, index))}
          </div>
        </div>

        ${this.booleanSetting("show_interaction_hint", true)
          ? html`<div class="interaction-hint" aria-hidden="true">
              ${rtl ? "اسحب لاكتشاف القطع" : "Drag to explore"}
            </div>`
          : nothing}
      </section>
    `;
  }
}
