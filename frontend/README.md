# Git Mind Frontend

A powerful, AI-driven code analysis and repository intelligence platform built with React. Git Mind provides comprehensive security auditing, architecture visualization, CVE scanning, and real-time code analysis through an immersive 3D landing experience powered by Spline.

![React](https://img.shields.io/badge/React-19.2.6-61DAFB?style=flat&logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Landing Page

The landing page features an interactive **Spline 3D scene** with a floating data model, **Press Start 2P pixel font** 3D title, and a **cyan/violet** color theme. Navigation is minimal with a brain logo and smooth scroll transitions between sections.

### Landing Page Features

- **Spline 3D Scene** - Full-page interactive 3D data model visualization, synced with text entrance
- **3D Pixel Title** - "GIT MIND" in stacked Press Start 2P text-shadow effect
- **GSAP + Lenis Smooth Scroll** - Physics-based smooth scrolling with ScrollTrigger-powered animations
- **Cinematic Hero Entrance** - Badge, title, headline lines, subhead, and input stagger in with clip reveals
- **Parallax Background Orbs** - Three gradient orbs shift at different rates on scroll
- **Nav Shrink on Scroll** - Navigation bar compresses as user scrolls past hero
- **Magnetic Hover** - Primary buttons respond to cursor proximity with elastic snap-back
- **9 Capability Cards** - Staggered fade+scale+translate reveals on scroll
- **4 Stats** - Scale-in animation with scroll trigger
- **CTA Section** - Pinned reveal with scale and opacity transition
- **Reduced Motion Support** - All animations respect `prefers-reduced-motion`

## Features

- **Repository Analysis** - Analyze any GitHub repository with AI-powered agents
- **Architecture Diagrams** - Auto-generated Mermaid diagrams of codebase architecture
- **Security Scanning** - Detect vulnerabilities with severity ratings (Critical/High/Medium/Low)
- **CVE Database** - Scan dependencies against known CVE vulnerabilities
- **Git Audit** - Analyze commit history for poor messages, secrets, and sensitive files
- **Solidity Audit** - Smart contract security analysis for Ethereum projects
- **Code Audit** - Multi-language static code analysis with severity scoring
- **PR Review** - Automated pull request analysis and review
- **Real-time Chat** - Ask questions about your codebase with AI
- **Organization Audit** - Bulk analysis across multiple repositories
- **Health Scoring** - Repository health grade across 5 dimensions

### Responsive Dashboard

- **Desktop (1024px+)** - 64px nav rail with 40px icon buttons, full command bar
- **Tablet (≤1024px)** - 52px compact nav rail, hidden wordmark
- **Mobile (≤768px)** - Bottom nav bar, stacked layout, full-width input
- **Small Mobile (≤480px)** - Compact everything, tighter spacing
- **Tab Transitions** - Smooth slide-in animation when switching between analysis tabs

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 |
| Icons | lucide-react |
| 3D Scene | Spline (iframe embed) |
| Diagrams | Mermaid.js |
| Animations | GSAP + ScrollTrigger + Lenis |
| Fonts | DM Sans, DM Mono, Press Start 2P |
| Monitoring | Sentry |
| Build | Create React App |
| CSS | Custom Properties + CSS Grid |

## Getting Started

### Prerequisites

- Node.js 16+ (see `.nvmrc`)
- Backend running on port 8002 ([GitMind Backend](https://github.com/your-org/gitmind-backend))

### Installation

```bash
# Clone the repository
git clone https://github.com/bakabee/GIT-MIND-frontend.git
cd GIT-MIND-frontend

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`.

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## Usage

1. **Enter GitHub Username** - Type a username in the command bar
2. **Add Token (Optional)** - Add a GitHub Personal Access Token for private repos
3. **Load Repositories** - Click "Load Repos" or press Enter
4. **Select a Repository** - Click any repo to start analysis
5. **Explore Results** - Navigate through tabs to view analysis results

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + K` | Open command palette |
| `?` | Toggle keyboard shortcuts help |
| `Ctrl/⌘ + 1-9` | Switch between tabs |
| `Ctrl/⌘ + R` | Re-analyze current repo |
| `/` | Focus username input |
| `Escape` | Close modals/panels |

## Theming

GIT MIND includes 7 beautiful themes:

| Theme | Description |
|-------|-------------|
| **Obsidian** | Default dark theme |
| **Daylight** | Light mode |
| **Amber** | Warm paper aesthetic |
| **Verdant** | Forest dark |
| **Glacier** | Cool blue dark |
| **Aurora** | Glass violet dark |
| **Mist** | Glass light |

Themes support 3 density modes: **Comfortable**, **Compact**, and **Spacious**.

## Project Structure

```
frontend/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── AgentPipeline.jsx
│   │   ├── ChatTab.jsx
│   │   ├── CodeAuditTab.jsx
│   │   ├── CommandPalette.jsx
│   │   ├── CrisisChat.jsx
│   │   ├── CveTab.jsx
│   │   ├── DiagramTab.jsx
│   │   ├── DocsTab.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── FilePreviewDrawer.jsx
│   │   ├── GitAuditTab.jsx
│   │   ├── HealthCard.jsx
│   │   ├── KeyboardHelp.jsx
│   │   ├── LandingPage.jsx
│   │   ├── MonitoringTab.jsx
│   │   ├── NodePanel.jsx
│   │   ├── Onboarding.jsx
│   │   ├── OrgAuditModal.jsx
│   │   ├── PRReviewTab.jsx
│   │   ├── SecurityTab.jsx
│   │   ├── Sidebar.jsx
│   │   ├── SolidityTab.jsx
│   │   ├── SummaryTab.jsx
│   │   └── ToastSystem.jsx
│   ├── api.js
│   ├── App.js
│   ├── constants.js
│   ├── index.css
│   ├── index.js
│   └── tokenManager.js
├── package.json
├── vercel.json
└── README.md
```

## Analysis Tabs

| Tab | Description |
|-----|-------------|
| **Summary** | Overview with health score, stats, and findings summary |
| **Architecture** | Interactive Mermaid diagram of codebase structure |
| **API Docs** | Detected API endpoints with methods and descriptions |
| **Security** | Security findings with severity ratings and fix generation |
| **CVE** | Dependency vulnerabilities from CVE database |
| **Git Audit** | Commit quality, secrets, and sensitive file detection |
| **Solidity** | Smart contract security analysis |
| **Code Audit** | Multi-language static analysis |
| **PR Review** | Pull request analysis and review |
| **Watch** | Real-time repository monitoring |
| **Chat** | AI-powered codebase Q&A |

## API Integration

The frontend communicates with the backend via WebSocket for real-time analysis updates:

```javascript
// WebSocket connection for analysis
const ws = new WebSocket(`${WS_BASE}/ws/analyze`);
ws.send(JSON.stringify({
  repo_url: url,
  session_id: sessionId,
  gh_token: token  // optional
}));
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with React and the amazing open-source ecosystem
- Icons provided by lucide-react
- Diagrams powered by Mermaid.js
- Error monitoring by Sentry
