import { Amount, sepoliaTokens, fromAddress } from "starkzap";
import type { WalletInterface } from "starkzap";
import { Contract, RpcProvider, num, type Call } from "starknet";

const STRK = sepoliaTokens.STRK;

export const RAFFLE_CONTRACT =
  "0x00a598e4d0a74221b821fbf5501f8a07462b63c5de3fcd5cb30eefc90d04822c";

// Full compiled ABI from Cairo contract (includes struct/enum definitions for proper parsing)
const RAFFLE_ABI = [
  {
    type: "impl",
    name: "RaffleImpl",
    interface_name: "raffle::IRaffle",
  },
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "enum",
    name: "core::bool",
    variants: [
      { name: "False", type: "()" },
      { name: "True", type: "()" },
    ],
  },
  {
    type: "struct",
    name: "raffle::RaffleInfo",
    members: [
      { name: "creator", type: "core::starknet::contract_address::ContractAddress" },
      { name: "title", type: "core::felt252" },
      { name: "ticket_price", type: "core::integer::u256" },
      { name: "max_tickets", type: "core::integer::u32" },
      { name: "end_time", type: "core::integer::u64" },
      { name: "ticket_count", type: "core::integer::u32" },
      { name: "winner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "claimed", type: "core::bool" },
    ],
  },
  {
    type: "interface",
    name: "raffle::IRaffle",
    items: [
      {
        type: "function",
        name: "create_raffle",
        inputs: [
          { name: "title", type: "core::felt252" },
          { name: "ticket_price", type: "core::integer::u256" },
          { name: "max_tickets", type: "core::integer::u32" },
          { name: "end_time", type: "core::integer::u64" },
        ],
        outputs: [{ type: "core::integer::u64" }],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "buy_ticket",
        inputs: [{ name: "raffle_id", type: "core::integer::u64" }],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "draw_winner",
        inputs: [{ name: "raffle_id", type: "core::integer::u64" }],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "claim_prize",
        inputs: [{ name: "raffle_id", type: "core::integer::u64" }],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "get_raffle",
        inputs: [{ name: "raffle_id", type: "core::integer::u64" }],
        outputs: [{ type: "raffle::RaffleInfo" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_raffle_count",
        inputs: [],
        outputs: [{ type: "core::integer::u64" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_ticket_buyer",
        inputs: [
          { name: "raffle_id", type: "core::integer::u64" },
          { name: "ticket_index", type: "core::integer::u32" },
        ],
        outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_strk_address",
        inputs: [],
        outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
        state_mutability: "view",
      },
    ],
  },
] as const;

export interface Ticket {
  buyer: string;
  index: number;
}

export interface Raffle {
  id: number;
  creator: string;
  title: string;
  ticketPrice: string;
  maxTickets: number;
  endTime: number;
  ticketCount: number;
  tickets: Ticket[];
  winner: string | null;
  claimed: boolean;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";

function isZeroAddress(addr: string): boolean {
  return BigInt(addr) === 0n;
}

function feltToString(felt: bigint | string): string {
  const hex = BigInt(felt).toString(16);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (code > 0) str += String.fromCharCode(code);
  }
  return str;
}

function stringToFelt(str: string): string {
  let hex = "0x";
  for (let i = 0; i < str.length && i < 31; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

export function getContract(provider: RpcProvider): Contract {
  return new Contract({
    abi: RAFFLE_ABI as any,
    address: RAFFLE_CONTRACT,
    providerOrAccount: provider,
  });
}

// ── Read Functions (via Starkzap SDK's provider) ──

export async function fetchRaffleCount(provider: RpcProvider): Promise<number> {
  const contract = getContract(provider);
  const result = await contract.call("get_raffle_count", []);
  return Number(result);
}

export async function fetchRaffle(
  provider: RpcProvider,
  raffleId: number
): Promise<Raffle> {
  const contract = getContract(provider);
  const result = await contract.call("get_raffle", [raffleId]) as any;

  // Result is a RaffleInfo struct with named fields
  const creator = num.toHex(result.creator);
  const titleFelt = result.title;
  const ticketPrice = BigInt(result.ticket_price);
  const maxTickets = Number(result.max_tickets);
  const endTime = Number(result.end_time);
  const ticketCount = Number(result.ticket_count);
  const winner = num.toHex(result.winner);
  // core::bool is a Cairo enum — starknet.js returns it as CairoCustomEnum with activeVariant
  const claimed = result.claimed?.activeVariant === "True" || result.claimed === true;

  // Fetch ticket buyers
  const tickets: Ticket[] = [];
  for (let i = 0; i < ticketCount; i++) {
    const buyer = await contract.call("get_ticket_buyer", [raffleId, i]) as any;
    tickets.push({ buyer: num.toHex(buyer), index: i });
  }

  const priceAmount = Amount.fromRaw(ticketPrice, STRK);

  return {
    id: raffleId,
    creator,
    title: feltToString(titleFelt),
    ticketPrice: priceAmount.toUnit(),
    maxTickets,
    endTime: endTime * 1000, // Convert seconds to ms
    ticketCount,
    tickets,
    winner: isZeroAddress(winner) ? null : winner,
    claimed,
  };
}

export async function fetchAllRaffles(provider: RpcProvider): Promise<Raffle[]> {
  const count = await fetchRaffleCount(provider);
  const raffles: Raffle[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const raffle = await fetchRaffle(provider, i);
      raffles.push(raffle);
    } catch (err) {
      console.error(`Failed to fetch raffle ${i}:`, err);
    }
  }
  return raffles;
}

// ── Write Functions (via Starkzap SDK's wallet.execute) ──

export function populateCreateRaffle(
  title: string,
  ticketPrice: string,
  maxTickets: number,
  endTimeSeconds: number
): Call[] {
  const priceAmount = Amount.parse(ticketPrice, STRK);
  const priceBase = priceAmount.toBase();

  return [
    {
      contractAddress: RAFFLE_CONTRACT,
      entrypoint: "create_raffle",
      calldata: [
        stringToFelt(title),
        priceBase.toString(),
        "0", // u256 high
        maxTickets.toString(),
        endTimeSeconds.toString(),
      ],
    },
  ];
}

export function populateBuyTicket(raffleId: number, ticketPrice: string): Call[] {
  const priceAmount = Amount.parse(ticketPrice, STRK);
  const priceBase = priceAmount.toBase();

  // First approve STRK spend, then buy ticket
  return [
    {
      contractAddress: STRK.address,
      entrypoint: "approve",
      calldata: [RAFFLE_CONTRACT, priceBase.toString(), "0"],
    },
    {
      contractAddress: RAFFLE_CONTRACT,
      entrypoint: "buy_ticket",
      calldata: [raffleId.toString()],
    },
  ];
}

export function populateDrawWinner(raffleId: number): Call[] {
  return [
    {
      contractAddress: RAFFLE_CONTRACT,
      entrypoint: "draw_winner",
      calldata: [raffleId.toString()],
    },
  ];
}

export function populateClaimPrize(raffleId: number): Call[] {
  return [
    {
      contractAddress: RAFFLE_CONTRACT,
      entrypoint: "claim_prize",
      calldata: [raffleId.toString()],
    },
  ];
}

// ── Helper Functions ──

export function getStatus(raffle: Raffle): "active" | "ended" | "drawn" {
  if (raffle.winner) return "drawn";
  if (Date.now() >= raffle.endTime) return "ended";
  return "active";
}

export function isRaffleFull(raffle: Raffle): boolean {
  return raffle.ticketCount >= raffle.maxTickets;
}

export function timeRemaining(endTime: number): string {
  const diff = endTime - Date.now();
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}
