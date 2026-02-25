use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct RaffleInfo {
    pub creator: ContractAddress,
    pub title: felt252,
    pub ticket_price: u256,
    pub max_tickets: u32,
    pub end_time: u64,
    pub ticket_count: u32,
    pub winner: ContractAddress,
    pub claimed: bool,
}

#[starknet::interface]
pub trait IRaffle<TContractState> {
    fn create_raffle(
        ref self: TContractState,
        title: felt252,
        ticket_price: u256,
        max_tickets: u32,
        end_time: u64,
    ) -> u64;
    fn buy_ticket(ref self: TContractState, raffle_id: u64);
    fn draw_winner(ref self: TContractState, raffle_id: u64);
    fn claim_prize(ref self: TContractState, raffle_id: u64);
    fn get_raffle(self: @TContractState, raffle_id: u64) -> RaffleInfo;
    fn get_raffle_count(self: @TContractState) -> u64;
    fn get_ticket_buyer(self: @TContractState, raffle_id: u64, ticket_index: u32) -> ContractAddress;
    fn get_strk_address(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
mod RaffleContract {
    use super::{RaffleInfo, IRaffle};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp, get_block_info};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use core::num::traits::Zero;
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

    #[storage]
    struct Storage {
        strk_address: ContractAddress,
        raffle_count: u64,
        raffles: Map<u64, RaffleInfo>,
        // raffle_id -> ticket_index -> buyer address
        tickets: Map<(u64, u32), ContractAddress>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        RaffleCreated: RaffleCreated,
        TicketBought: TicketBought,
        WinnerDrawn: WinnerDrawn,
        PrizeClaimed: PrizeClaimed,
    }

    #[derive(Drop, starknet::Event)]
    struct RaffleCreated {
        raffle_id: u64,
        creator: ContractAddress,
        title: felt252,
        ticket_price: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct TicketBought {
        raffle_id: u64,
        buyer: ContractAddress,
        ticket_index: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct WinnerDrawn {
        raffle_id: u64,
        winner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct PrizeClaimed {
        raffle_id: u64,
        winner: ContractAddress,
        amount: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, strk_address: ContractAddress) {
        self.strk_address.write(strk_address);
        self.raffle_count.write(0);
    }

    #[abi(embed_v0)]
    impl RaffleImpl of IRaffle<ContractState> {
        fn create_raffle(
            ref self: ContractState,
            title: felt252,
            ticket_price: u256,
            max_tickets: u32,
            end_time: u64,
        ) -> u64 {
            let caller = get_caller_address();
            assert!(ticket_price > 0, "Ticket price must be > 0");
            assert!(max_tickets >= 2, "Need at least 2 tickets");
            assert!(end_time > get_block_timestamp(), "End time must be in the future");

            let raffle_id = self.raffle_count.read();
            self.raffle_count.write(raffle_id + 1);

            let raffle = RaffleInfo {
                creator: caller,
                title,
                ticket_price,
                max_tickets,
                end_time,
                ticket_count: 0,
                winner: Zero::zero(),
                claimed: false,
            };
            self.raffles.write(raffle_id, raffle);

            self.emit(RaffleCreated { raffle_id, creator: caller, title, ticket_price });

            raffle_id
        }

        fn buy_ticket(ref self: ContractState, raffle_id: u64) {
            let caller = get_caller_address();
            let mut raffle = self.raffles.read(raffle_id);

            assert!(raffle.ticket_count < raffle.max_tickets, "Raffle is full");
            assert!(get_block_timestamp() < raffle.end_time, "Raffle has ended");
            assert!(raffle.winner.is_zero(), "Winner already drawn");

            // Transfer STRK from buyer to this contract
            let strk = IERC20Dispatcher { contract_address: self.strk_address.read() };
            let contract_addr = starknet::get_contract_address();
            strk.transfer_from(caller, contract_addr, raffle.ticket_price);

            // Record ticket
            let ticket_index = raffle.ticket_count;
            self.tickets.write((raffle_id, ticket_index), caller);
            raffle.ticket_count = ticket_index + 1;
            self.raffles.write(raffle_id, raffle);

            self.emit(TicketBought { raffle_id, buyer: caller, ticket_index });
        }

        fn draw_winner(ref self: ContractState, raffle_id: u64) {
            let caller = get_caller_address();
            let mut raffle = self.raffles.read(raffle_id);

            assert!(caller == raffle.creator, "Only creator can draw");
            assert!(get_block_timestamp() >= raffle.end_time, "Raffle not ended yet");
            assert!(raffle.winner.is_zero(), "Winner already drawn");
            assert!(raffle.ticket_count > 0, "No tickets sold");

            // Pseudo-random using block info
            let block_info = get_block_info().unbox();
            let seed: u256 = block_info.block_timestamp.into() + block_info.block_number.into();
            let winner_index: u32 = (seed % raffle.ticket_count.into()).try_into().unwrap();

            let winner = self.tickets.read((raffle_id, winner_index));
            raffle.winner = winner;
            self.raffles.write(raffle_id, raffle);

            self.emit(WinnerDrawn { raffle_id, winner });
        }

        fn claim_prize(ref self: ContractState, raffle_id: u64) {
            let caller = get_caller_address();
            let mut raffle = self.raffles.read(raffle_id);

            assert!(!raffle.winner.is_zero(), "No winner yet");
            assert!(caller == raffle.winner, "Only winner can claim");
            assert!(!raffle.claimed, "Already claimed");

            raffle.claimed = true;
            self.raffles.write(raffle_id, raffle);

            // Transfer total prize to winner
            let prize: u256 = raffle.ticket_price * raffle.ticket_count.into();
            let strk = IERC20Dispatcher { contract_address: self.strk_address.read() };
            strk.transfer(caller, prize);

            self.emit(PrizeClaimed { raffle_id, winner: caller, amount: prize });
        }

        fn get_raffle(self: @ContractState, raffle_id: u64) -> RaffleInfo {
            self.raffles.read(raffle_id)
        }

        fn get_raffle_count(self: @ContractState) -> u64 {
            self.raffle_count.read()
        }

        fn get_ticket_buyer(self: @ContractState, raffle_id: u64, ticket_index: u32) -> ContractAddress {
            self.tickets.read((raffle_id, ticket_index))
        }

        fn get_strk_address(self: @ContractState) -> ContractAddress {
            self.strk_address.read()
        }
    }
}
