# Compact Pickup

A retro VHS-themed website showcasing compact and mid-size pickup trucks. Built with Next.js, Sanity CMS, and Three.js for 3D model viewing.

## Features

- 🎮 **VHS Camcorder UI** - Authentic retro blue LCD screen aesthetic
- 📸 **Global Photo Carousel** - Randomized gallery of all truck images
- 🚛 **3D Model Viewer** - Interactive GLB model support with Three.js
- 📱 **Responsive Design** - Optimized for mobile and desktop
- 🎨 **Custom VCR Font** - Authentic vintage typography
- ⚡ **Sanity CMS** - Headless content management

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Sanity Studio

Run the Sanity Studio for content management:

```bash
npm run studio:dev
```

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS with custom VHS theme
- **CMS**: Sanity.io
- **3D Graphics**: Three.js + React Three Fiber
- **Typography**: Custom VCR OSD Mono font
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Homepage with carousel
│   ├── [manufacturer]/   # Dynamic manufacturer pages
│   └── [model]/          # Individual truck model pages
├── components/
│   ├── ImageCarousel.tsx  # Global photo carousel
│   └── TruckModel3D.tsx  # 3D model viewer
└── lib/
    └── sanity.ts         # Sanity client & queries

sanity/
├── schemaTypes/          # Content schemas
│   ├── manufacturer.ts
│   └── truckModel.ts
└── sanity.config.ts     # Sanity configuration
```

## Live Site

Visit [compactpickup.com](https://compactpickup.com) to see the live version.

## License

Private project - All rights reserved.