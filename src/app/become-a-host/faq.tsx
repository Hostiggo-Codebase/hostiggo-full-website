'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: "Who can become a host on Hostiggo?",
    answer: "Anyone with a property to share can become a host. Whether it's a spare room, a whole home, or a unique space, you can list it on Hostiggo."
  },
  {
    question: "Do i need to register a company to host on Hostiggo?",
    answer: "No, you do not need to register a company. Individuals can host just as easily as registered businesses."
  },
  {
    question: "When and how do i receive my payments",
    answer: "Payments are typically processed 24 hours after your guest checks in. You can receive payments via bank transfer, PayPal, or other supported methods in your region."
  },
  {
    question: "Is my back account information secure",
    answer: "Yes. Hostiggo uses secure and encrypted payment systems, and bank details are never shared with guests."
  },
  {
    question: "How does Hostiggo prevent fake bookings and fraud",
    answer: "We use advanced verification systems for guests, secure messaging, and strict payment protocols to ensure every booking is legitimate."
  },
  {
    question: "What if a guest damages my property",
    answer: "Hostiggo provides comprehensive host protection, covering eligible property damage during a stay. We also require security deposits for added peace of mind."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-white py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">
          Frequently Asked Questions
        </h2>

        <div className="flex flex-col">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <div key={index} className="border-b border-gray-200">
                <div 
                  className="flex justify-between items-center py-5 cursor-pointer"
                  onClick={() => toggleFAQ(index)}
                >
                  <h3 className="text-[15px] font-semibold text-gray-800">
                    {faq.question}
                  </h3>
                  <ChevronDown className={`text-gray-500 w-5 h-5 flex-shrink-0 ml-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                
                {isOpen && (
                  <div className="pr-12 pb-5">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-16 text-center flex flex-col items-center">
          <h3 className="text-lg font-bold text-gray-900">Still have questions?</h3>
          <p className="text-sm text-gray-500 mt-1">Our support team is here to help</p>
          <button className="bg-[#003B5C] text-white rounded-full px-8 py-2.5 mt-6 font-medium hover:bg-[#002f4a] transition-colors">
            Contact us
          </button>
        </div>
      </div>
    </div>
  );
}
