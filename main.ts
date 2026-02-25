import {
  StarkSDK,
  OnboardStrategy,
  Amount,
  sepoliaTokens,
} from "starkzap";
import type { WalletInterface } from "starkzap";
import {
  fetchAllRaffles,
  fetchRaffle,
  populateCreateRaffle,
  populateBuyTicket,
  populateDrawWinner,
  populateClaimPrize,
  getStatus,
  timeRemaining,
  isRaffleFull,
  RAFFLE_CONTRACT,
  type Raffle,
} from "./raffle";
import { RpcProvider } from "starknet";

// ── Starkzap SDK ──
const STRK = sepoliaTokens.STRK;
const sdk = new StarkSDK({ network: "sepolia" });
const provider = sdk.getProvider();
let wallet: WalletInterface | null = null;

// ── DOM Elements ──
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const connectBtnHero = document.getElementById("connect-btn-hero") as HTMLButtonElement;
const disconnectBtn = document.getElementById("disconnect-btn") as HTMLButtonElement;
const balanceDisplay = document.getElementById("balance-display") as HTMLElement;
const balanceAmount = document.getElementById("balance-amount") as HTMLElement;
const addressDisplay = document.getElementById("address-display") as HTMLElement;
const connectPrompt = document.getElementById("connect-prompt") as HTMLElement;
const browseView = document.getElementById("browse-view") as HTMLElement;
const detailView = document.getElementById("detail-view") as HTMLElement;
const raffleGrid = document.getElementById("raffle-grid") as HTMLElement;
const emptyState = document.getElementById("empty-state") as HTMLElement;
const createModal = document.getElementById("create-modal") as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;

// Detail elements
const detailTitle = document.getElementById("detail-title") as HTMLElement;
const detailPrice = document.getElementById("detail-price") as HTMLElement;
const detailTickets = document.getElementById("detail-tickets") as HTMLElement;
const detailTime = document.getElementById("detail-time") as HTMLElement;
const detailCreator = document.getElementById("detail-creator") as HTMLElement;
const detailActions = document.getElementById("detail-actions") as HTMLElement;
const ticketList = document.getElementById("ticket-list") as HTMLElement;
const winnerBanner = document.getElementById("winner-banner") as HTMLElement;
const winnerAddress = document.getElementById("winner-address") as HTMLElement;

// Form elements
const formTitle = document.getElementById("form-title") as HTMLInputElement;
const formPrice = document.getElementById("form-price") as HTMLInputElement;
const formMax = document.getElementById("form-max") as HTMLInputElement;
const formEnd = document.getElementById("form-end") as HTMLInputElement;

let currentRaffleId: number | null = null;
let cachedRaffles: Raffle[] = [];

// ── Utilities ──
function truncate(addr: string, len = 6): string {
  if (addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len + 2)}...${addr.slice(-len)}`;
}

function showToast(message: string, type: "success" | "error" | "info" = "info", duration = 4000): void {
  toast.className = `toast show toast-${type}`;
  toast.innerHTML = message;
  setTimeout(() => {
    toast.className = "toast";
  }, duration);
}

// ── View Management ──
function showView(view: "connect" | "browse" | "detail"): void {
  connectPrompt.style.display = view === "connect" ? "block" : "none";
  browseView.style.display = view === "browse" ? "block" : "none";
  detailView.style.display = view === "detail" ? "block" : "none";
}

// ── Wallet Connection (Starkzap SDK) ──
async function connect(): Promise<void> {
  connectBtn.disabled = true;
  connectBtnHero.disabled = true;
  connectBtn.innerHTML = '<span class="spinner"></span>Connecting...';
  connectBtnHero.innerHTML = '<span class="spinner"></span>Connecting...';

  try {
    const result = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
    });
    wallet = result.wallet;

    // Update UI
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    addressDisplay.style.display = "inline-block";
    addressDisplay.textContent = truncate(wallet.address);
    balanceDisplay.style.display = "inline-block";

    showView("browse");
    await loadAndRenderRaffles();
    refreshBalance();
  } catch (err) {
    console.error("Connect failed:", err);
    showToast("Failed to connect wallet", "error");
  } finally {
    connectBtn.disabled = false;
    connectBtnHero.disabled = false;
    connectBtn.innerHTML = "Connect Wallet";
    connectBtnHero.innerHTML = "Connect with Cartridge";
  }
}

async function disconnect(): Promise<void> {
  if (wallet) {
    try {
      await wallet.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
  wallet = null;
  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addressDisplay.style.display = "none";
  balanceDisplay.style.display = "none";
  showView("connect");
}

// ── Balance (Starkzap SDK) ──
async function refreshBalance(): Promise<void> {
  if (!wallet) return;
  try {
    const balance = await wallet.balanceOf(STRK);
    balanceAmount.textContent = `${balance.toFormatted(true)}`;
  } catch (err) {
    console.error("Balance fetch failed:", err);
    balanceAmount.textContent = "Error";
  }
}

// ── Load Raffles from Chain ──
async function loadAndRenderRaffles(): Promise<void> {
  raffleGrid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading raffles from chain...</div>';
  emptyState.style.display = "none";
  try {
    cachedRaffles = await fetchAllRaffles(provider);
    renderRaffles();
  } catch (err) {
    console.error("Failed to load raffles:", err);
    raffleGrid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Failed to load raffles</div>';
  }
}

// ── Render Raffles ──
function renderRaffles(): void {
  if (cachedRaffles.length === 0) {
    raffleGrid.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  raffleGrid.style.display = "grid";
  raffleGrid.innerHTML = "";

  // Sort: active first, then ended, then drawn
  const sorted = [...cachedRaffles].sort((a, b) => {
    const order = { active: 0, ended: 1, drawn: 2 };
    const diff = order[getStatus(a)] - order[getStatus(b)];
    if (diff !== 0) return diff;
    return b.id - a.id;
  });

  for (const raffle of sorted) {
    const status = getStatus(raffle);
    const card = document.createElement("div");
    card.className = "raffle-card";
    const pct = raffle.maxTickets > 0 ? Math.round((raffle.ticketCount / raffle.maxTickets) * 100) : 0;
    card.innerHTML = `
      <div class="raffle-card-title">${escapeHtml(raffle.title)}</div>
      <div class="raffle-card-row">
        <span>Price</span>
        <span>${raffle.ticketPrice} STRK</span>
      </div>
      <div class="raffle-card-row">
        <span>Tickets</span>
        <span>${raffle.ticketCount} / ${raffle.maxTickets}</span>
      </div>
      <div class="ticket-progress">
        <div class="ticket-progress-bar">
          <div class="ticket-progress-fill" style="width: ${pct}%"></div>
        </div>
      </div>
      <div class="raffle-card-row">
        <span>Time</span>
        <span>${timeRemaining(raffle.endTime)}</span>
      </div>
      <span class="status-badge status-${status}">${status === "drawn" ? "Winner Drawn" : status === "ended" ? "Ended" : "Active"}</span>
    `;
    card.addEventListener("click", () => openDetail(raffle.id));
    raffleGrid.appendChild(card);
  }
}

// ── Raffle Detail ──
async function openDetail(id: number): Promise<void> {
  // Refresh from chain
  let raffle: Raffle;
  try {
    raffle = await fetchRaffle(provider, id);
  } catch (err) {
    console.error("Failed to fetch raffle:", err);
    showToast("Failed to load raffle details", "error");
    return;
  }

  currentRaffleId = id;
  const status = getStatus(raffle);

  detailTitle.textContent = raffle.title;
  detailPrice.textContent = `${raffle.ticketPrice} STRK`;
  detailTickets.textContent = `${raffle.ticketCount} / ${raffle.maxTickets}`;
  detailTime.textContent = timeRemaining(raffle.endTime);
  detailCreator.textContent = truncate(raffle.creator);

  // Progress bar
  const pct = raffle.maxTickets > 0 ? Math.round((raffle.ticketCount / raffle.maxTickets) * 100) : 0;
  const progressText = document.getElementById("detail-progress-text");
  const progressFill = document.getElementById("detail-progress-fill");
  if (progressText) progressText.textContent = `${raffle.ticketCount} / ${raffle.maxTickets}`;
  if (progressFill) progressFill.style.width = `${pct}%`;

  // Winner banner
  if (raffle.winner) {
    winnerBanner.style.display = "block";
    winnerAddress.textContent = truncate(raffle.winner, 8);
  } else {
    winnerBanner.style.display = "none";
  }

  // Actions
  detailActions.innerHTML = "";

  // Share button (always visible)
  const shareBtn = document.createElement("button");
  shareBtn.className = "btn btn-secondary";
  shareBtn.textContent = "Copy Share Link";
  shareBtn.addEventListener("click", () => {
    const url = `${window.location.origin}${window.location.pathname}?raffle=${raffle.id}`;
    navigator.clipboard.writeText(url);
    shareBtn.textContent = "Link Copied!";
    showToast("Share link copied to clipboard!", "success", 2000);
    setTimeout(() => { shareBtn.textContent = "Copy Share Link"; }, 2000);
  });
  detailActions.appendChild(shareBtn);

  if (status === "active" && wallet) {
    const alreadyBought = raffle.tickets.some(
      (t) => t.buyer.toLowerCase() === wallet!.address.toLowerCase()
    );
    const full = isRaffleFull(raffle);

    if (!alreadyBought && !full) {
      const buyBtn = document.createElement("button");
      buyBtn.className = "btn btn-success btn-large";
      buyBtn.textContent = `Buy Ticket (${raffle.ticketPrice} STRK)`;
      buyBtn.addEventListener("click", () => buyTicket(raffle));
      detailActions.appendChild(buyBtn);
    }

    if (alreadyBought) {
      const note = document.createElement("span");
      note.style.cssText = "color: var(--green); font-size: 13px; align-self: center;";
      note.textContent = "You have a ticket!";
      detailActions.appendChild(note);
    }

    if (full) {
      const note = document.createElement("span");
      note.style.cssText = "color: var(--orange); font-size: 13px; align-self: center;";
      note.textContent = "Sold out!";
      detailActions.appendChild(note);
    }
  }

  if (status === "ended" && wallet && raffle.ticketCount > 0) {
    const isCreator = wallet.address.toLowerCase() === raffle.creator.toLowerCase();
    if (isCreator) {
      const drawBtn = document.createElement("button");
      drawBtn.className = "btn btn-primary btn-large";
      drawBtn.textContent = "Draw Winner";
      drawBtn.addEventListener("click", () => pickWinner(raffle.id));
      detailActions.appendChild(drawBtn);
    }
  }

  if (raffle.winner && wallet) {
    const isWinner = wallet.address.toLowerCase() === raffle.winner.toLowerCase();
    if (isWinner && !raffle.claimed) {
      const claimBtn = document.createElement("button");
      claimBtn.className = "btn btn-success btn-large";
      claimBtn.textContent = "Claim Prize!";
      claimBtn.addEventListener("click", () => claimPrize(raffle.id));
      detailActions.appendChild(claimBtn);
    }
  }

  // Ticket list
  ticketList.innerHTML = "";
  if (raffle.tickets.length === 0) {
    ticketList.innerHTML = '<div class="no-tickets">No tickets bought yet</div>';
  } else {
    for (const ticket of raffle.tickets) {
      const item = document.createElement("div");
      item.className = "ticket-item";
      const isWinner = raffle.winner && ticket.buyer.toLowerCase() === raffle.winner.toLowerCase();
      item.innerHTML = `
        <span>${isWinner ? "&#127942; " : ""}${truncate(ticket.buyer)}</span>
        <span style="color:var(--text-dim);font-size:12px;">Ticket #${ticket.index + 1}</span>
      `;
      ticketList.appendChild(item);
    }
  }

  showView("detail");
}

// ── Buy Ticket (Starkzap SDK — approve + buy_ticket on-chain) ──
async function buyTicket(raffle: Raffle): Promise<void> {
  if (!wallet) return;

  const buyBtn = detailActions.querySelector(".btn-success") as HTMLButtonElement | null;
  if (buyBtn) {
    buyBtn.disabled = true;
    buyBtn.innerHTML = '<span class="spinner"></span>Processing...';
  }

  try {
    // Build approve + buy_ticket calls
    const calls = populateBuyTicket(raffle.id, raffle.ticketPrice);

    // Execute via Starkzap SDK
    const tx = await wallet.execute(calls);
    showToast("Transaction submitted, waiting for confirmation...", "info", 15000);

    // Wait for on-chain confirmation
    await tx.wait();

    const explorerLink = tx.explorerUrl
      ? `<br/><a href="${tx.explorerUrl}" target="_blank">View on explorer</a>`
      : "";
    showToast(`Ticket purchased on-chain!${explorerLink}`, "success", 6000);

    // Refresh detail from chain
    await openDetail(raffle.id);
    refreshBalance();
  } catch (err: unknown) {
    console.error("Buy ticket failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    showToast(`Transaction failed: ${msg}`, "error");
  } finally {
    if (buyBtn) {
      buyBtn.disabled = false;
      buyBtn.textContent = `Buy Ticket (${raffle.ticketPrice} STRK)`;
    }
  }
}

// ── Draw Winner (Starkzap SDK — on-chain) ──
async function pickWinner(raffleId: number): Promise<void> {
  if (!wallet) return;

  const drawBtn = detailActions.querySelector(".btn-primary") as HTMLButtonElement | null;
  if (drawBtn) {
    drawBtn.disabled = true;
    drawBtn.innerHTML = '<span class="spinner"></span>Drawing...';
  }

  try {
    const calls = populateDrawWinner(raffleId);
    const tx = await wallet.execute(calls);
    showToast("Drawing winner on-chain...", "info", 15000);
    await tx.wait();

    const explorerLink = tx.explorerUrl
      ? `<br/><a href="${tx.explorerUrl}" target="_blank">View on explorer</a>`
      : "";
    showToast(`Winner drawn on-chain!${explorerLink}`, "success", 6000);

    await openDetail(raffleId);
  } catch (err: unknown) {
    console.error("Draw winner failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    showToast(`Draw failed: ${msg}`, "error");
  }
}

// ── Claim Prize (Starkzap SDK — on-chain) ──
async function claimPrize(raffleId: number): Promise<void> {
  if (!wallet) return;

  try {
    const calls = populateClaimPrize(raffleId);
    const tx = await wallet.execute(calls);
    showToast("Claiming prize...", "info", 15000);
    await tx.wait();

    const explorerLink = tx.explorerUrl
      ? `<br/><a href="${tx.explorerUrl}" target="_blank">View on explorer</a>`
      : "";
    showToast(`Prize claimed!${explorerLink}`, "success", 6000);

    await openDetail(raffleId);
    refreshBalance();
  } catch (err: unknown) {
    console.error("Claim failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    showToast(`Claim failed: ${msg}`, "error");
  }
}

// ── Create Raffle (Starkzap SDK — on-chain) ──
function openCreateModal(): void {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  formEnd.value = now.toISOString().slice(0, 16);
  formTitle.value = "";
  formPrice.value = "";
  formMax.value = "";
  createModal.classList.add("open");
}

function closeCreateModal(): void {
  createModal.classList.remove("open");
}

async function handleCreate(): Promise<void> {
  if (!wallet) return;

  const title = formTitle.value.trim();
  const price = formPrice.value.trim();
  const max = parseInt(formMax.value, 10);
  const endTime = new Date(formEnd.value).getTime();

  // Validation
  if (!title) return showToast("Enter a title", "error");
  if (title.length > 31) return showToast("Title max 31 characters (felt252 limit)", "error");
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)
    return showToast("Enter a valid ticket price", "error");
  if (!max || max < 2) return showToast("Max tickets must be at least 2", "error");
  if (endTime <= Date.now()) return showToast("End time must be in the future", "error");

  try {
    Amount.parse(price, STRK);
  } catch {
    return showToast("Invalid ticket price format", "error");
  }

  const confirmBtn = document.getElementById("confirm-create") as HTMLButtonElement;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span class="spinner"></span>Creating...';

  try {
    const endTimeSeconds = Math.floor(endTime / 1000);
    const calls = populateCreateRaffle(title, price, max, endTimeSeconds);

    // Execute via Starkzap SDK
    const tx = await wallet.execute(calls);
    showToast("Creating raffle on-chain...", "info", 15000);
    await tx.wait();

    const explorerLink = tx.explorerUrl
      ? `<br/><a href="${tx.explorerUrl}" target="_blank">View on explorer</a>`
      : "";
    showToast(`Raffle created on-chain!${explorerLink}`, "success", 6000);

    closeCreateModal();
    await loadAndRenderRaffles();
  } catch (err: unknown) {
    console.error("Create raffle failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    showToast(`Create failed: ${msg}`, "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = "Create Raffle";
  }
}

// ── HTML Escaping ──
function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Event Listeners ──
connectBtn.addEventListener("click", connect);
connectBtnHero.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);

document.getElementById("back-btn")!.addEventListener("click", async () => {
  showView("browse");
  await loadAndRenderRaffles();
});

document.getElementById("create-btn")!.addEventListener("click", openCreateModal);
document.getElementById("create-btn-empty")!.addEventListener("click", openCreateModal);
document.getElementById("cancel-create")!.addEventListener("click", closeCreateModal);
document.getElementById("confirm-create")!.addEventListener("click", handleCreate);

createModal.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});

addressDisplay.addEventListener("click", () => {
  if (wallet) {
    navigator.clipboard.writeText(wallet.address);
    showToast("Address copied!", "info", 2000);
  }
});

// ── Countdown Timer ──
setInterval(() => {
  if (browseView.style.display === "block") renderRaffles();
  if (detailView.style.display === "block" && currentRaffleId !== null) {
    const raffle = cachedRaffles.find((r) => r.id === currentRaffleId);
    const el = document.getElementById("detail-time");
    if (el && raffle) el.textContent = timeRemaining(raffle.endTime);
  }
}, 30000);

// ── Deep Link Handling ──
let pendingRaffleId: number | null = null;

function checkDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  const raffleParam = params.get("raffle");
  if (raffleParam !== null) {
    const id = parseInt(raffleParam, 10);
    if (!isNaN(id)) {
      pendingRaffleId = id;
    }
  }
}

const originalConnect = connect;
async function connectWithDeepLink(): Promise<void> {
  await originalConnect();
  if (wallet && pendingRaffleId !== null) {
    const id = pendingRaffleId;
    pendingRaffleId = null;
    await openDetail(id);
  }
}
connectBtn.removeEventListener("click", connect);
connectBtnHero.removeEventListener("click", connect);
connectBtn.addEventListener("click", connectWithDeepLink);
connectBtnHero.addEventListener("click", connectWithDeepLink);

// ── Init ──
showView("connect");
checkDeepLink();
