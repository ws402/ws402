# WS402 NPM Library - Project Structure

```
ws402/
├── src/                          # TypeScript source code
│   ├── WS402.ts                  # Main WS402 class
│   ├── types.ts                  # TypeScript interfaces and types
│   ├── middleware.ts             # Express middleware helpers
│   ├── index.ts                  # Main export file
│   └── providers/                # Payment provider implementations
│       ├── MockPaymentProvider.ts      # Mock provider for testing
│       └── BasePaymentProvider.ts      # BASE blockchain provider template
│
├── examples/                     # Usage examples
│   ├── basic-server.js           # Basic server example
│   └── public/
│       └── index.html            # Client example with UI
│
├── dist/                         # Compiled JavaScript (generated)
│   ├── index.js
│   ├── index.d.ts
│   └── ...
│
├── test/                         # Test files (to be created)
│   └── ...
│
├── package.json                  # NPM package configuration
├── tsconfig.json                 # TypeScript configuration
├── .gitignore                    # Git ignore rules
├── .npmignore                    # NPM ignore rules
├── README.md                     # Main documentation
├── CONTRIBUTING.md               # Contribution guidelines
└── LICENSE                       # MIT License
```

## Key Files

### Core Library (`src/`)

- **WS402.ts**: Main protocol implementation
  - Session management
  - Payment verification
  - Usage tracking
  - Automatic refunds
  
- **types.ts**: All TypeScript interfaces
  - `WS402Config`
  - `WS402Session`
  - `PaymentProvider`
  - `WS402Schema`
  
- **middleware.ts**: Express helpers
  - `createWS402Middleware()`
  - `isWS402Request()`
  
- **providers/**: Payment integrations
  - MockPaymentProvider: For development
  - BasePaymentProvider: For production

### Examples (`examples/`)

- **basic-server.js**: Complete Node.js server
- **public/index.html**: Browser client demo

## Build Process

1. Write code in `src/` (TypeScript)
2. Run `npm run build`
3. Compiled code goes to `dist/`
4. Publish to NPM with `npm publish`

## Usage Flow

1. Install: `npm install ws402`
2. Import: `const { WS402, MockPaymentProvider } = require('ws402')`
3. Initialize WS402 with config and payment provider
4. Attach to WebSocket server
5. Serve WS402 schema via HTTP endpoint
6. Handle WebSocket connections automatically

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run example
npm run example

# Test
npm test
```

## Publishing Checklist

- [ ] Update version in package.json
- [ ] Run `npm run build`
- [ ] Test examples
- [ ] Update CHANGELOG
- [ ] Commit changes
- [ ] `npm publish`
- [ ] Tag release on GitHub

## Integration Points

### Backend
- WebSocket server (ws package)
- Express for HTTP routes
- Payment provider API

### Frontend
- WebSocket client
- Wallet integration
- UI for usage display

### Blockchain
- BASE network
- Payment provider
- Smart contracts (optional)
