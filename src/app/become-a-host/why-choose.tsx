'use client';

import Image from 'next/image';

export default function WhyChoose() {
  return (
    <section className="py-16 px-8 max-w-5xl mx-auto relative">
      {/* Main Title */}
      <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
        <span className="text-gray-900">Why </span>
        <span className="text-[#003B5C]">Choose</span>
        <span className="text-gray-900"> Hostiggo?</span>
      </h2>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
        {/* Card 1 */}
        <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-yellow-500 font-bold text-lg mb-3">
            Low Commission
          </h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            0% on first 10 booking, 2% after 10 bookings. Lowest commission in compare to other available platforms.
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-gray-800 font-bold text-lg mb-3">
            Earn Beyond Stays
          </h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Add paid services like meals, transports & experience. Edit services and earn, with no extra hidden charges.
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-gray-800 font-bold text-lg mb-3">
            Secure & Transparent
          </h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Verified users, secure payouts, clear policies.
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-gray-800 font-bold text-lg mb-3">
            Fully Controlled By YOU
          </h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Approve guests, pause listing, set prices, edit anytime, all according to you.
          </p>
        </div>
      </div>

      {/* Bottom Graphic */}
      <div className="flex justify-center items-center mt-12 md:mt-16 relative z-0">
        {/* Glow */}
        <div className="absolute w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        
        <Image
          src="/images/newpage/girl-jumping.png"
          alt="Girl Jumping Illustration"
          width={400}
          height={320}
          className="h-64 md:h-80 w-auto object-contain drop-shadow-lg"
        />
      </div>
    </section>
  );
}
