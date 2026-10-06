import Image from "next/image";
import React from "react";

export default function OnboardingSteps() {
  return (
    <section className="bg-[#F4F9FD] py-16 px-8 relative overflow-hidden">
      {/* Decorative blurred circles */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-blue-200 blur-3xl opacity-50 rounded-full -z-10"></div>
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-300 blur-3xl opacity-50 rounded-full -z-10"></div>

      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-3 text-center text-gray-900">
          How Host <span className="text-[#003B5C]">Onboarding</span> Works?
        </h2>
        <p className="text-xs tracking-[0.2em] font-semibold text-gray-500 text-center mb-16 uppercase">
          Start earning in 3 simple steps
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto items-center relative z-10">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-6 px-8 flex items-center gap-6">
              <span className="text-5xl font-extrabold text-[#003B5C]">1</span>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Create your listing</h3>
                <p className="text-sm text-gray-500 mt-1">Add photos, pricing rules & amenities</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-6 px-8 flex items-center gap-6">
              <span className="text-5xl font-extrabold text-[#003B5C]">2</span>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Get Bookings</h3>
                <p className="text-sm text-gray-500 mt-1">Approve manually or enable instant booking</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-6 px-8 flex items-center gap-6">
              <span className="text-5xl font-extrabold text-[#003B5C]">3</span>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Get Paid</h3>
                <p className="text-sm text-gray-500 mt-1">Payouts directly to your account</p>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Image
              src="/images/newpage/rocket.png"
              alt="Rocket"
              width={500}
              height={500}
              className="w-full max-w-md mx-auto object-contain drop-shadow-2xl hover:-translate-y-2 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
