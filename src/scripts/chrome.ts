import { itemOrderMessage } from "../../shared/display";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initNav() {
  const header = document.querySelector<HTMLElement>("[data-header]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const panel = document.querySelector<HTMLElement>("[data-nav-panel]");
  if (!header || !toggle || !panel) return;

  const close = () => {
    panel.classList.remove("is-open");
    header.classList.remove("is-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-lock");
  };

  toggle.addEventListener("click", () => {
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    header.classList.toggle("is-nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-lock", open);
    if (open) panel.querySelector<HTMLElement>("a, button")?.focus();
  });

  panel.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a, [data-order]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function initReveal() {
  if (reducedMotion()) return;
  const nodes = document.querySelectorAll<HTMLElement>(".reveal");
  if (!nodes.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 },
  );
  nodes.forEach((node) => observer.observe(node));
}

function initBanner() {
  const root = document.querySelector<HTMLElement>("[data-banner]");
  if (!root) return;
  const slides = [...root.querySelectorAll<HTMLElement>("[data-banner-slide]")];
  const dots = [...root.querySelectorAll<HTMLButtonElement>("[data-banner-dot]")];
  if (slides.length < 2) return;
  let index = 0;
  let timer = 0;

  const show = (next: number) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle("is-active", active);
      if (active) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  };

  const start = () => {
    window.clearInterval(timer);
    if (reducedMotion()) return;
    timer = window.setInterval(() => show(index + 1), 4000);
  };

  root.querySelector("[data-banner-prev]")?.addEventListener("click", () => {
    show(index - 1);
    start();
  });
  root.querySelector("[data-banner-next]")?.addEventListener("click", () => {
    show(index + 1);
    start();
  });
  dots.forEach((dot, dotIndex) => {
    dot.addEventListener("click", () => {
      show(dotIndex);
      start();
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearInterval(timer);
    else start();
  });
  start();
}

function initParallax() {
  const media = document.querySelector<HTMLElement>("[data-parallax]");
  if (!media || reducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;
  const onScroll = () => {
    const y = Math.min(window.scrollY, 500);
    media.style.transform = `translate3d(0, ${y * 0.08}px, 0) scale(1.05)`;
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function initOrder() {
  const dialog = document.querySelector<HTMLDialogElement>("#order-dialog");
  if (!dialog) return;
  const call = dialog.querySelector<HTMLAnchorElement>("[data-order-call]");
  const whatsapp = dialog.querySelector<HTMLAnchorElement>("[data-order-wa]");
  const summary = dialog.querySelector<HTMLElement>("[data-order-summary]");
  const missing = dialog.querySelector<HTMLElement>("[data-order-missing]");
  const phoneHref = dialog.dataset.phoneHref || "";
  const digits = dialog.dataset.waDigits || "";
  const general = dialog.dataset.general || "Hello Khan Baba, I would like to place an order.";
  const template = dialog.dataset.template || "Hello Khan Baba, I would like to order {item}.";

  const open = (item: string | null) => {
    const message = item ? itemOrderMessage(template, item) : general;
    if (summary) summary.textContent = item ? item : "Place an order";
    if (call) {
      if (phoneHref) {
        call.href = phoneHref;
        call.hidden = false;
      } else {
        call.hidden = true;
      }
    }
    if (whatsapp) {
      if (digits) {
        whatsapp.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
        whatsapp.hidden = false;
      } else {
        whatsapp.hidden = true;
      }
    }
    if (missing) missing.hidden = Boolean(phoneHref || digits);
    document.querySelectorAll("dialog").forEach((node) => {
      if (node !== dialog && node.open) node.close();
    });
    if (!dialog.open) dialog.showModal();
  };

  document.addEventListener("click", (event) => {
    const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-order]");
    if (!trigger) return;
    event.preventDefault();
    open(trigger.getAttribute("data-item"));
  });

  dialog.querySelectorAll("[data-order-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export function initChrome() {
  initNav();
  initReveal();
  initBanner();
  initParallax();
  initOrder();
}
