# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2025-01-13

### Fixed
- 🔧 **Solana RPC compatibility** - Replaced WebSocket subscriptions with HTTP polling for better RPC provider compatibility
- 🔐 **Base58 private key parsing** - Added built-in base58 decoder, eliminating external bs58 dependency requirement
- ⚡ **Transaction verification** - Implemented retry logic (up to 10 attempts) with 2-second intervals for blockchain transaction fetching
- 🔄 **Refund confirmations** - Changed from `sendAndConfirmTransaction` to manual polling for Alchemy and other RPC providers without WebSocket support
- 🎯 **Transaction structure** - Simplified reference tracking by adding it as readonly key to main instruction instead of creating separate empty instruction
- 💰 **Payment amounts** - Fixed display formatting with proper lamports to SOL conversion
- 🛡️ **Error handling** - Improved error messages and fallbacks throughout entire payment flow
- 🌐 **Browser compatibility** - Replaced Node.js `Buffer` with browser-native `Uint8Array`

### Added
- 📊 **Enhanced logging** - Added detailed transaction fetching status and retry attempt tracking
- 🔍 **Debug information** - Comprehensive debug output for payment verification process
- ⏱️ **Configurable timeouts** - Transaction verification with exponential backoff and maximum retry limits
- 🌐 **RPC endpoint proxy** - Added `/blockhash` server endpoint for secure blockhash retrieval without exposing API keys to clients
- 📝 **Better error messages** - User-friendly error messages for common issues (insufficient balance, network errors, etc.)

### Changed
- 📦 **Dependencies** - Removed hard dependency on bs58 package (now uses built-in base58 decoder)
- 🔌 **Connection method** - Improved compatibility with various Solana RPC providers (Alchemy, Helius, QuickNode, public endpoints)
- 💵 **Default pricing** - Reduced example pricing from 0.03 SOL to 0.003 SOL for more accessible testing
- 🔐 **Security** - Merchant RPC endpoint only used server-side via `/blockhash` proxy, never exposed to client

### Technical Details
- **RPC provider support** - Works with any Solana RPC provider, including those without WebSocket support (Alchemy, Helius)
- **Transaction confirmation** - Uses HTTP polling-based confirmation (getSignatureStatus) instead of WebSocket subscriptions (signatureSubscribe)
- **Payment verification** - Retry logic handles transaction propagation delays across RPC nodes
- **Refund system** - Automatic refunds work reliably even with rate-limited or WebSocket-less RPC endpoints
- **Client architecture** - Browser client uses Phantom's built-in transaction handling, only needs blockhash from server
- **Base58 encoding** - Custom implementation included to avoid dependency issues in different environments

### Developer Experience
- 🚀 **Easier setup** - Fewer dependencies to install and configure
- 🐛 **Better debugging** - Detailed logs show exactly where in the process things succeed or fail
- 📖 **Clearer errors** - Actionable error messages guide users to solutions
- 🔧 **More flexible** - Works with any Solana RPC provider, not just ones with full WebSocket support

## [0.1.0] - 2025-01-12

### Added

#### Core Features
- ✨ Initial release of WS402 library
- 🔌 Core WS402 protocol implementation
- 🌐 WebSocket session management with real-time tracking
- ⚡ Real-time usage metering (time, bytes, messages)
- 💰 Automatic refund system for unused balance
- 🔒 Payment provider interface with multiple implementations
- 📊 Comprehensive session lifecycle management
- 🎯 Event system for monitoring and callbacks
- 📝 TypeScript support with full type definitions
- 🛠️ Express middleware helpers for easy integration

#### Payment Providers
- 🧪 **MockPaymentProvider** - For development and testing
- ⚡ **BasePaymentProvider** - Base blockchain (Ethereum L2) integration
  - Native ETH payments on Base network
  - ERC20 token support (USDC, etc.)
  - On-chain payment verification
  - Automatic on-chain refunds
  - Support for Base mainnet, Goerli, and Sepolia testnets
  - Low fees (~$0.01) and fast confirmations (2-5 seconds)
- 🚀 **SolanaPaymentProvider** - Solana blockchain integration
  - Native SOL payments
  - SPL token support (USDC, USDT, etc.)
  - Solana Pay QR code generation
  - On-chain payment verification
  - Automatic on-chain refunds
  - Ultra-low fees (~$0.0001) and sub-second confirmations
  - Support for mainnet-beta, devnet, and testnet
- 🏦 **ProxyPaymentProvider** - Centralized gateway architecture
  - Delegates payment operations to external gateway
  - No private keys on WS402 servers
  - Horizontal scalability for enterprise deployments
  - Retry logic with exponential backoff
  - Health check monitoring
  - API key authentication

#### Architecture & Security
- 🏗️ Proxy architecture for enterprise deployments
- 🔐 Secure private key management with environment variables
- 🛡️ Comprehensive security documentation
- 📡 Payment gateway server implementation
- 🔄 Automatic refund processing on blockchain
- ⚙️ Configurable conversion rates and pricing

#### Examples & Documentation
- 📚 Complete working examples for all providers
- 🎨 HTML client implementations with wallet integrations
- 📖 Comprehensive documentation
- 🔨 TypeScript compilation with development tools

---

## Future Plans

### [0.2.0] - Planned Q1 2025
- 🔌 Bitcoin Lightning Network support
- 📊 Enhanced metrics and analytics dashboard
- 🧪 Comprehensive test suite with Jest
- 🔄 Session persistence and resumption
- ⚡ Rate limiting and throttling
- 🌍 Additional blockchain integrations
- 📱 Client SDK libraries (JavaScript, Python, Go)

### [0.3.0] - Planned Q2 2025
- 🎮 WebRTC support for real-time communications
- 🏆 Distribution pool for maintainer rewards
- 🔐 Multi-signature wallet support
- 🌐 GraphQL API endpoint
- 📊 Built-in analytics and reporting

### [1.0.0] - Planned Q3 2025
- 🚀 Production-ready stable release
- 🏢 Enterprise features and SLA guarantees
- 🔒 Advanced security auditing
- 📊 Comprehensive benchmarking
- 🌍 Multi-region deployment support

---

## Links

- 📦 NPM Package: https://npmjs.com/package/ws402
- 💻 GitHub Repository: https://github.com/ws402/ws402
- 🌐 Website: https://ws402.org
- 📚 Documentation: https://docs.ws402.org
- 💬 Community Discord: https://discord.gg/ws402
- 🐦 Twitter/X: https://x.com/ws402org
- 🔗 Farcaster: https://farcaster.xyz/ws402

---

[Unreleased]: https://github.com/ws402/ws402/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/ws402/ws402/compare/v0.1.0...v0.1.4
[0.1.0]: https://github.com/ws402/ws402/releases/tag/v0.1.0