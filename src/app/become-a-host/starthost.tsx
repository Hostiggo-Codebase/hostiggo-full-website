import Image from "next/image";
import Link from "next/link";

export default function StartHost() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-blue-50 to-white font-sans">
      {/* Decorative Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-100/50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-blue-50/60 rounded-full mix-blend-multiply filter blur-3xl opacity-70 -translate-x-1/3 translate-y-1/3"></div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 flex justify-between items-center py-6 px-8 max-w-7xl mx-auto">
        {/* Left: Logo */}
        <div className="flex items-center">
          <div className="relative w-10 h-10 bg-[#003B5C] rounded-full flex justify-center items-center">
            <span className="text-white text-2xl font-bold leading-none">
              h
            </span>
            <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex gap-8">
          <Link
            href="#"
            className="text-blue-900 font-medium hover:text-[#003B5C] transition-colors"
          >
            Why Hostiggo?
          </Link>
          <Link
            href="#"
            className="text-blue-900 font-medium hover:text-[#003B5C] transition-colors"
          >
            How it works?
          </Link>
        </nav>

        {/* Right: Sign In Button */}
        <div>
          <Link
            href="#"
            className="inline-block border border-blue-900 text-blue-900 rounded-lg px-6 py-2 font-medium hover:bg-blue-50 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 grid grid-cols-1 md:grid-cols-2 items-center max-w-7xl mx-auto mt-12 px-8">
        {/* Left Column (Typography & Call-to-Action) */}
        <div className="flex flex-col justify-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4 leading-tight">
            Become a host
          </h1>

          <p className="text-gray-600 font-medium mb-2 text-lg">
            Add Services • Manage bookings • Get Paid Securely
          </p>

          <p className="text-sm tracking-widest text-gray-400 mb-10 uppercase font-semibold">
            ALL IN ONE PLACE
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="#"
              className="bg-[#003B5C] text-white px-8 py-3 rounded-lg font-medium shadow-md hover:bg-blue-900 transition-colors inline-flex justify-center items-center"
            >
              Get Started
            </Link>
            <Link
              href="#"
              className="border border-[#003B5C] text-[#003B5C] px-8 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors group"
            >
              Learn More
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              >
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </Link>
          </div>
        </div>

        {/* Right Column (House Graphic) */}
        <div className="mt-12 md:mt-0 flex justify-end">
          <div className="w-full max-w-lg ml-auto">
            <Image
              src="/images/newpage/Housse.png"
              alt="3D House Illustration"
              width={600}
              height={500}
              className="w-full object-contain drop-shadow-xl"
              priority
            />
          </div>
        </div>
      </main>
    </div>
  );
}
