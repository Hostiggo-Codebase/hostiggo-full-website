# Hostiggo - Hotel Booking Platform

A modern hotel booking platform with a **Next.js 16 App Router frontend**, **TypeScript backend**, and **Google Maps integration**.

> **Status**: Full production-ready application with search optimization, lazy loading, and native map integration.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Google Maps API Key (set in `.env.local`)

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd Hostiggo-website

# Install dependencies
npm install
```

### Environment Setup

Create `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
# Set to true to require Razorpay checkout for bookings. Defaults to false.
NEXT_PUBLIC_PAYMENTS_ENABLED=false

# Optional WhatsApp booking notifications
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+1555...
TWILIO_TEMPLATE_BOOKING_CONFIRMATION_GUEST_EN=HX...
TWILIO_TEMPLATE_BOOKING_RECEIVED_HOST_EN=HX...
```

### Development

```bash
# Start development server
npm run dev

# Server runs on http://localhost:3000
```

### Build & Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Technologies

### Frontend

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: React Context API
- **Maps**: Google Maps JavaScript API with SVG custom markers
- **Data Fetching**: Fetch API with typed service helpers
- **Forms**: React Hook Form
- **Infinite Scrolling**: Custom Intersection Observer hook
- **Icons**: Lucide React

### Backend

- **Runtime**: Node.js with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

## Key Features

### Search & Filtering

- **Real-time location search** with Google Places Autocomplete
- **Dynamic filters**: Price, rating, amenities, property types, bed types
- **Search persistence** via URL parameters
- **Circular fix**: Context circular dependency eliminated for smooth filtering

### Maps

- **Google Maps integration** for search results and property details
- **SVG custom markers** with property prices
- **Interactive markers** with click handlers
- **Auto-fit bounds** for multiple properties
- **Active marker highlighting** on list hover

### Performance

- **Lazy loading**: Automatic infinite scroll using Intersection Observer API
- **Pagination**: Server-side pagination with 50% scroll threshold
- **Optimized re-renders**: Context state management without circular dependencies
- **Debounced search**: Location and filter updates debounced to 300ms

### User Experience

- **Responsive design**: Mobile-first approach
- **Smooth animations**: Tailwind CSS animations with shimmer effects
- **Error handling**: Graceful fallbacks and loading states
- **Accessible UI**: ARIA labels and semantic HTML
- **Suspense & Streaming**: Next.js App Router Suspense boundaries with skeleton screens
- **Loading states**: Beautiful skeleton loaders during Supabase data fetches
- **Shimmer animations**: Premium loading indicators for property cards

## Recent Updates

### Search Performance Fix

- ✅ Eliminated circular dependencies in useEffect hooks
- ✅ Reduced excessive API calls on location change
- ✅ Fixed UI lag when typing in destination search
- ✅ Proper pagination reset on location change

### Google Maps Migration

- ✅ Migrated from Leaflet to Google Maps API
- ✅ Removed Map ID requirement (using standard markers)
- ✅ Custom SVG price tag markers
- ✅ Feature parity with React Native app

### Lazy Loading Implementation

- ✅ Automatic pagination on scroll (50% threshold)
- ✅ Intersection Observer API based
- ✅ No manual "Load More" button needed
- ✅ Smooth property list updates

### Suspense & Loading States

- ✅ Beautiful skeleton screens for property cards with shimmer animations
- ✅ Supabase fetch loading indicators with responsive UI
- ✅ Two skeleton variants: modern (with shimmer) and classic
- ✅ Smooth transitions between loading, success, and error states
- ✅ Next.js App Router Suspense boundaries for streaming data
- ✅ Reusable `LoadingState`, `PropertyCardSkeleton`, and `SearchPageSkeleton` components

## Development

Key files for development:

- `src/context/ListingFilterContext.tsx` - Search state management
- `src/components/features/InteractiveMap.tsx` - Google Maps integration
- `src/components/features/PropertyCardSkeleton.tsx` - Skeleton loading components
- `src/components/features/LoadingStates.tsx` - Reusable loading UI components
- `src/components/features/SearchPageSkeleton.tsx` - Search page loading fallback
- `src/hooks/useInfiniteScroll.ts` - Lazy loading logic
- `src/app/search/page.tsx` - Search results page with Suspense
- `src/lib/services/googleMaps.ts` - Google Maps service helpers

### Loading States

The app uses modern loading patterns:

```tsx
// Property card skeleton with shimmer
<PropertyCardSkeleton variant="modern" />

// General loading indicator
<LoadingState state="loading" variant="dots" message="Loading..." />

// Search page fallback
<SearchPageSkeleton />
```
