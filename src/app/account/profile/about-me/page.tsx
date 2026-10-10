'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Plus, X, Check, AlertCircle } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { useAuth } from '@/context/AuthContext';

const modalOptionsMap: Record<string, string[]> = {
  'brings-you-here': ['Travel', 'New experiences', 'Friends', 'Something else?'],
  'travel-vibe': ['Chill & Relax', 'Adventure', 'Foodie', 'Culture', 'Something else?'],
  'meeting-people': ['Yes, absolutely!', 'Sometimes', 'I prefer staying to myself', 'Something else?'],
  'house-party': ['House party', 'Quiet evening', 'Something else?'],
  'remember-about-you': ['My stories', 'My cooking', 'My jokes', 'Something else?'],
};

export default function AboutMePage() {
  const router = useRouter();
  const { updateProfile } = useAuth();
  const [localAboutMe, setLocalAboutMe] = useState<Record<string, string[]>>({});
  const [localSomethingElse, setLocalSomethingElse] = useState<Record<string, string>>({});
  
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  // Modal local state
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [somethingElseText, setSomethingElseText] = useState<string>('');
  const [showError, setShowError] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (activeModal) {
      setSelectedOptions(localAboutMe[activeModal] || []);
      setSomethingElseText(localSomethingElse[activeModal] || '');
      setShowError(false);
    }
  }, [activeModal, localAboutMe, localSomethingElse]);

  const questions = [
    { id: 'brings-you-here', text: 'What brings you here?' },
    { id: 'travel-vibe', text: 'Your travel vibe?' },
    { id: 'meeting-people', text: 'Are you comfortable meeting new people while traveling?' },
    { id: 'house-party', text: 'House party or quiet evening?' },
    { id: 'remember-about-you', text: 'What\'s one thing people remember about you after a trip?' },
  ];

  const handleOptionToggle = (option: string) => {
    setShowError(false);
    setSelectedOptions((prev) => 
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  const handleDone = () => {
    if (selectedOptions.length === 0) {
      setShowError(true);
      return;
    }
    
    if (activeModal) {
      setLocalAboutMe(prev => ({ ...prev, [activeModal]: selectedOptions }));
      setLocalSomethingElse(prev => ({ ...prev, [activeModal]: selectedOptions.includes('Something else?') ? somethingElseText : '' }));
    }
    // Save to context
    if (updateProfile && activeModal) {
      updateProfile({
        aboutMe: { [activeModal]: selectedOptions },
        somethingElse: { [activeModal]: selectedOptions.includes('Something else?') ? somethingElseText : '' }
      });
    }
    setActiveModal(null);
  };

  const hasAnyAnswers = Object.keys(localAboutMe).length > 0;

  return (
    <div className="min-h-screen bg-figma-cream flex flex-col relative pb-[100px]">
      <Navbar />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 lg:px-24 xl:px-40 py-8 lg:py-12 flex flex-col md:flex-row">
        {/* Left Side: Back button */}
        <div className="w-full md:w-[100px] shrink-0 flex flex-row md:flex-col items-center md:items-start mb-6 md:mb-0">
          <button 
            onClick={() => router.push('/account/profile')}
            className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-gray-200 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:bg-[#F9F9F9] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
          </button>
        </div>

        {/* Right Side: Content */}
        <div className="flex-1 md:pl-12 lg:pl-16">
          <h1 className="text-[32px] md:text-[40px] font-bold text-gray-900 leading-tight mb-4 relative md:-left-[50px]">
            About Me
          </h1>
          <p className="text-[#5F5F5F] text-[15px] font-normal mb-10 max-w-[850px] leading-[1.6] relative md:-left-[50px]">
            Tell others a bit about yourself. Share your interests, travel style, hobbies, profession, or anything that helps hosts and guests get to know you better.
          </p>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-8 relative">
            {/* Left Column: Questions */}
            <div className="w-full lg:w-[70%] max-w-[1000px] space-y-4 relative z-10 lg:mr-[-60px] xl:mr-[-80px] md:-left-[50px]">
              {questions.map((q) => {
                const answers = localAboutMe[q.id] || [];
                const hasAnswers = answers.length > 0;
                
                return (
                  <button
                    key={q.id}
                    onClick={() => setActiveModal(q.id)}
                    className="w-full bg-[#F4F6F8] rounded-[20px] p-5 md:p-6 flex items-start justify-between border border-transparent hover:border-[#004772] hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex flex-col gap-1 pr-4">
                      <span className="font-semibold text-[16px] md:text-[17px] text-gray-900">
                        {q.text}
                      </span>
                      {hasAnswers && (
                        <div className="flex items-center gap-3 mt-2">
                          <div className="w-[4px] h-[33px] bg-[#838383] rounded-r-[3px] shrink-0"></div>
                          <span className="text-[#434343]/80 font-medium italic text-[20px] leading-none">
                            {answers.filter(a => a !== 'Something else?').join(', ')}
                            {answers.includes('Something else?') && (
                              <>{answers.length > 1 ? ', ' : ''}{localSomethingElse[q.id]}</>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={`w-10 h-10 mt-0.5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                      hasAnswers 
                        ? 'bg-[#004772] border-[#004772] text-white' 
                        : 'border-gray-200 text-gray-400 group-hover:bg-[#004772] group-hover:border-[#004772] group-hover:text-white'
                    }`}>
                      {hasAnswers ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Illustration */}
            <div className="w-full lg:w-[30%] flex justify-start items-start pt-8 lg:pt-0">
              <div className="relative w-[634px] h-[346px] lg:ml-[10px] xl:ml-[30px] lg:mt-[20px] shrink-0 max-w-[100vw] lg:max-w-[none] z-0 pointer-events-none">
                <Image
                  src="/images/empty-states/yeti-thinking.png"
                  alt="Yeti Illustration"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 md:p-6 z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-[1440px] mx-auto px-6 lg:pl-24 xl:pl-40 lg:pr-[200px] xl:pr-[350px] flex justify-end">
          <button 
            onClick={() => router.push('/account/profile')}
            disabled={!hasAnyAnswers}
            className={`px-10 py-3 rounded-[12px] font-semibold text-[16px] w-full md:w-auto md:min-w-[140px] transition-colors ${
              hasAnyAnswers 
                ? 'bg-[#004772] text-white hover:bg-[#003655]' 
                : 'bg-[#E5E7EB] text-gray-400 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </div>

      {/* Modal structure */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="bg-white w-full max-w-[960px] md:h-[639px] rounded-[32px] md:rounded-[53px] overflow-hidden shadow-2xl relative flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:px-[60px] md:pt-[50px] md:pb-6 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-[24px] md:text-[32px] font-bold text-gray-900 leading-tight">
                  {questions.find((q) => q.id === activeModal)?.text}
                </h2>
                <button 
                  onClick={() => setActiveModal(null)}
                  className="w-10 h-10 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors -mt-2 -mr-4"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
              <p className="text-[#5F5F5F] text-[16px] md:text-[18px]">
                Select the reasons that best describe what you’re looking for. We’ll personalize your experience accordingly.
              </p>
            </div>
            
            <div className="p-6 md:px-[60px] md:py-2 overflow-y-auto flex-1 flex flex-col gap-6">
              {modalOptionsMap[activeModal]?.map((option) => {
                const isSelected = selectedOptions.includes(option);
                return (
                  <button 
                    key={option}
                    onClick={() => handleOptionToggle(option)}
                    className="flex items-center gap-5 cursor-pointer group text-left w-full"
                  >
                    <div className={`w-7 h-7 rounded flex items-center justify-center border transition-colors shrink-0 ${
                      isSelected 
                        ? 'bg-[#004772] border-[#004772]' 
                        : 'border-gray-300 group-hover:border-[#004772]'
                    }`}>
                      {isSelected && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-[18px] md:text-[20px] text-gray-900 font-medium">{option}</span>
                  </button>
                );
              })}

              {selectedOptions.includes('Something else?') && (
                <div className="mt-2 ml-12">
                  <div className="relative md:w-[665px]">
                    <textarea
                      value={somethingElseText}
                      onChange={(e) => setSomethingElseText(e.target.value.slice(0, 50))}
                      placeholder="please specify here"
                      className="w-full h-[80px] bg-transparent rounded-[16px] p-4 text-[16px] text-gray-900 border border-[#7E7E7E] focus:border-[#004772] focus:ring-1 focus:ring-[#004772] outline-none resize-none"
                    />
                    <div className="absolute bottom-3 right-4 text-[14px] text-gray-400 font-medium">
                      {somethingElseText.length}/50
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 md:px-[60px] md:pb-[50px] flex flex-row items-center gap-5 mt-auto">
              <button 
                onClick={handleDone}
                className="px-12 py-3.5 rounded-[12px] font-semibold bg-[#004772] text-white hover:bg-[#003655] transition-colors text-[18px]"
              >
                Done
              </button>
              {showError && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-[18px] h-[18px] text-[#E02424]" />
                  <p className="text-[#E02424] text-[16px] font-medium">
                    Please select field first
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
