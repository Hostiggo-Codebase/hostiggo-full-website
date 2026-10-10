'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';

type DocumentType = 'Aadhaar Card' | 'PAN Card' | 'Passport' | null;

export default function IdentityVerificationPage() {
  const router = useRouter();
  const [selectedDoc, setSelectedDoc] = useState<DocumentType>(null);

  return (
    <div className="min-h-screen bg-figma-cream flex flex-col relative pb-[100px]">
      <Navbar />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-24 xl:px-40 py-8 lg:py-12 flex flex-col md:flex-row">
        {/* Left Side: Back button */}
        <div className="w-full md:w-[100px] shrink-0 flex flex-row md:flex-col items-center md:items-start mb-6 md:mb-0">
          <button 
            onClick={() => router.back()}
            className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-gray-200 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:bg-[#F9F9F9] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
          </button>
        </div>

        {/* Vertical Divider (matches Edit Profile logic) */}
        <div className="hidden lg:block w-[1px] bg-black/20 shrink-0 self-stretch md:mx-6 lg:mx-0 lg:mr-16"></div>

        {/* Right Side: Content */}
        <div className="flex-1 max-w-[550px]">
          <h1 className="text-[32px] md:text-[40px] font-bold text-gray-900 leading-tight mb-2">
            Identity Verification
          </h1>
          <p className="text-[#5F5F5F] text-[15px] font-normal mb-10 max-w-[850px] leading-[1.6]">
            Identity verification is mandatory for bookings and building trust among our hosts
          </p>

          <div className="max-w-[550px]">
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => setSelectedDoc('Aadhaar Card')}
                  className={`w-full bg-white border ${selectedDoc === 'Aadhaar Card' ? 'border-[#004772] ring-1 ring-[#004772]' : 'border-gray-200 hover:border-[#004772]'} rounded-[16px] p-5 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group`}
                >
                  <div className="flex items-center gap-5">
                    <img src="/verification/aadhaar.png" alt="Aadhaar Card" className="w-[32px] h-auto object-contain shrink-0" />
                    <span className="font-bold text-gray-900 text-[15px]">Aadhaar Card</span>
                  </div>
                  {selectedDoc === 'Aadhaar Card' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#004772]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  )}
                </button>

                <button 
                  onClick={() => setSelectedDoc('PAN Card')}
                  className={`w-full bg-white border ${selectedDoc === 'PAN Card' ? 'border-[#004772] ring-1 ring-[#004772]' : 'border-gray-200 hover:border-[#004772]'} rounded-[16px] p-5 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group`}
                >
                  <div className="flex items-center gap-5">
                    <img src="/verification/pan.png" alt="PAN Card" className="w-[32px] h-auto object-contain shrink-0" />
                    <span className="font-bold text-gray-900 text-[15px]">PAN Card</span>
                  </div>
                  {selectedDoc === 'PAN Card' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#004772]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  )}
                </button>

                <button 
                  onClick={() => setSelectedDoc('Passport')}
                  className={`w-full bg-white border ${selectedDoc === 'Passport' ? 'border-[#004772] ring-1 ring-[#004772]' : 'border-gray-200 hover:border-[#004772]'} rounded-[16px] p-5 flex items-center justify-between shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all group`}
                >
                  <div className="flex items-center gap-5">
                    <img src="/verification/passport.png" alt="Passport" className="w-[32px] h-auto object-contain shrink-0" />
                    <span className="font-bold text-gray-900 text-[15px]">Passport</span>
                  </div>
                  {selectedDoc === 'Passport' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#004772]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#004772]" />
                  )}
                </button>

              </div>
          </div>
        </div>
      </main>
    </div>
  );
}
