# Compact Pickup - React Fundamentals Project

## Overview
A React application showcasing compact and mid-size pickup trucks with a VHS-themed interface.

## React Fundamentals Demonstrated

### 1. Component-Based Architecture
- **HomePage**: Main page component with manufacturer selection
- **ImageCarousel**: Reusable carousel component for truck images
- **ManufacturerPage**: Dynamic page for manufacturer truck listings
- **TruckModelPage**: Individual truck model details
- **TimelinePage**: Historical timeline of truck models

### 2. JSX Syntax
- Dynamic content rendering with map functions
- Conditional rendering based on state
- Event handlers in JSX (onClick, onMouseEnter, onKeyDown)

### 3. State Management (useState)
```javascript
const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
const [allImages, setAllImages] = useState<TruckImageData[]>([])
const [currentTime, setCurrentTime] = useState('')
const [selectedIndex, setSelectedIndex] = useState(-1)
```

### 4. Props for Data Passing
- Parent components pass data to child components
- ImageCarousel receives images array as props
- Dynamic routing with manufacturer and model parameters

### 5. Event Handling
- Button clicks for navigation
- Keyboard navigation (arrow keys)
- Mouse events for menu selection
- Form interactions

### 6. Basic UI Elements
- Buttons, links, images, divs, spans
- Navigation elements
- Status indicators
- Responsive design

## Project Structure
```
src/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Homepage component
│   ├── [manufacturer]/    # Dynamic manufacturer pages
│   └── timeline/          # Timeline page
├── components/            # Reusable React components
│   ├── ImageCarousel.tsx  # Carousel component
│   └── TruckModel3D.tsx   # 3D model viewer
└── lib/                   # Utility functions
    └── sanity.ts          # Data fetching
```

## Deployment
- **Live URL**: https://compactpickup.vercel.app
- **GitHub**: https://github.com/jakedcl/compactpickup
- **Framework**: Next.js 15 with React 19

## Technologies Used
- React 19
- Next.js 15
- TypeScript
- Tailwind CSS
- Sanity CMS (for data)

## Learning Outcomes
This project demonstrates understanding of:
- React functional components
- JSX syntax and structure
- useState hook for state management
- Props for component communication
- Event handling in React
- Component composition and hierarchy