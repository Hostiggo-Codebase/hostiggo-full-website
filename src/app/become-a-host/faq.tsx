'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const faqs = [
  {
    question: "Who can become a host on Hostiggo?",
    answer: "Content coming soon..."
  },
  {
    question: "Do I need to register a company to host on Hostiggo?",
    answer: "Content coming soon..."
  },
  {
    question: "When and how do I receive my payments?",
    answer: "Content coming soon..."
  },
  {
    question: "Is my bank account information secure?",
    answer: "Yes. Hostiggo uses secure and encrypted payment systems, and bank details are never shared with guests."
  },
  {
    question: "How does Hostiggo prevent fake bookings and fraud?",
    answer: "Content coming soon..."
  },
  {
    question: "What if a guest damages my property?",
    answer: "Content coming soon..."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(3);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-lg p-8 md:p-12 max-w-4xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-10">
        Frequently Asked Questions
      </h2>

      <div className="flex flex-col">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          const isLast = index === faqs.length - 1;

          return (
            <div key={index} className={!isLast ? 'border-b border-gray-200' : ''}>
              <div 
                className="flex justify-between items-center py-5 cursor-pointer"
                onClick={() => toggleFAQ(index)}
              >
                <h3 className="text-[15px] font-semibold text-gray-800">
                  {faq.question}
                </h3>
                {isOpen ? (
                  <ChevronUp className="text-gray-500 w-5 h-5 flex-shrink-0 ml-4" />
                ) : (
                  <ChevronDown className="text-gray-500 w-5 h-5 flex-shrink-0 ml-4" />
                )}
              </div>
              
              {isOpen && (
                <div className="pl-4 pr-12 pb-5">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
