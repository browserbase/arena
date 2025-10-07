# Arena

[Demo Website](https://arena.browserbase.com)

A side-by-side comparison playground for AI browser automation agents. Compare how different AI models (Google, OpenAI, Anthropic) control browsers using natural language through Stagehand and Browserbase.

## Features

- 🥊 **Side-by-Side Comparison**: Run Google vs OpenAI or Google vs Anthropic simultaneously
- 🤖 **Multiple AI Models**: Google Computer Use, OpenAI Computer Use, and Anthropic Claude
- 🌐 **Real Browser Environment**: Powered by Browserbase with actual Chrome instances
- 🎯 **Natural Language Commands**: Describe tasks in plain English
- 📊 **Real-time Streaming**: Watch both agents work in parallel with live updates
- 🔄 **Flexible Provider Selection**: Switch right-side provider between OpenAI and Anthropic

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript, React 19, and Tailwind CSS
- **AI Models**:
  - Google: `computer-use-preview-10-2025`
  - OpenAI: `computer-use-preview-2025-03-11`
  - Anthropic: `claude-sonnet-4-5-20250929`
- **Browser Automation**: Browserbase + Stagehand
- **Streaming**: Server-Sent Events (SSE) for real-time updates
- **UI Components**: Framer Motion animations, Lucide React icons
- **Analytics**: PostHog for user tracking

## Prerequisites

- Node.js 18.x or later
- pnpm (recommended) or npm
- API keys for Google AI Studio, OpenAI, Anthropic, and Browserbase

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/browserbase/arena
   cd arena
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

   Then edit `.env.local` with your API keys:
   ```env
   # AI Provider API Keys
   GOOGLE_API_KEY=your_google_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here

   # Browserbase Configuration
   BROWSERBASE_API_KEY=your_browserbase_api_key_here
   BROWSERBASE_PROJECT_ID=your_browserbase_project_id_here

   # Optional: Analytics and monitoring
   NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

   # Site URL (for local development)
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   **Get your API keys:**
   - Google: [Google AI Studio](https://aistudio.google.com/apikey)
   - OpenAI: [OpenAI Platform](https://platform.openai.com/api-keys)
   - Anthropic: [Anthropic Console](https://console.anthropic.com/)
   - Browserbase: [Browserbase Dashboard](https://www.browserbase.com/overview)

4. **Start the development server:**
   ```bash
   pnpm dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Select Providers**: Choose between OpenAI or Anthropic for the right-side comparison (Google is always on the left)
2. **Enter a Task**: Type a natural language instruction or use one of the example prompts:
   - Review a pull request on GitHub
   - Browse Hacker News for trending debates
   - Play a game of 2048
   - Get current crypto prices
3. **Watch Both Agents**: See real-time execution with screenshots and logs from both models
4. **Compare Results**: Observe how different models approach and solve the same task

# Available Scripts

```bash
# Development server with Turbopack
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint
```

## Configuration

Agent behavior is configured via [AGENT_INSTRUCTIONS](app/constants/prompt.ts):
- Atomic step-by-step execution
- Direct navigation preferred over search
- Risk-averse action selection
- Automatic screenshots after key actions
- Maximum 100 steps per execution

## Limitations

- Maximum session duration: 10 minutes (Vercel timeout)
- Viewport locked at 1288x711 pixels
- No keyboard shortcuts support
- Browser sessions expire after completion
- Left panel always runs Google (fixed)

## Troubleshooting

- **Session fails to start**: Verify Browserbase API credentials and project ID
- **Agent not responding**: Check that API keys are valid for all selected providers
- **Timeout errors**: Complex tasks may exceed 10-minute limit
- **Connection issues**: Ensure stable internet for browser streaming
- **Missing providers**: Confirm all required API keys are set in `.env.local`

## Contributing

This is a demo playground project showcasing multi-provider browser automation. Feel free to fork and experiment!

## License

MIT

## Acknowledgments

- [Browserbase](https://browserbase.com) for browser infrastructure
- [Stagehand](https://github.com/browserbasehq/stagehand) for automation framework
- [Google AI Studio](https://aistudio.google.com/), [OpenAI](https://openai.com/), and [Anthropic](https://anthropic.com/) for AI capabilities
- [Vercel](https://vercel.com) for hosting and edge functions