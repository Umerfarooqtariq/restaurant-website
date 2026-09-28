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
  initParallax();
  initOrder();
}
