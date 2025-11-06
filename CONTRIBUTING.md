# Contributing to WS402

Thank you for your interest in contributing to WS402! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/ws402/ws402.git
   cd ws402
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run examples**
   ```bash
   npm run example
   ```

## Development Workflow

1. Create a new branch for your feature/fix
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. Make your changes in the `src/` directory

3. Build and test your changes
   ```bash
   npm run build
   npm test
   ```

4. Commit with clear messages
   ```bash
   git commit -m "feat: add new payment provider integration"
   ```

5. Push and create a Pull Request

## Code Style

- Use TypeScript for all new code
- Follow existing code style
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

## Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Include both unit and integration tests

## Payment Provider Integration

When adding a new payment provider:

1. Create a new file in `src/providers/`
2. Implement the `PaymentProvider` interface
3. Add documentation with example usage
4. Include configuration options
5. Add tests

## Documentation

- Update README.md for new features
- Add JSDoc comments to public APIs
- Include code examples
- Update CHANGELOG.md

## Distribution Pool

If this project becomes successful, we plan to create a distribution pool to reward active maintainers. Your contributions matter!

## Questions?

- Open an issue for questions
- Join discussions on X: [@ws402org](https://x.com/ws402org)
- Check existing issues and PRs first

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Collaborate in good faith

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
