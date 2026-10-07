import StartHost from './starthost';
import WhyChoose from './why-choose';
import OnboardingSteps from './onboarding-steps';
import FAQ from './faq';
import Footer from '@/components/layout/Footer';

export default function BecomeAHostPage() {
  return (
    <main className="flex flex-col min-h-screen bg-white overflow-hidden">
      <StartHost />
      <WhyChoose />
      <OnboardingSteps />
      <FAQ />
      <Footer />
    </main>
  );
}
